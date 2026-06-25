from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Favorite, Playlist, PlaylistItem, Track, User
from ..schemas import (
    PlaylistCreate,
    PlaylistReorder,
    PlaylistSummary,
    PlaylistTrackIn,
    TrackOut,
)

router = APIRouter(prefix="/api", tags=["playlists"])


async def _track_owned(track_id: int, user: User, session: AsyncSession) -> Track:
    """Garante que a faixa pertence ao usuário (ou admin) e a retorna."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if not user.is_admin:
        band = await session.get(Band, track.band_id)
        archive = await session.get(Archive, band.archive_id) if band else None
        if archive is None or archive.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Acesso negado.")
    return track


async def _favorite_ids(user_id: int, session: AsyncSession) -> set[int]:
    res = await session.execute(
        select(Favorite.track_id).where(Favorite.owner_id == user_id)
    )
    return set(res.scalars().all())


def _track_out(track: Track, fav_ids: set[int]) -> TrackOut:
    return TrackOut(
        id=track.id,
        band_id=track.band_id,
        name=track.name,
        display_name=track.display_name,
        size=track.size,
        index=track.index,
        duration=track.duration,
        is_favorite=track.id in fav_ids,
    )


# ---------------- Favoritos ----------------
@router.put("/favorites/{track_id}", status_code=204)
async def add_favorite(
    track_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _track_owned(track_id, user, session)
    exists = await session.execute(
        select(Favorite).where(
            Favorite.owner_id == user.id, Favorite.track_id == track_id
        )
    )
    if exists.scalar_one_or_none() is None:
        session.add(Favorite(owner_id=user.id, track_id=track_id))
        await session.commit()
    return Response(status_code=204)


@router.delete("/favorites/{track_id}", status_code=204)
async def remove_favorite(
    track_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await session.execute(
        delete(Favorite).where(
            Favorite.owner_id == user.id, Favorite.track_id == track_id
        )
    )
    await session.commit()
    return Response(status_code=204)


@router.get("/favorites", response_model=list[TrackOut])
async def list_favorites(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TrackOut]:
    res = await session.execute(
        select(Track)
        .join(Favorite, Favorite.track_id == Track.id)
        .where(Favorite.owner_id == user.id)
        .order_by(Favorite.created_at.desc())
    )
    tracks = list(res.scalars().all())
    fav_ids = {t.id for t in tracks}
    return [_track_out(t, fav_ids) for t in tracks]


# ---------------- Playlists ----------------
@router.get("/playlists", response_model=list[PlaylistSummary])
async def list_playlists(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PlaylistSummary]:
    count_subq = (
        select(PlaylistItem.playlist_id, func.count(PlaylistItem.id).label("c"))
        .group_by(PlaylistItem.playlist_id)
        .subquery()
    )
    res = await session.execute(
        select(Playlist, func.coalesce(count_subq.c.c, 0))
        .outerjoin(count_subq, Playlist.id == count_subq.c.playlist_id)
        .where(Playlist.owner_id == user.id)
        .order_by(Playlist.created_at.desc())
    )
    return [
        PlaylistSummary(id=p.id, name=p.name, track_count=c) for p, c in res.all()
    ]


@router.post("/playlists", response_model=PlaylistSummary, status_code=201)
async def create_playlist(
    body: PlaylistCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlaylistSummary:
    pl = Playlist(owner_id=user.id, name=body.name.strip())
    session.add(pl)
    await session.commit()
    await session.refresh(pl)
    return PlaylistSummary(id=pl.id, name=pl.name, track_count=0)


async def _owned_playlist(playlist_id: int, user: User, session: AsyncSession) -> Playlist:
    pl = await session.get(Playlist, playlist_id)
    if pl is None or pl.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Playlist não encontrada.")
    return pl


@router.delete("/playlists/{playlist_id}", status_code=204)
async def delete_playlist(
    playlist_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    pl = await _owned_playlist(playlist_id, user, session)
    await session.delete(pl)
    await session.commit()
    return Response(status_code=204)


@router.get("/playlists/{playlist_id}/tracks", response_model=list[TrackOut])
async def playlist_tracks(
    playlist_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TrackOut]:
    await _owned_playlist(playlist_id, user, session)
    res = await session.execute(
        select(Track)
        .join(PlaylistItem, PlaylistItem.track_id == Track.id)
        .where(PlaylistItem.playlist_id == playlist_id)
        .order_by(PlaylistItem.position)
    )
    tracks = list(res.scalars().all())
    fav_ids = await _favorite_ids(user.id, session)
    return [_track_out(t, fav_ids) for t in tracks]


@router.post("/playlists/{playlist_id}/tracks", status_code=204)
async def add_to_playlist(
    playlist_id: int,
    body: PlaylistTrackIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _owned_playlist(playlist_id, user, session)
    await _track_owned(body.track_id, user, session)
    # Próxima posição (fim da lista).
    res = await session.execute(
        select(func.coalesce(func.max(PlaylistItem.position), -1)).where(
            PlaylistItem.playlist_id == playlist_id
        )
    )
    pos = int(res.scalar_one()) + 1
    session.add(
        PlaylistItem(playlist_id=playlist_id, track_id=body.track_id, position=pos)
    )
    await session.commit()
    return Response(status_code=204)


@router.put("/playlists/{playlist_id}/order", status_code=204)
async def reorder_playlist(
    playlist_id: int,
    body: PlaylistReorder,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Reordena as faixas da playlist conforme a lista de track_ids enviada."""
    await _owned_playlist(playlist_id, user, session)
    res = await session.execute(
        select(PlaylistItem).where(PlaylistItem.playlist_id == playlist_id)
    )
    items = {it.track_id: it for it in res.scalars().all()}
    pos = 0
    for tid in body.track_ids:
        item = items.get(tid)
        if item is not None:
            item.position = pos
            pos += 1
    await session.commit()
    return Response(status_code=204)


@router.delete("/playlists/{playlist_id}/tracks/{track_id}", status_code=204)
async def remove_from_playlist(
    playlist_id: int,
    track_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _owned_playlist(playlist_id, user, session)
    await session.execute(
        delete(PlaylistItem).where(
            PlaylistItem.playlist_id == playlist_id,
            PlaylistItem.track_id == track_id,
        )
    )
    await session.commit()
    return Response(status_code=204)
