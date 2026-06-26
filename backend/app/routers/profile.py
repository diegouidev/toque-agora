"""Perfil do próprio usuário: editar nome, trocar senha e avatar."""

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..archive_service import content_type_for_image
from ..auth import get_current_user, hash_password, verify_password
from ..config import settings
from ..database import get_session
from ..models import User
from ..schemas import ChangePassword, MeUpdate, MeOut
from .auth_router import _me_payload

router = APIRouter(prefix="/api", tags=["profile"])

_MAX_AVATAR = 2 * 1024 * 1024  # 2 MiB
# Assinaturas de imagem aceitas (anti-spoofing; SVG fora por XSS).
_IMG_SIGS = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
}


def _detect_image(data: bytes) -> str | None:
    for sig, ext in _IMG_SIGS.items():
        if data.startswith(sig):
            return ext
    # WEBP: "RIFF"????"WEBP"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


@router.patch("/me", response_model=MeOut)
async def update_me(
    body: MeUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    await session.commit()
    await session.refresh(user)
    return await _me_payload(user, session)


@router.post("/me/password", status_code=204)
async def change_password(
    body: ChangePassword,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    user.password_hash = hash_password(body.new_password)
    await session.commit()
    return Response(status_code=204)


@router.post("/me/avatar", response_model=MeOut)
async def upload_avatar(
    file: UploadFile,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    data = await file.read(_MAX_AVATAR + 1)
    if len(data) > _MAX_AVATAR:
        raise HTTPException(status_code=413, detail="Imagem muito grande (máx. 2 MB).")
    ext = _detect_image(data)
    if ext is None:
        raise HTTPException(status_code=422, detail="Envie uma imagem JPG, PNG, WEBP ou GIF.")

    os.makedirs(settings.avatar_dir, exist_ok=True)
    # Remove avatar anterior.
    if user.avatar_filename:
        _safe_remove(os.path.join(settings.avatar_dir, user.avatar_filename))

    fname = f"{uuid.uuid4().hex}.{ext}"
    async with aiofiles.open(os.path.join(settings.avatar_dir, fname), "wb") as out:
        await out.write(data)
    user.avatar_filename = fname
    await session.commit()
    await session.refresh(user)
    return await _me_payload(user, session)


@router.delete("/me/avatar", response_model=MeOut)
async def delete_avatar(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    if user.avatar_filename:
        _safe_remove(os.path.join(settings.avatar_dir, user.avatar_filename))
        user.avatar_filename = None
        await session.commit()
        await session.refresh(user)
    return await _me_payload(user, session)


@router.get("/users/{user_id}/avatar")
async def get_avatar(
    user_id: int,
    _viewer: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Serve o avatar de um usuário (qualquer usuário logado pode ver)."""
    target = await session.get(User, user_id)
    if target is None or not target.avatar_filename:
        raise HTTPException(status_code=404, detail="Sem avatar.")
    path = os.path.join(settings.avatar_dir, target.avatar_filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Sem avatar.")
    async with aiofiles.open(path, "rb") as fh:
        data = await fh.read()
    return Response(
        content=data,
        media_type=content_type_for_image(target.avatar_filename),
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
