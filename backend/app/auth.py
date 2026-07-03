"""Autenticação: hash de senha, JWT e dependencies de usuário/admin."""

import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Cookie, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_session
from .models import Archive, User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)
_ALGO = "HS256"

# Nome do cookie de sessão (JWT HttpOnly).
COOKIE_NAME = "toqueagora_session"


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def _pwd_fingerprint(password_hash: str) -> str:
    """Impressão digital da senha atual, embutida no token.

    Se a senha mudar (pelo usuário ou reset do admin), a impressão do token
    antigo deixa de bater e TODAS as sessões anteriores caem na hora.
    """
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


# Tokens revogados por logout: jti -> timestamp de expiração (limpos ao expirar).
# Em memória (mesmo padrão do rate-limit); um restart limpa a lista, mas os
# tokens revogados por troca de senha continuam inválidos pela impressão digital.
_revoked: dict[str, float] = {}


def revoke_token(token: str) -> None:
    """Marca o token como revogado (logout) até a sua expiração natural."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[_ALGO],
            options={"verify_exp": False},  # revogar mesmo se já expirou não faz mal
        )
    except jwt.PyJWTError:
        return  # token inválido/forjado: nada a revogar
    jti = payload.get("jti")
    if not jti:
        return
    now = time.time()
    # Faxina: descarta revogações de tokens que já expiraram sozinhos.
    for key in [k for k, exp in _revoked.items() if exp < now]:
        _revoked.pop(key, None)
    _revoked[jti] = float(payload.get("exp") or now + settings.jwt_expire_hours * 3600)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "is_admin": user.is_admin,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
        # id único da sessão (permite revogar no logout)
        "jti": uuid.uuid4().hex,
        # amarra o token à senha vigente (troca de senha derruba sessões antigas)
        "pwd": _pwd_fingerprint(user.password_hash),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGO)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[_ALGO])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.") from exc


async def _user_from_token(token: str, session: AsyncSession) -> User:
    payload = _decode(token)
    # Sessão encerrada por logout.
    jti = payload.get("jti")
    if jti and jti in _revoked:
        raise HTTPException(status_code=401, detail="Sessão encerrada. Entre novamente.")
    user_id = int(payload.get("sub", 0))
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    # Token emitido antes de uma troca de senha (ou token antigo sem a claim).
    if payload.get("pwd") != _pwd_fingerprint(user.password_hash):
        raise HTTPException(status_code=401, detail="Sessão expirada. Entre novamente.")
    # Revoga a sessão imediatamente se a conta foi bloqueada pelo admin.
    # (Sem isso, um JWT já emitido continuaria válido até expirar — 7 dias.)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta bloqueada. Fale com o administrador.")
    return user


async def get_current_user(
    session: AsyncSession = Depends(get_session),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session_cookie: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> User:
    """Usuário autenticado pelo cookie HttpOnly (ou Authorization Bearer como fallback).

    O cookie é enviado automaticamente pelo navegador, inclusive nas requisições
    de <audio>/<img> (same-origin), então não precisamos mais de token na URL.
    """
    token = session_cookie or (creds.credentials if creds else None)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    return await _user_from_token(token, session)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def used_bytes_for(session: AsyncSession, user_id: int) -> int:
    """Soma do tamanho dos arquivos no disco daquele usuário (quota usada)."""
    result = await session.execute(
        select(func.coalesce(func.sum(Archive.size_bytes), 0)).where(
            Archive.owner_id == user_id
        )
    )
    return int(result.scalar_one())
