"""Autorização de acesso a faixas/bandas.

Quem pode ouvir/ver uma faixa: o dono do arquivo, o admin, um usuário com quem
uma playlist contendo a faixa foi compartilhada, OU um ouvinte cujo **plano**
inclui alguma categoria daquela banda (venda de repertório).
"""

from datetime import datetime, timezone

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Archive,
    Band,
    Plan,
    PlaylistItem,
    PlaylistShare,
    Track,
    User,
    band_categories,
    plan_categories,
)


def _plan_is_valid(user: User) -> bool:
    """O plano vale se há plan_id e não está vencido (assinatura em dia)."""
    if user.plan_id is None:
        return False
    if user.plan_expires_at is None:
        return True  # plano sem expiração (ex.: cortesia do admin)
    return user.plan_expires_at >= datetime.now(timezone.utc)


async def plan_category_ids(session: AsyncSession, user: User) -> set[int]:
    """Categorias liberadas pelo plano do usuário (vazio se sem plano ou vencido)."""
    if not _plan_is_valid(user):
        return set()
    res = await session.execute(
        select(plan_categories.c.category_id).where(
            plan_categories.c.plan_id == user.plan_id
        )
    )
    return set(res.scalars().all())


# ---------------- Vitrine pública ----------------
async def public_category_ids(session: AsyncSession) -> set[int]:
    """Categorias que pertencem a algum plano PAGO (price_cents > 0).

    São elas que definem quais CDs entram na vitrine pública (sem login).
    """
    res = await session.execute(
        select(plan_categories.c.category_id)
        .join(Plan, Plan.id == plan_categories.c.plan_id)
        .where(Plan.price_cents > 0)
    )
    return set(res.scalars().all())


async def band_is_public(session: AsyncSession, band_id: int) -> bool:
    """Todo CD do catálogo é público na vitrine (capa/tracklist/prévia de 30s).

    A reprodução COMPLETA continua restrita a assinantes cujo plano cobre a
    categoria do CD (ver can_access_band). Só admin/uploader cria CDs, então
    todas as bandas são itens de catálogo.
    """
    return await session.get(Band, band_id) is not None


async def _band_in_plan(session: AsyncSession, user: User, band_id: int) -> bool:
    """True se a banda tem alguma categoria dentro do plano (válido) do usuário."""
    if not _plan_is_valid(user):
        return False
    stmt = select(
        exists().where(
            band_categories.c.band_id == band_id,
            band_categories.c.category_id == plan_categories.c.category_id,
            plan_categories.c.plan_id == user.plan_id,
        )
    )
    return bool(await session.scalar(stmt))


async def track_shared_with(
    session: AsyncSession, user_id: int, track_id: int
) -> bool:
    """True se a faixa está em alguma playlist compartilhada com o usuário."""
    stmt = select(
        exists().where(
            PlaylistShare.shared_with_id == user_id,
            PlaylistItem.playlist_id == PlaylistShare.playlist_id,
            PlaylistItem.track_id == track_id,
        )
    )
    return bool(await session.scalar(stmt))


async def can_access_track(
    session: AsyncSession, user: User, track: Track
) -> bool:
    """Admin, dono, playlist compartilhada, ou plano que inclui a categoria da banda."""
    if user.is_admin:
        return True
    band = await session.get(Band, track.band_id)
    archive = await session.get(Archive, band.archive_id) if band else None
    if archive is not None and archive.owner_id == user.id:
        return True
    if band is not None and await _band_in_plan(session, user, band.id):
        return True
    return await track_shared_with(session, user.id, track.id)


async def can_access_band(
    session: AsyncSession, user: User, band_id: int
) -> bool:
    """Acesso à banda (ex.: capa/faixas): dono/admin, plano, ou playlist compartilhada."""
    if user.is_admin:
        return True
    band = await session.get(Band, band_id)
    if band is None:
        return False
    archive = await session.get(Archive, band.archive_id)
    if archive is not None and archive.owner_id == user.id:
        return True
    if await _band_in_plan(session, user, band_id):
        return True
    stmt = select(
        exists().where(
            PlaylistShare.shared_with_id == user.id,
            PlaylistItem.playlist_id == PlaylistShare.playlist_id,
            PlaylistItem.track_id == Track.id,
            Track.band_id == band_id,
        )
    )
    return bool(await session.scalar(stmt))
