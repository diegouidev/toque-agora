import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    COOKIE_NAME,
    create_token,
    get_current_user,
    get_user_by_email,
    hash_password,
    revoke_token,
    used_bytes_for,
    verify_password,
)
from ..config import settings
from ..database import get_session
from ..models import Plan, User
from ..schemas import LoginIn, MeOut, RegisterIn

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GB = 1024 * 1024 * 1024

# Rate-limit simples em memória: por (ip, email) → lista de timestamps recentes.
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 5 * 60
_attempts: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    """IP real do cliente.

    Atrás do Caddy/Cloudflare, `request.client.host` é sempre o IP do proxy
    (igual para todo mundo), o que tornaria o rate-limit por IP inútil. O Caddy
    injeta o IP de origem em `X-Forwarded-For`; usamos o primeiro da lista.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_key(request: Request, email: str) -> str:
    return f"{_client_ip(request)}:{email.lower()}"


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
        # Strict: o cookie não é enviado em requisições vindas de outros sites,
        # bloqueando CSRF (um site malicioso não consegue agir em seu nome).
        samesite="strict",
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

    # Conta bloqueada pelo admin → recusa o login.
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta bloqueada. Fale com o administrador.")

    # Login ok → limpa tentativas e seta o cookie de sessão.
    _attempts.pop(key, None)
    _set_session_cookie(response, create_token(user))
    return await _me_payload(user, session)


@router.post("/register", response_model=MeOut)
async def register(
    body: RegisterIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    """Auto-cadastro público (vitrine). Cria ouvinte sem plano (sem acesso até assinar)."""
    if not settings.public_signup_enabled:
        raise HTTPException(status_code=403, detail="Cadastro público desativado.")
    key = _rate_limit_key(request, body.email)
    _check_rate_limit(key)

    if await get_user_by_email(session, body.email):
        _register_attempt(key)
        raise HTTPException(status_code=409, detail="Já existe uma conta com esse email.")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_admin=False,
        can_upload=False,  # ouvinte/cliente
        is_active=True,
        quota_bytes=0,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    _set_session_cookie(response, create_token(user))
    return await _me_payload(user, session)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    session_cookie: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Response:
    # Revoga o token no servidor (não basta apagar o cookie: uma cópia roubada
    # do token continuaria válida até expirar).
    if session_cookie:
        revoke_token(session_cookie)
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
    plan_name = None
    if user.plan_id is not None:
        plan = await session.get(Plan, user.plan_id)
        plan_name = plan.name if plan else None
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        has_avatar=user.avatar_filename is not None,
        is_admin=user.is_admin,
        can_upload=user.can_upload,
        plan_name=plan_name,
        quota_bytes=user.quota_bytes,
        used_bytes=used,
        quota_gb=round(user.quota_bytes / _GB, 2),
        used_gb=round(used / _GB, 2),
        admin_whatsapp=settings.admin_whatsapp,
    )
