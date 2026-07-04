"""Histórico de reprodução — alimenta a seção 'Tocadas recentemente'."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import can_access_track, plan_category_ids
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Category, PlayHistory, Track, User
from ..schemas import BandSummary

router = APIRouter(prefix="/api", tags=["history"])


async def _track_accessible(track_id: int, user: User, session: AsyncSession) -> Track:
    """Garante que o usuário pode acessar a faixa e a retorna.

    Mesmo critério do streaming (can_access_track): assim o histórico do
    assinante (ouvinte com plano) também é gravado.
    """
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if not await can_access_track(session, user, track):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    return track


@router.post("/history/{track_id}", status_code=204)
async def record_play(
    track_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Registra que o usuário começou a tocar a faixa (1 linha por play)."""
    await _track_accessible(track_id, user, session)
    session.add(PlayHistory(owner_id=user.id, track_id=track_id))
    await session.commit()
    return Response(status_code=204)


@router.get("/history", response_model=list[BandSummary])
async def recent_bands(
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BandSummary]:
    """Últimas bandas distintas tocadas pelo usuário (mais recente primeiro)."""
    # Última reprodução por banda (max played_at), via faixa -> banda.
    recent_subq = (
        select(
            Track.band_id.label("band_id"),
            func.max(PlayHistory.played_at).label("last_played"),
        )
        .join(Track, PlayHistory.track_id == Track.id)
        .where(PlayHistory.owner_id == user.id)
        .group_by(Track.band_id)
        .subquery()
    )
    count_subq = (
        select(Track.band_id, func.count(Track.id).label("track_count"))
        .group_by(Track.band_id)
        .subquery()
    )
    query = (
        select(Band, Archive.kind, func.coalesce(count_subq.c.track_count, 0))
        .join(recent_subq, Band.id == recent_subq.c.band_id)
        .join(Archive, Band.archive_id == Archive.id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .order_by(recent_subq.c.last_played.desc())
        .limit(limit)
    )
    if not user.is_admin:
        # Inclui os próprios uploads E os CDs liberados pelo plano (assinante):
        # a seção "Tocadas recentemente" reflete o que o usuário realmente ouviu.
        plan_cat_ids = await plan_category_ids(session, user)
        if plan_cat_ids:
            query = query.where(
                (Archive.owner_id == user.id)
                | (Band.categories.any(Category.id.in_(plan_cat_ids)))
            )
        else:
            query = query.where(Archive.owner_id == user.id)

    result = await session.execute(query)
    return [
        BandSummary(
            id=band.id,
            archive_id=band.archive_id,
            name=band.name,
            kind=kind,
            track_count=track_count,
            has_cover=band.cover_name is not None,
        )
        for band, kind, track_count in result.all()
    ]
