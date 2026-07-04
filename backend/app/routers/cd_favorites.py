"""Favoritar um CD (banda) inteiro — separado do favorito por faixa."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..access import can_access_band
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, BandFavorite, Track, User
from ..schemas import BandSummary, CategoryOut

router = APIRouter(prefix="/api/favorites", tags=["cd-favorites"])


@router.get("/cds", response_model=list[BandSummary])
async def list_favorite_cds(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BandSummary]:
    """CDs que o usuário curtiu (mais recentes primeiro)."""
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
        .join(BandFavorite, BandFavorite.band_id == Band.id)
        .join(Archive, Band.archive_id == Archive.id)
        .join(User, User.id == Archive.owner_id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .where(BandFavorite.owner_id == user.id)
        .options(selectinload(Band.categories))
        .order_by(BandFavorite.created_at.desc())
    )
    result = await session.execute(query)
    return [
        BandSummary(
            id=band.id,
            archive_id=band.archive_id,
            name=band.name,
            kind=kind,
            track_count=track_count,
            has_cover=band.cover_name is not None,
            is_hidden=band.is_hidden,
            is_favorite=True,
            owner_id=owner_id,
            owner_name=(owner_name or owner_email),
            owner_has_avatar=owner_avatar is not None,
            categories=[
                CategoryOut(id=c.id, name=c.name, slug=c.slug) for c in band.categories
            ],
        )
        for band, kind, track_count, owner_id, owner_name, owner_email, owner_avatar in result.all()
    ]


@router.put("/cds/{band_id}", status_code=204)
async def add_cd_favorite(
    band_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Curte um CD (precisa ter acesso a ele: dono, admin, plano ou compartilhado)."""
    band = await session.get(Band, band_id)
    if band is None:
        raise HTTPException(status_code=404, detail="CD não encontrado.")
    if not await can_access_band(session, user, band_id):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    exists = await session.scalar(
        select(BandFavorite.id).where(
            BandFavorite.owner_id == user.id, BandFavorite.band_id == band_id
        )
    )
    if exists is None:
        session.add(BandFavorite(owner_id=user.id, band_id=band_id))
        await session.commit()
    return Response(status_code=204)


@router.delete("/cds/{band_id}", status_code=204)
async def remove_cd_favorite(
    band_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await session.execute(
        delete(BandFavorite).where(
            BandFavorite.owner_id == user.id, BandFavorite.band_id == band_id
        )
    )
    await session.commit()
    return Response(status_code=204)
