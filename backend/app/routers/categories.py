"""Categorias de CD (Forró/Samba/Pagode...). Admin cria; todos listam/filtram."""

import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user, require_admin
from ..database import get_session
from ..models import Band, Category
from ..schemas import (
    BandCategoriesUpdate,
    CategoryCreate,
    CategoryOut,
)

router = APIRouter(prefix="/api", tags=["categories"])


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    return s.strip("-") or "categoria"


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    _user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    res = await session.execute(select(Category).order_by(Category.name))
    return list(res.scalars().all())


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    body: CategoryCreate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Category:
    name = body.name.strip()
    slug = _slugify(name)
    exists = await session.execute(
        select(Category).where((Category.name == name) | (Category.slug == slug))
    )
    if exists.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Categoria já existe.")
    cat = Category(name=name, slug=slug)
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return cat


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def rename_category(
    category_id: int,
    body: CategoryCreate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Category:
    cat = await session.get(Category, category_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    cat.name = body.name.strip()
    cat.slug = _slugify(cat.name)
    await session.commit()
    await session.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Response:
    cat = await session.get(Category, category_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    await session.delete(cat)  # band_categories some por cascade
    await session.commit()
    return Response(status_code=204)


@router.put("/bands/{band_id}/categories", response_model=list[CategoryOut])
async def set_band_categories(
    band_id: int,
    body: BandCategoriesUpdate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    """Define o conjunto de categorias de um CD (admin)."""
    band = await session.get(
        Band, band_id, options=[selectinload(Band.categories)]
    )
    if band is None:
        raise HTTPException(status_code=404, detail="Banda não encontrada.")
    if body.category_ids:
        res = await session.execute(
            select(Category).where(Category.id.in_(body.category_ids))
        )
        cats = list(res.scalars().all())
    else:
        cats = []
    band.categories = cats
    await session.commit()
    return cats
