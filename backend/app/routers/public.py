"""Vitrine pública (SEM login): CDs em destaque, detalhe, capa e prévia de 30s.

Um CD (banda) é público quando tem alguma categoria pertencente a um plano PAGO.
A prévia serve apenas os ~30s iniciais da faixa — gatilho de conversão.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from ..access import band_is_public, public_category_ids
from ..archive_service import (
    ArchiveServiceError,
    extract_track_bytes_cached,
    load_cover,
)
from ..database import get_session
from ..models import Archive, Band, Category, Playlist, PlaylistItem, Track, User
from ..schemas import (
    PublicCd,
    PublicCdDetail,
    PublicPlaylist,
    PublicPlaylistTrack,
    PublicTrack,
)

router = APIRouter(prefix="/api/public", tags=["public"])

_PREVIEW_SECONDS = 30
_PREVIEW_FALLBACK_BYTES = 600 * 1024  # ~30s de MP3 128kbps quando não há duração
_CHUNK = 64 * 1024


def _owner_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.display_name or (user.email.split("@")[0] if user.email else None)


@router.get("/cds", response_model=list[PublicCd])
async def public_cds(
    limit: int = Query(default=60, ge=1, le=200),
    category: int | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[PublicCd]:
    """CDs do catálogo público (categorias de planos pagos), do mais novo ao mais antigo."""
    # Só entram na vitrine CDs de categorias vendidas em algum plano pago.
    public_cats = await public_category_ids(session)
    if not public_cats:
        return []

    count_subq = (
        select(Track.band_id, func.count(Track.id).label("c"))
        .group_by(Track.band_id)
        .subquery()
    )
    query = (
        select(Band, func.coalesce(count_subq.c.c, 0), User)
        .join(Archive, Band.archive_id == Archive.id)
        .join(User, User.id == Archive.owner_id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .where(Band.is_hidden.is_(False))
        .where(Band.categories.any(Category.id.in_(public_cats)))
        .options(selectinload(Band.categories))
        .order_by(Archive.created_at.desc(), Band.name)
        .limit(limit)
    )
    if category is not None:
        # Ignora filtro por categoria que não seja pública.
        if category not in public_cats:
            return []
        query = query.where(Band.categories.any(Category.id == category))

    rows = await session.execute(query)
    return [
        PublicCd(
            id=band.id,
            name=band.name,
            cover=band.cover_name is not None,
            track_count=int(track_count),
            category_names=[c.name for c in band.categories],
            owner_name=_owner_name(owner),
            created_at=band.created_at,
        )
        for band, track_count, owner in rows.all()
    ]


async def _public_band_or_404(band_id: int, session: AsyncSession) -> Band:
    band = await session.get(Band, band_id, options=[selectinload(Band.categories)])
    if band is None or not await band_is_public(session, band_id):
        raise HTTPException(status_code=404, detail="CD não encontrado.")
    return band


@router.get("/cds/{band_id}", response_model=PublicCdDetail)
async def public_cd_detail(
    band_id: int,
    session: AsyncSession = Depends(get_session),
) -> PublicCdDetail:
    band = await _public_band_or_404(band_id, session)
    archive = await session.get(Archive, band.archive_id)
    owner = await session.get(User, archive.owner_id) if archive else None
    tracks_res = await session.execute(
        select(Track).where(Track.band_id == band_id).order_by(Track.index)
    )
    tracks = [
        PublicTrack(id=t.id, display_name=t.display_name, duration=t.duration)
        for t in tracks_res.scalars().all()
    ]
    return PublicCdDetail(
        id=band.id,
        name=band.name,
        cover=band.cover_name is not None,
        track_count=len(tracks),
        category_names=[c.name for c in band.categories],
        owner_name=_owner_name(owner),
        created_at=band.created_at,
        tracks=tracks,
    )


@router.get("/cds/{band_id}/cover")
async def public_cover(
    band_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    band = await _public_band_or_404(band_id, session)
    if not band.cover_name:
        raise HTTPException(status_code=404, detail="Sem capa.")
    archive = await session.get(Archive, band.archive_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    data, media_type = await run_in_threadpool(
        load_cover, archive.stored_path, archive.kind, band.cover_name
    )
    if data is None:
        raise HTTPException(status_code=404, detail="Sem capa.")
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


@router.get("/playlists/{token}", response_model=PublicPlaylist)
async def public_playlist(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> PublicPlaylist:
    """Playlist por link público: tracklist + quais faixas têm prévia de 30s.

    A reprodução completa continua exigindo login/assinatura — aqui só a
    tracklist e a prévia (para CDs do catálogo público).
    """
    res = await session.execute(
        select(Playlist).where(Playlist.public_token == token)
    )
    pl = res.scalars().first()
    if pl is None:
        raise HTTPException(status_code=404, detail="Playlist não encontrada.")
    owner = await session.get(User, pl.owner_id)

    rows = await session.execute(
        select(Track, Band.id, Band.name)
        .join(PlaylistItem, PlaylistItem.track_id == Track.id)
        .join(Band, Band.id == Track.band_id)
        .where(PlaylistItem.playlist_id == pl.id)
        .order_by(PlaylistItem.position)
    )
    tracks: list[PublicPlaylistTrack] = []
    for track, band_id, band_name in rows.all():
        tracks.append(
            PublicPlaylistTrack(
                id=track.id,
                display_name=track.display_name,
                duration=track.duration,
                band_id=band_id,
                band_name=band_name,
                preview=await band_is_public(session, band_id),
            )
        )
    return PublicPlaylist(
        name=pl.name,
        owner_name=_owner_name(owner),
        track_count=len(tracks),
        tracks=tracks,
    )


@router.get("/preview/{track_id}")
async def public_preview(
    track_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Prévia de ~30s (só os bytes iniciais da faixa) — sem login."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if not await band_is_public(session, track.band_id):
        raise HTTPException(status_code=404, detail="Prévia indisponível.")

    band = await session.get(Band, track.band_id)
    archive = await session.get(Archive, band.archive_id) if band else None
    if archive is None:
        raise HTTPException(status_code=404, detail="Arquivo de origem não encontrado.")

    try:
        data = await run_in_threadpool(
            extract_track_bytes_cached, archive.stored_path, archive.kind, track.name
        )
    except ArchiveServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    total = len(data)
    # Estima os bytes dos primeiros 30s pela proporção duração/tamanho.
    if track.duration and track.duration > _PREVIEW_SECONDS and track.size > 0:
        n = int(track.size * _PREVIEW_SECONDS / track.duration)
    elif track.duration and track.duration <= _PREVIEW_SECONDS:
        n = total  # faixa curta: toca inteira
    else:
        n = _PREVIEW_FALLBACK_BYTES
    n = max(1, min(n, total))

    return StreamingResponse(
        _iter_bytes(data, 0, n),
        status_code=200,
        media_type="audio/mpeg",
        headers={
            "Content-Type": "audio/mpeg",
            "Content-Length": str(n),
            "Cache-Control": "no-store",
            "Accept-Ranges": "none",
        },
    )


def _iter_bytes(data: bytes, start: int, stop: int):
    pos = start
    while pos < stop:
        chunk = data[pos : min(pos + _CHUNK, stop)]
        pos += len(chunk)
        yield chunk
