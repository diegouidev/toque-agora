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
from ..models import User
from ..schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

_GB = 1024 * 1024 * 1024


async def _to_out(session: AsyncSession, user: User) -> UserOut:
    used = await used_bytes_for(session, user.id)
    return UserOut(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
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
        is_admin=body.is_admin,
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
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    """Editar a quota total (liberar mais GB) e/ou a senha de um usuário."""
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if body.quota_gb is not None:
        user.quota_bytes = int(body.quota_gb * _GB)
    if body.password:
        user.password_hash = hash_password(body.password)
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
