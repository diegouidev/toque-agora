"""Recomendações ("Descobrir"): CDs populares que o usuário ainda não tocou.

Heurística simples (sem ML): entre os CDs que o usuário PODE ouvir (próprios +
plano; admin vê tudo), sugere os que ele ainda não reproduziu, ordenados pelos
mais tocados no geral (popularidade) e, em empate, pelos mais novos.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..access import plan_category_ids
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, BandFavorite, Category, PlayHistory, Track, User
from ..schemas import BandSummary, CategoryOut

router = APIRouter(prefix="/api", tags=["recommendations"])


@router.get("/recommendations", response_model=list[BandSummary])
async def recommendations(
    limit: int = Query(default=12, ge=1, le=40),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BandSummary]:
    # Bandas que o usuário já tocou (para excluir das sugestões).
    played_res = await session.execute(
        select(Track.band_id)
        .join(PlayHistory, PlayHistory.track_id == Track.id)
        .where(PlayHistory.owner_id == user.id)
    )
    played_band_ids = set(played_res.scalars().all())

    plays_subq = (
        select(Track.band_id, func.count(PlayHistory.id).label("plays"))
        .join(PlayHistory, PlayHistory.track_id == Track.id)
        .group_by(Track.band_id)
        .subquery()
    )
    count_subq = (
        select(Track.band_id, func.count(Track.id).label("track_count"))
        .group_by(Track.band_id)
        .subquery()
    )
    query = (
        select(
            Band,
            Archive.kind,
            func.coalesce(count_subq.c.track_count, 0),
            User.id,
            User.display_name,
            User.email,
            User.avatar_filename,
        )
        .join(Archive, Band.archive_id == Archive.id)
        .join(User, User.id == Archive.owner_id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .outerjoin(plays_subq, Band.id == plays_subq.c.band_id)
        .where(Band.is_hidden.is_(False))
        .options(selectinload(Band.categories))
        .order_by(
            func.coalesce(plays_subq.c.plays, 0).desc(),
            Archive.created_at.desc(),
        )
        .limit(limit + len(played_band_ids) + 10)
    )
    if not user.is_admin:
        plan_cat_ids = await plan_category_ids(session, user)
        if plan_cat_ids:
            query = query.where(
                (Archive.owner_id == user.id)
                | (Band.categories.any(Category.id.in_(plan_cat_ids)))
            )
        else:
            query = query.where(Archive.owner_id == user.id)

    rows = (await session.execute(query)).all()

    fav_res = await session.execute(
        select(BandFavorite.band_id).where(BandFavorite.owner_id == user.id)
    )
    fav_ids = set(fav_res.scalars().all())

    out: list[BandSummary] = []
    for band, kind, track_count, oid, oname, oemail, oavatar in rows:
        if band.id in played_band_ids:
            continue  # já ouviu → não é "descoberta"
        out.append(
            BandSummary(
                id=band.id,
                archive_id=band.archive_id,
                name=band.name,
                kind=kind,
                track_count=track_count,
                has_cover=band.cover_name is not None,
                is_hidden=band.is_hidden,
                is_favorite=band.id in fav_ids,
                owner_id=oid,
                owner_name=(oname or oemail),
                owner_has_avatar=oavatar is not None,
                categories=[
                    CategoryOut(id=c.id, name=c.name, slug=c.slug)
                    for c in band.categories
                ],
            )
        )
        if len(out) >= limit:
            break
    return out
