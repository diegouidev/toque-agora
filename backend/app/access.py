"""Autorização de acesso a faixas/bandas.

Centraliza a regra de quem pode ouvir/ver uma faixa: o dono do arquivo, o admin,
ou um usuário com quem alguma playlist contendo a faixa foi compartilhada.
"""

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Archive, Band, PlaylistItem, PlaylistShare, Track, User


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
    """Admin, dono do arquivo, ou destinatário de uma playlist com a faixa."""
    if user.is_admin:
        return True
    band = await session.get(Band, track.band_id)
    archive = await session.get(Archive, band.archive_id) if band else None
    if archive is not None and archive.owner_id == user.id:
        return True
    return await track_shared_with(session, user.id, track.id)


async def can_access_band(
    session: AsyncSession, user: User, band_id: int
) -> bool:
    """Acesso à banda (ex.: capa): dono/admin, ou alguma faixa dela compartilhada."""
    if user.is_admin:
        return True
    band = await session.get(Band, band_id)
    if band is None:
        return False
    archive = await session.get(Archive, band.archive_id)
    if archive is not None and archive.owner_id == user.id:
        return True
    # Alguma faixa desta banda está numa playlist compartilhada com o usuário?
    stmt = select(
        exists().where(
            PlaylistShare.shared_with_id == user.id,
            PlaylistItem.playlist_id == PlaylistShare.playlist_id,
            PlaylistItem.track_id == Track.id,
            Track.band_id == band_id,
        )
    )
    return bool(await session.scalar(stmt))
