"""Rádio: gera uma fila contínua (embaralhada) de faixas de um gênero.

Aproveita o acesso já existente — o usuário só recebe faixas que pode ouvir
(as próprias e as liberadas pelo plano). Admin ouve tudo.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import plan_category_ids
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Category, Favorite, Track, User
from ..schemas import TrackOut

router = APIRouter(prefix="/api", tags=["radio"])

_MAX = 60


@router.get("/radio", response_model=list[TrackOut])
async def radio(
    category: int = Query(..., description="Categoria (gênero) da estação"),
    limit: int = Query(default=50, ge=1, le=_MAX),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TrackOut]:
    """Faixas embaralhadas de uma categoria que o usuário pode ouvir."""
    cat = await session.get(Category, category)
    if cat is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    query = (
        select(Track)
        .join(Band, Track.band_id == Band.id)
        .join(Archive, Band.archive_id == Archive.id)
        .where(Band.categories.any(Category.id == category))
    )

    if not user.is_admin:
        plan_cat_ids = await plan_category_ids(session, user)
        if category in plan_cat_ids:
            # Categoria coberta pelo plano → todas as faixas dela são acessíveis.
            pass
        else:
            # Fora do plano → só as próprias faixas nessa categoria.
            query = query.where(Archive.owner_id == user.id)

    query = query.order_by(func.random()).limit(limit)
    res = await session.execute(query)
    tracks = list(res.scalars().all())

    if not tracks:
        return []

    fav_res = await session.execute(
        select(Favorite.track_id).where(Favorite.owner_id == user.id)
    )
    fav_ids = set(fav_res.scalars().all())
    return [
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
    ]
