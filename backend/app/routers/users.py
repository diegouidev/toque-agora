from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    get_user_by_email,
    hash_password,
    require_admin,
    used_bytes_for,
)
from ..config import settings
from ..database import get_session
from ..models import Plan, User
from ..schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

_GB = 1024 * 1024 * 1024


async def _plan_name(session: AsyncSession, plan_id: int | None) -> str | None:
    if plan_id is None:
        return None
    plan = await session.get(Plan, plan_id)
    return plan.name if plan else None


async def _to_out(session: AsyncSession, user: User) -> UserOut:
    used = await used_bytes_for(session, user.id)
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_admin=user.is_admin,
        is_active=user.is_active,
        has_avatar=user.avatar_filename is not None,
        can_upload=user.can_upload,
        plan_id=user.plan_id,
        plan_name=await _plan_name(session, user.plan_id),
        quota_bytes=user.quota_bytes,
        used_bytes=used,
    )


@router.get("", response_model=list[UserOut])
async def list_users(
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    result = await session.execute(select(User).order_by(User.created_at))
    return [await _to_out(session, u) for u in result.scalars().all()]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if await get_user_by_email(session, body.email):
        raise HTTPException(status_code=409, detail="Já existe um usuário com esse email.")
    quota_gb = body.quota_gb if body.quota_gb is not None else settings.default_quota_gb
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_admin=body.is_admin,
        can_upload=body.can_upload,
        plan_id=body.plan_id,
        quota_bytes=int(quota_gb * _GB),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return await _to_out(session, user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    """Admin edita quota, senha (reset), nome e bloqueio (is_active)."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if body.quota_gb is not None:
        user.quota_bytes = int(body.quota_gb * _GB)
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(status_code=400, detail="Você não pode bloquear a si mesmo.")
        user.is_active = body.is_active
    if body.can_upload is not None:
        user.can_upload = body.can_upload
    if body.plan_id is not None:
        # plan_id = 0 → remover plano; senão atribui (valida existência).
        if body.plan_id == 0:
            user.plan_id = None
        else:
            plan = await session.get(Plan, body.plan_id)
            if plan is None:
                raise HTTPException(status_code=404, detail="Plano não encontrado.")
            user.plan_id = body.plan_id
    await session.commit()
    await session.refresh(user)
    return await _to_out(session, user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir a si mesmo.")
    # Cascata remove os archives do usuário no banco; arquivos no disco ficam
    # órfãos — aceitável no MVP (admin pode limpar o volume manualmente).
    await session.delete(user)
    await session.commit()
    return
