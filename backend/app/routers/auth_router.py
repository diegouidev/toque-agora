import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    COOKIE_NAME,
    create_token,
    get_current_user,
    get_user_by_email,
    used_bytes_for,
    verify_password,
)
from ..config import settings
from ..database import get_session
from ..models import User
from ..schemas import LoginIn, MeOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GB = 1024 * 1024 * 1024

# Rate-limit simples em memória: por (ip, email) → lista de timestamps recentes.
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 5 * 60
_attempts: dict[str, list[float]] = {}


def _rate_limit_key(request: Request, email: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{email.lower()}"


def _check_rate_limit(key: str) -> None:
    now = time.time()
    hits = [t for t in _attempts.get(key, []) if now - t < _WINDOW_SECONDS]
    if len(hits) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Muitas tentativas. Tente novamente em alguns minutos.",
        )
    _attempts[key] = hits


def _register_attempt(key: str) -> None:
    _attempts.setdefault(key, []).append(time.time())


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.jwt_expire_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/login", response_model=MeOut)
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    key = _rate_limit_key(request, body.email)
    _check_rate_limit(key)

    user = await get_user_by_email(session, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        _register_attempt(key)
        raise HTTPException(status_code=401, detail="Email ou senha inválidos.")

    # Login ok → limpa tentativas e seta o cookie de sessão.
    _attempts.pop(key, None)
    _set_session_cookie(response, create_token(user))
    return await _me_payload(user, session)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> Response:
    response.delete_cookie(COOKIE_NAME, path="/")
    return Response(status_code=204)


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    return await _me_payload(user, session)


async def _me_payload(user: User, session: AsyncSession) -> MeOut:
    used = await used_bytes_for(session, user.id)
    return MeOut(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        quota_bytes=user.quota_bytes,
        used_bytes=used,
        quota_gb=round(user.quota_bytes / _GB, 2),
        used_gb=round(used / _GB, 2),
        admin_whatsapp=settings.admin_whatsapp,
    )
