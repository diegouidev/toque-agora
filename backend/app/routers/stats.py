"""Retrospectiva pessoal ("Wrapped"): estatísticas de escuta do usuário.

Tudo derivado da tabela PlayHistory (uma linha por reprodução iniciada). Só
leitura — nenhum dado novo é armazenado.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_session
from ..models import Band, Category, PlayHistory, Track, User, band_categories
from ..schemas import MeStats, StatItem

router = APIRouter(prefix="/api/me", tags=["stats"])

_TOP = 5


@router.get("/stats", response_model=MeStats)
async def my_stats(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeStats:
    """Totais e rankings pessoais de escuta (todas as reproduções do usuário)."""
    plays = PlayHistory.owner_id == user.id

    total_plays = int(
        await session.scalar(select(func.count(PlayHistory.id)).where(plays)) or 0
    )
    if total_plays == 0:
        return MeStats()

    # Minutos ouvidos = soma da duração das faixas tocadas (cada play conta).
    total_seconds = int(
        await session.scalar(
            select(func.coalesce(func.sum(Track.duration), 0))
            .select_from(PlayHistory)
            .join(Track, Track.id == PlayHistory.track_id)
            .where(plays)
        )
        or 0
    )
    unique_tracks = int(
        await session.scalar(
            select(func.count(func.distinct(PlayHistory.track_id))).where(plays)
        )
        or 0
    )
    since = await session.scalar(select(func.min(PlayHistory.played_at)).where(plays))

    # ---- Top faixas (com o nome da banda como sublabel) ----
    tracks_res = await session.execute(
        select(
            Track.id,
            Track.display_name,
            Band.name,
            func.count(PlayHistory.id).label("plays"),
        )
        .join(Track, Track.id == PlayHistory.track_id)
        .join(Band, Band.id == Track.band_id)
        .where(plays)
        .group_by(Track.id, Track.display_name, Band.name)
        .order_by(func.count(PlayHistory.id).desc(), Track.display_name)
        .limit(_TOP)
    )
    top_tracks = [
        StatItem(id=tid, label=name, sublabel=band, plays=int(n))
        for tid, name, band, n in tracks_res.all()
    ]

    # ---- Top bandas ----
    bands_res = await session.execute(
        select(Band.id, Band.name, func.count(PlayHistory.id).label("plays"))
        .join(Track, Track.id == PlayHistory.track_id)
        .join(Band, Band.id == Track.band_id)
        .where(plays)
        .group_by(Band.id, Band.name)
        .order_by(func.count(PlayHistory.id).desc(), Band.name)
        .limit(_TOP)
    )
    top_bands = [
        StatItem(id=bid, label=name, plays=int(n)) for bid, name, n in bands_res.all()
    ]

    # ---- Top categorias/gêneros ----
    cats_res = await session.execute(
        select(Category.name, func.count(PlayHistory.id).label("plays"))
        .join(Track, Track.id == PlayHistory.track_id)
        .join(band_categories, band_categories.c.band_id == Track.band_id)
        .join(Category, Category.id == band_categories.c.category_id)
        .where(plays)
        .group_by(Category.name)
        .order_by(func.count(PlayHistory.id).desc(), Category.name)
        .limit(_TOP)
    )
    top_categories = [
        StatItem(label=name, plays=int(n)) for name, n in cats_res.all()
    ]

    return MeStats(
        total_plays=total_plays,
        total_minutes=round(total_seconds / 60),
        unique_tracks=unique_tracks,
        since=since,
        top_tracks=top_tracks,
        top_bands=top_bands,
        top_categories=top_categories,
    )
