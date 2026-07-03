from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    """Base declarativa de todos os modelos ORM."""


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency do FastAPI que fornece uma sessão de banco por request."""
    async with async_session_maker() as session:
        yield session


async def init_db() -> None:
    """Inicializa o banco no startup e garante o super admin.

    Produção usa Alembic (`alembic upgrade head` no deploy), então o schema NÃO
    é criado aqui. Em DEBUG, criamos as tabelas por conveniência de dev — assim
    não é preciso rodar migração para subir localmente.
    """
    # Importa os modelos para que fiquem registrados no metadata da Base.
    from . import models  # noqa: F401

    # As migrações são aplicadas pelo entrypoint (alembic upgrade head) antes do
    # app subir. Em DEBUG sem entrypoint (ex. uvicorn manual) criamos as tabelas
    # por conveniência de dev.
    if settings.debug:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    await _ensure_admin()


async def _ensure_admin() -> None:
    """Garante o super admin a partir do .env.

    O `.env` é a fonte de verdade da senha do admin mestre: se a conta já existe
    mas a senha do banco não corresponde ao ADMIN_PASSWORD atual, ela é
    re-sincronizada no startup. Assim, trocar a senha no `.env` (ex.: corrigir uma
    senha fraca) passa a valer no próximo boot, sem precisar mexer no banco.
    """
    from .auth import get_user_by_email, hash_password, verify_password
    from .config import settings
    from .models import User

    async with async_session_maker() as session:
        existing = await get_user_by_email(session, settings.admin_email)
        if existing is not None:
            # Re-sincroniza a senha do admin com o .env se estiver diferente.
            if not verify_password(settings.admin_password, existing.password_hash):
                existing.password_hash = hash_password(settings.admin_password)
                existing.is_active = True  # a conta mestre nunca fica bloqueada
                existing.is_admin = True
                await session.commit()
            return
        admin = User(
            email=settings.admin_email,
            password_hash=hash_password(settings.admin_password),
            is_admin=True,
            quota_bytes=settings.admin_quota_bytes,
        )
        session.add(admin)
        await session.commit()
