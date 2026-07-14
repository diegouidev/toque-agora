"""Inscrições Web Push: chave pública VAPID + registrar/remover dispositivo."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_session
from ..models import PushSubscription, User
from ..push_service import ensure_vapid_keys
from ..schemas import PushKeyOut, PushSubscribeIn, PushUnsubscribeIn

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/key", response_model=PushKeyOut)
async def push_key(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PushKeyOut:
    """Chave pública VAPID (applicationServerKey) para o navegador se inscrever."""
    _, public = await ensure_vapid_keys(session)
    return PushKeyOut(key=public)


@router.post("/subscribe", status_code=204)
async def subscribe(
    body: PushSubscribeIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Registra (ou re-associa) a inscrição deste dispositivo ao usuário logado."""
    existing = await session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if existing is not None:
        # Mesmo navegador, outro login: a inscrição segue o usuário atual.
        existing.user_id = user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        session.add(
            PushSubscription(
                user_id=user.id,
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
            )
        )
    await session.commit()
    return Response(status_code=204)


@router.post("/unsubscribe", status_code=204)
async def unsubscribe(
    body: PushUnsubscribeIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Remove a inscrição deste dispositivo (só a do próprio usuário)."""
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    await session.commit()
    return Response(status_code=204)
