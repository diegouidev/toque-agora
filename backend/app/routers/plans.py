"""Planos comerciais = pacotes de categorias liberadas a ouvintes (admin only)."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import require_admin
from ..database import get_session
from ..models import Category, Plan, User
from ..schemas import (
    CategoryOut,
    PlanCategoriesUpdate,
    PlanCreate,
    PlanOut,
)

router = APIRouter(prefix="/api/plans", tags=["plans"])


async def _to_out(session: AsyncSession, plan: Plan) -> PlanOut:
    user_count = int(
        await session.scalar(
            select(func.count(User.id)).where(User.plan_id == plan.id)
        )
        or 0
    )
    return PlanOut(
        id=plan.id,
        name=plan.name,
        categories=[CategoryOut(id=c.id, name=c.name, slug=c.slug) for c in plan.categories],
        user_count=user_count,
    )


@router.get("", response_model=list[PlanOut])
async def list_plans(
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[PlanOut]:
    res = await session.execute(
        select(Plan).options(selectinload(Plan.categories)).order_by(Plan.name)
    )
    return [await _to_out(session, p) for p in res.scalars().all()]


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan(
    body: PlanCreate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> PlanOut:
    name = body.name.strip()
    exists = await session.execute(select(Plan).where(Plan.name == name))
    if exists.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Já existe um plano com esse nome.")
    plan = Plan(name=name)
    session.add(plan)
    await session.commit()
    await session.refresh(plan, attribute_names=["categories"])
    return await _to_out(session, plan)


@router.patch("/{plan_id}", response_model=PlanOut)
async def rename_plan(
    plan_id: int,
    body: PlanCreate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> PlanOut:
    plan = await session.get(Plan, plan_id, options=[selectinload(Plan.categories)])
    if plan is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    plan.name = body.name.strip()
    await session.commit()
    return await _to_out(session, plan)


@router.put("/{plan_id}/categories", response_model=PlanOut)
async def set_plan_categories(
    plan_id: int,
    body: PlanCategoriesUpdate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> PlanOut:
    plan = await session.get(Plan, plan_id, options=[selectinload(Plan.categories)])
    if plan is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    if body.category_ids:
        res = await session.execute(
            select(Category).where(Category.id.in_(body.category_ids))
        )
        plan.categories = list(res.scalars().all())
    else:
        plan.categories = []
    await session.commit()
    return await _to_out(session, plan)


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: int,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> Response:
    plan = await session.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    await session.delete(plan)  # users.plan_id vira NULL (SET NULL)
    await session.commit()
    return Response(status_code=204)
