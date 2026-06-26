"""Busca por bandas e faixas pelo nome (respeitando posse por usuário)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Favorite, Track, User
from ..schemas import BandSummary, SearchResult, TrackOut

router = APIRouter(prefix="/api", tags=["search"])

# Quanto retornar no máximo de cada tipo (evita resposta gigante).
_LIMIT = 40


@router.get("/search", response_model=SearchResult)
async def search(
    q: str = Query(default="", max_length=255),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SearchResult:
    """Filtra bandas (por nome) e faixas (por display_name) que casam com `q`.

    Não-admin só enxerga o próprio acervo. Termo curto (<2) retorna vazio.
    """
    term = q.strip()
    if len(term) < 2:
        return SearchResult(bands=[], tracks=[])
    like = f"%{term}%"

    # ---- Bandas: mesmo formato de /api/bands (kind + contagem de faixas) ----
    count_subq = (
        select(Track.band_id, func.count(Track.id).label("track_count"))
        .group_by(Track.band_id)
        .subquery()
    )
    bands_query = (
        select(Band, Archive.kind, func.coalesce(count_subq.c.track_count, 0))
        .join(Archive, Band.archive_id == Archive.id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .where(Band.name.ilike(like))
        .order_by(Archive.created_at.desc(), Band.name)
        .limit(_LIMIT)
    )
    if not user.is_admin:
        bands_query = bands_query.where(Archive.owner_id == user.id)
    bands_res = await session.execute(bands_query)
    bands = [
        BandSummary(
            id=band.id,
            archive_id=band.archive_id,
            name=band.name,
            kind=kind,
            track_count=track_count,
            has_cover=band.cover_name is not None,
        )
        for band, kind, track_count in bands_res.all()
    ]

    # ---- Faixas: por display_name, com flag de favorito ----
    tracks_query = (
        select(Track)
        .join(Band, Track.band_id == Band.id)
        .join(Archive, Band.archive_id == Archive.id)
        .where(Track.display_name.ilike(like))
        .order_by(Track.display_name)
        .limit(_LIMIT)
    )
    if not user.is_admin:
        tracks_query = tracks_query.where(Archive.owner_id == user.id)
    tracks_res = await session.execute(tracks_query)
    tracks = list(tracks_res.scalars().all())

    fav_res = await session.execute(
        select(Favorite.track_id).where(Favorite.owner_id == user.id)
    )
    fav_ids = set(fav_res.scalars().all())

    return SearchResult(
        bands=bands,
        tracks=[
            TrackOut(
                id=t.id,
                band_id=t.band_id,
                name=t.name,
                display_name=t.display_name,
                size=t.size,
                index=t.index,
                duration=t.duration,
                is_favorite=t.id in fav_ids,
            )
            for t in tracks
        ],
    )
