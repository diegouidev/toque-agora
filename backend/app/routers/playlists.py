from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import can_access_track
from ..auth import get_current_user, get_user_by_email
from ..database import get_session
from ..models import (
    Archive,
    Band,
    Favorite,
    Playlist,
    PlaylistItem,
    PlaylistShare,
    Track,
    User,
)
from ..schemas import (
    PlaylistCreate,
    PlaylistReorder,
    PlaylistShareIn,
    PlaylistShareOut,
    PlaylistSummary,
    PlaylistTrackIn,
    TrackOut,
)

router = APIRouter(prefix="/api", tags=["playlists"])


async def _track_accessible(track_id: int, user: User, session: AsyncSession) -> Track:
    """Garante que o usuário pode acessar a faixa e a retorna.

    Aceita dono, admin, ouvinte cujo plano cobre o CD, ou destinatário de uma
    playlist compartilhada — o mesmo critério do streaming (can_access_track).
    Assim, um assinante pode curtir/adicionar à playlist as faixas que ouve.
    """
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if not await can_access_track(session, user, track):
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
    await _track_accessible(track_id, user, session)
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


async def _shared_with(playlist_id: int, user_id: int, session: AsyncSession) -> bool:
    res = await session.execute(
        select(PlaylistShare.id).where(
            PlaylistShare.playlist_id == playlist_id,
            PlaylistShare.shared_with_id == user_id,
        )
    )
    return res.first() is not None


async def _owned_or_shared_playlist(
    playlist_id: int, user: User, session: AsyncSession
) -> Playlist:
    """Leitura: o dono OU alguém com quem a playlist foi compartilhada."""
    pl = await session.get(Playlist, playlist_id)
    if pl is None:
        raise HTTPException(status_code=404, detail="Playlist não encontrada.")
    if pl.owner_id == user.id or await _shared_with(playlist_id, user.id, session):
        return pl
    raise HTTPException(status_code=404, detail="Playlist não encontrada.")


# ---------------- Compartilhamento ----------------
@router.get("/playlists/shared", response_model=list[PlaylistSummary])
async def list_shared_playlists(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PlaylistSummary]:
    """Playlists que outros usuários compartilharam comigo."""
    count_subq = (
        select(PlaylistItem.playlist_id, func.count(PlaylistItem.id).label("c"))
        .group_by(PlaylistItem.playlist_id)
        .subquery()
    )
    res = await session.execute(
        select(Playlist, func.coalesce(count_subq.c.c, 0), User.email)
        .join(PlaylistShare, PlaylistShare.playlist_id == Playlist.id)
        .join(User, User.id == Playlist.owner_id)
        .outerjoin(count_subq, Playlist.id == count_subq.c.playlist_id)
        .where(PlaylistShare.shared_with_id == user.id)
        .order_by(PlaylistShare.created_at.desc())
    )
    return [
        PlaylistSummary(
            id=p.id, name=p.name, track_count=c, owner_email=owner_email, shared=True
        )
        for p, c, owner_email in res.all()
    ]


@router.post("/playlists/{playlist_id}/share", response_model=PlaylistShareOut, status_code=201)
async def share_playlist(
    playlist_id: int,
    body: PlaylistShareIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PlaylistShareOut:
    """Compartilha a playlist (só o dono) com o usuário do email informado."""
    await _owned_playlist(playlist_id, user, session)
    target = await get_user_by_email(session, str(body.email))
    if target is None:
        raise HTTPException(status_code=404, detail="Nenhum usuário com esse email.")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Você já é o dono desta playlist.")
    if not await _shared_with(playlist_id, target.id, session):
        session.add(
            PlaylistShare(playlist_id=playlist_id, shared_with_id=target.id)
        )
        await session.commit()
    return PlaylistShareOut(user_id=target.id, email=target.email)


@router.get("/playlists/{playlist_id}/shares", response_model=list[PlaylistShareOut])
async def list_playlist_shares(
    playlist_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PlaylistShareOut]:
    """Lista com quem a playlist está compartilhada (só o dono)."""
    await _owned_playlist(playlist_id, user, session)
    res = await session.execute(
        select(User.id, User.email)
        .join(PlaylistShare, PlaylistShare.shared_with_id == User.id)
        .where(PlaylistShare.playlist_id == playlist_id)
        .order_by(User.email)
    )
    return [PlaylistShareOut(user_id=uid, email=email) for uid, email in res.all()]


@router.delete("/playlists/{playlist_id}/share/{user_id}", status_code=204)
async def unshare_playlist(
    playlist_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Remove o compartilhamento de um usuário (só o dono)."""
    await _owned_playlist(playlist_id, user, session)
    await session.execute(
        delete(PlaylistShare).where(
            PlaylistShare.playlist_id == playlist_id,
            PlaylistShare.shared_with_id == user_id,
        )
    )
    await session.commit()
    return Response(status_code=204)


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
    await _owned_or_shared_playlist(playlist_id, user, session)
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
    await _track_accessible(body.track_id, user, session)
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
