from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import (
    admin,
    archives,
    auth_router,
    history,
    playlists,
    profile,
    search,
    stream,
    upload,
    users,
)


import logging

logger = logging.getLogger("toqueagora")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Segurança: em produção (não-debug) o JWT secret precisa ser trocado.
    if settings.jwt_secret_is_insecure:
        if settings.debug:
            logger.warning(
                "JWT_SECRET inseguro (default). Troque antes de ir para produção: "
                "openssl rand -hex 32"
            )
        else:
            raise RuntimeError(
                "JWT_SECRET inseguro em produção. Defina JWT_SECRET no .env "
                "(ex.: openssl rand -hex 32) ou rode com DEBUG=true para desenvolvimento."
            )
    # Cria as tabelas no startup (MVP, sem migrações).
    await init_db()
    yield


app = FastAPI(
    title="TOQUE AGORA API",
    description=(
        "Player de música que faz streaming de áudio sob demanda de dentro de "
        "arquivos .rar/.zip, sem descompactar tudo no disco. Com login e quotas."
    ),
    version="2.0.0",
    lifespan=lifespan,
    # /docs e /redoc só quando em modo debug.
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Necessário para o front ler Content-Range/Accept-Ranges no seek.
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

app.include_router(auth_router.router)
app.include_router(profile.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(upload.router)
app.include_router(archives.router)
app.include_router(playlists.router)
app.include_router(search.router)
app.include_router(history.router)
app.include_router(stream.router)


@app.get("/api/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
