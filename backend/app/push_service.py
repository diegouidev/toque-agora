"""Web Push (PWA): chaves VAPID, alvo das notificações e envio.

As chaves VAPID são geradas na primeira utilização e guardadas em app_config
(cada instância tem o próprio par, sem mexer no .env). O envio usa pywebpush
(bloqueante) e roda fora do event loop; endpoints mortos são removidos.
"""

import asyncio
import base64
import json
import logging
from datetime import datetime, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .app_settings import get_config, set_config
from .config import settings
from .database import async_session_maker
from .models import Band, PushSubscription, User, band_categories, plan_categories

logger = logging.getLogger("toqueagora.push")

# Tarefas de envio em andamento (referência forte para o GC não cancelá-las).
_tasks: set[asyncio.Task] = set()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


async def ensure_vapid_keys(session: AsyncSession) -> tuple[str, str]:
    """(privada, pública) em base64url — gera e persiste na primeira chamada.

    A pública é a `applicationServerKey` que o navegador usa ao se inscrever.
    """
    priv = await get_config(session, "vapid_private_key")
    pub = await get_config(session, "vapid_public_key")
    if priv and pub:
        return priv, pub
    key = ec.generate_private_key(ec.SECP256R1())
    priv = _b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    pub = _b64url(
        key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
    )
    await set_config(session, "vapid_private_key", priv)
    await set_config(session, "vapid_public_key", pub)
    return priv, pub


def _send_one(sub_info: dict, payload: str, private_key: str) -> bool:
    """Envia UMA notificação (bloqueante). True = inscrição morta (remover)."""
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush não instalado; push desativado.")
        return False
    try:
        webpush(
            subscription_info=sub_info,
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": f"mailto:{settings.admin_email}"},
            ttl=24 * 3600,  # CD novo de ontem ainda interessa; mais que isso não
        )
        return False
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            return True  # endpoint expirado/cancelado no navegador
        logger.warning("Falha ao enviar push (%s): %s", status, exc)
        return False
    except Exception as exc:
        logger.warning("Falha inesperada ao enviar push: %s", exc)
        return False


async def _notify_new_bands(band_ids: list[int], owner_id: int) -> None:
    """Notifica os assinantes com plano que cobre os CDs recém-enviados."""
    async with async_session_maker() as session:
        bands = list(
            (
                await session.execute(
                    select(Band).where(Band.id.in_(band_ids), Band.is_hidden.is_(False))
                )
            )
            .scalars()
            .all()
        )
        if not bands:
            return
        cat_ids = set(
            (
                await session.execute(
                    select(band_categories.c.category_id).where(
                        band_categories.c.band_id.in_([b.id for b in bands])
                    )
                )
            )
            .scalars()
            .all()
        )
        if not cat_ids:
            return  # CD sem categoria não entra em nenhum plano — ninguém a avisar

        # Inscrições de usuários ativos cujo plano (válido) cobre alguma categoria,
        # exceto o próprio dono do upload.
        now = datetime.now(timezone.utc)
        subs = list(
            (
                await session.execute(
                    select(PushSubscription)
                    .join(User, User.id == PushSubscription.user_id)
                    .join(plan_categories, plan_categories.c.plan_id == User.plan_id)
                    .where(
                        plan_categories.c.category_id.in_(cat_ids),
                        User.is_active.is_(True),
                        User.id != owner_id,
                        or_(
                            User.plan_expires_at.is_(None),
                            User.plan_expires_at >= now,
                        ),
                    )
                    .distinct()
                )
            )
            .scalars()
            .all()
        )
        if not subs:
            return

        first = bands[0].name
        body = (
            first
            if len(bands) == 1
            else f"{first} e mais {len(bands) - 1} CD{'s' if len(bands) > 2 else ''}"
        )
        payload = json.dumps(
            {
                "title": "CD novo no TOQUE AGORA 🎵",
                "body": body,
                "url": "/novidades",
            }
        )
        private_key, _ = await ensure_vapid_keys(session)

        dead: list[int] = []
        for sub in subs:
            info = {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            }
            # pywebpush é bloqueante (requests) — roda em thread.
            if await asyncio.to_thread(_send_one, info, payload, private_key):
                dead.append(sub.id)
        if dead:
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id.in_(dead))
            )
            await session.commit()
        logger.info(
            "Push de CD novo: %d envio(s), %d inscrição(ões) removida(s).",
            len(subs) - len(dead),
            len(dead),
        )


def schedule_new_band_notifications(bands: list[Band], owner_id: int) -> None:
    """Dispara as notificações em segundo plano (não atrasa a resposta do upload)."""
    ids = [b.id for b in bands]
    if not ids:
        return

    async def runner() -> None:
        try:
            await _notify_new_bands(ids, owner_id)
        except Exception:
            logger.exception("Falha ao notificar CDs novos")

    task = asyncio.get_running_loop().create_task(runner())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
