"""Novidades: CDs novos do catálogo desde a última visita do usuário.

Para o ouvinte, "novo" = CD (não oculto) em alguma categoria do seu plano,
criado depois do `news_seen_at` (ou, se nunca viu, dos últimos 14 dias),
excluindo os próprios uploads. Admin vê os novos de todo o catálogo.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..access import plan_category_ids
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Category, Track, User
from ..schemas import BandSummary, CategoryOut, NewsCount

router = APIRouter(prefix="/api/news", tags=["news"])

# Janela inicial quando o usuário nunca "viu" as novidades.
_FIRST_WINDOW_DAYS = 14
_LIMIT = 40


def _floor(user: User) -> datetime:
    if user.news_seen_at is not None:
        return user.news_seen_at
    return datetime.now(timezone.utc) - timedelta(days=_FIRST_WINDOW_DAYS)


async def _new_bands_query(user: User, session: AsyncSession):
    """SELECT base dos CDs novos acessíveis ao usuário (sem os próprios)."""
    query = (
        select(Band)
        .join(Archive, Band.archive_id == Archive.id)
        .where(
            Band.is_hidden.is_(False),
            Band.created_at > _floor(user),
            Archive.owner_id != user.id,
        )
    )
    if not user.is_admin:
        plan_cat_ids = await plan_category_ids(session, user)
        if not plan_cat_ids:
            return None  # sem plano → sem novidades
        query = query.where(Band.categories.any(Category.id.in_(plan_cat_ids)))
    return query


@router.get("/count", response_model=NewsCount)
async def news_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NewsCount:
    query = await _new_bands_query(user, session)
    if query is None:
        return NewsCount(count=0)
    total = await session.scalar(
        select(func.count()).select_from(query.subquery())
    )
    return NewsCount(count=int(total or 0))


@router.get("", response_model=list[BandSummary])
async def news_list(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BandSummary]:
    query = await _new_bands_query(user, session)
    if query is None:
        return []
    query = (
        query.options(selectinload(Band.categories))
        .order_by(Band.created_at.desc())
        .limit(_LIMIT)
    )
    bands = list((await session.execute(query)).scalars().all())
    if not bands:
        return []

    # Contagem de faixas e dono (para o card), em consultas auxiliares enxutas.
    out: list[BandSummary] = []
    for band in bands:
        archive = await session.get(Archive, band.archive_id)
        owner = await session.get(User, archive.owner_id) if archive else None
        count = await session.scalar(
            select(func.count(Track.id)).where(Track.band_id == band.id)
        )
        out.append(
            BandSummary(
                id=band.id,
                archive_id=band.archive_id,
                name=band.name,
                kind=archive.kind if archive else "",
                track_count=int(count or 0),
                has_cover=band.cover_name is not None,
                is_hidden=band.is_hidden,
                owner_id=owner.id if owner else None,
                owner_name=(owner.display_name or owner.email) if owner else None,
                owner_has_avatar=bool(owner and owner.avatar_filename),
                categories=[
                    CategoryOut(id=c.id, name=c.name, slug=c.slug)
                    for c in band.categories
                ],
            )
        )
    return out


@router.post("/seen", status_code=204)
async def mark_seen(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Marca as novidades como vistas (zera o badge)."""
    user.news_seen_at = datetime.now(timezone.utc)
    await session.commit()
    return Response(status_code=204)
