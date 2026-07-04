import logging
import os
import posixpath
import re
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..archive_service import (
    ArchiveServiceError,
    embedded_cover_name,
    kind_from_filename,
    list_bands_with_tracks,
    read_track_durations,
    verify_magic,
)
from ..auth import get_current_user, used_bytes_for
from ..config import settings
from ..database import get_session
from ..models import Archive, Band, Category, Track, User
from ..schemas import BandSummary, UploadComplete, UploadError, UploadResult

router = APIRouter(prefix="/api", tags=["upload"])

logger = logging.getLogger("toqueagora.upload")

_CHUNK = 1024 * 1024  # 1 MiB por chunk ao gravar em disco
_GB = 1024 * 1024 * 1024
# upload_id é gerado no cliente (uuid); validamos para evitar path traversal.
_UPLOAD_ID_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")


class _QuotaExceeded(Exception):
    """Sinaliza estouro de quota — vira 413 com detail estruturado."""

    def __init__(self, used: int, quota: int):
        self.used = used
        self.quota = quota


def _quota_exceeded_http(used: int, quota: int) -> HTTPException:
    """413 com detail estruturado que o front usa para abrir o modal de upgrade."""
    return HTTPException(
        status_code=413,
        detail={
            "code": "quota_exceeded",
            "used_gb": round(used / _GB, 2),
            "quota_gb": round(quota / _GB, 2),
            "whatsapp": settings.admin_whatsapp,
        },
    )


def _require_upload(user: User) -> None:
    """Bloqueia contas sem permissão de upload (ouvintes)."""
    if not user.can_upload:
        raise HTTPException(
            status_code=403,
            detail="Sua conta não tem permissão para enviar arquivos.",
        )


@router.post("/upload", response_model=UploadResult, status_code=201)
async def upload_archives(
    files: list[UploadFile],
    category_id: int | None = Form(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UploadResult:
    """Recebe um ou vários .rar/.zip, grava no volume e indexa as bandas.

    Cada subpasta de 1º nível do arquivo vira uma banda; MP3s na raiz viram
    uma banda com o nome do arquivo. Erros em um arquivo não impedem os demais.
    Respeita a quota do usuário (soma dos arquivos no disco). `category_id`
    opcional já marca os CDs criados naquela categoria.
    """
    _require_upload(user)
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    os.makedirs(settings.data_dir, exist_ok=True)

    created_bands: list[Band] = []
    errors: list[UploadError] = []

    for file in files:
        try:
            bands = await _process_one(file, user, session, category_id)
            created_bands.extend(bands)
        except _QuotaExceeded as q:
            # Para o lote: o front mostra o modal de upgrade (WhatsApp).
            raise _quota_exceeded_http(q.used, q.quota)
        except HTTPException as exc:
            errors.append(
                UploadError(filename=file.filename or "(sem nome)", detail=str(exc.detail))
            )

    if not created_bands and errors:
        raise HTTPException(
            status_code=422,
            detail="; ".join(f"{e.filename}: {e.detail}" for e in errors),
        )

    return UploadResult(
        bands=[
            BandSummary(
                id=b.id,
                archive_id=b.archive_id,
                name=b.name,
                kind=b.archive.kind,
                track_count=len(b.tracks),
                has_cover=b.cover_name is not None,
            )
            for b in created_bands
        ],
        errors=errors,
    )


# --------------------- Upload em pedaços (chunked) ---------------------
# Necessário quando há um proxy/Cloudflare na frente limitando o corpo da
# requisição (ex.: 100 MB no plano Free). O cliente fatia o arquivo em partes
# pequenas; o servidor anexa cada parte ao mesmo .part e finaliza no /complete.


def _part_path(upload_id: str, user: User) -> str:
    """Caminho do arquivo temporário do upload, validando o id (anti traversal).

    O nome é prefixado com o id do DONO: cada usuário só enxerga/afeta os
    próprios uploads em andamento (sem colisão nem abort de upload alheio).
    """
    if not _UPLOAD_ID_RE.fullmatch(upload_id):
        raise HTTPException(status_code=400, detail="upload_id inválido.")
    return os.path.join(settings.data_dir, f"u{user.id}_{upload_id}.part")


@router.post("/upload/chunk", status_code=204)
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    chunk: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Anexa um pedaço ao arquivo temporário {upload_id}.part.

    Cada requisição é pequena (o cliente fatia em <100 MB) para passar pelo
    limite de corpo do proxy/Cloudflare. Respeita quota e tamanho máximo.
    """
    _require_upload(user)
    os.makedirs(settings.data_dir, exist_ok=True)
    part_path = _part_path(upload_id, user)

    used = await used_bytes_for(session, user.id)
    remaining = max(0, user.quota_bytes - used)

    # Pedaço 0 começa o arquivo do zero (wb); os demais anexam (ab).
    mode = "wb" if chunk_index == 0 else "ab"
    written = (
        0
        if chunk_index == 0
        else (os.path.getsize(part_path) if os.path.exists(part_path) else 0)
    )

    try:
        async with aiofiles.open(part_path, mode) as out:
            while data := await chunk.read(_CHUNK):
                written += len(data)
                if written > settings.max_upload_bytes:
                    _safe_remove(part_path)
                    raise HTTPException(status_code=413, detail="Arquivo muito grande.")
                if written > remaining:
                    # Estouro de quota — limpa e sinaliza para o modal de upgrade.
                    _safe_remove(part_path)
                    raise _quota_exceeded_http(used + written, user.quota_bytes)
                await out.write(data)
    except HTTPException:
        raise
    except Exception as exc:
        _safe_remove(part_path)
        # Loga o detalhe internamente; o cliente recebe mensagem genérica
        # (detalhes de exceção ajudam um atacante a mapear o sistema).
        logger.exception("Falha ao gravar chunk de upload: %s", exc)
        raise HTTPException(
            status_code=500, detail="Falha ao salvar o arquivo. Tente novamente."
        ) from exc

    return Response(status_code=204)


@router.post("/upload/complete", response_model=UploadResult, status_code=201)
async def upload_complete(
    body: UploadComplete,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UploadResult:
    """Finaliza: promove o .part a arquivo definitivo e indexa as bandas."""
    _require_upload(user)
    part_path = _part_path(body.upload_id, user)
    if not os.path.exists(part_path):
        raise HTTPException(status_code=404, detail="Upload não encontrado ou expirado.")

    kind = kind_from_filename(body.filename)
    if kind is None:
        _safe_remove(part_path)
        raise HTTPException(status_code=400, detail="Envie um arquivo .rar ou .zip.")

    written = os.path.getsize(part_path)
    if written == 0:
        _safe_remove(part_path)
        raise HTTPException(status_code=400, detail="Upload vazio.")

    # Revalida a quota no fechamento (pode ter mudado entre os pedaços).
    used = await used_bytes_for(session, user.id)
    if written > max(0, user.quota_bytes - used):
        _safe_remove(part_path)
        raise _quota_exceeded_http(used + written, user.quota_bytes)

    stored_name = f"{uuid.uuid4().hex}.{kind}"
    stored_path = os.path.join(settings.data_dir, stored_name)
    try:
        os.rename(part_path, stored_path)
    except OSError as exc:
        _safe_remove(part_path)
        logger.exception("Falha ao finalizar upload em pedaços: %s", exc)
        raise HTTPException(
            status_code=500, detail="Falha ao finalizar o upload. Tente novamente."
        ) from exc

    bands = await _index_archive(
        stored_path,
        kind,
        body.filename,
        written,
        user,
        session,
        category_ids=[body.category_id] if body.category_id else None,
    )
    return UploadResult(
        bands=[
            BandSummary(
                id=b.id,
                archive_id=b.archive_id,
                name=b.name,
                kind=b.archive.kind,
                track_count=len(b.tracks),
                has_cover=b.cover_name is not None,
            )
            for b in bands
        ],
        errors=[],
    )


@router.post("/upload/abort", status_code=204)
async def upload_abort(
    upload_id: str = Form(...),
    user: User = Depends(get_current_user),
) -> Response:
    """Cancela um upload em andamento removendo o arquivo temporário (só o dono)."""
    _safe_remove(_part_path(upload_id, user))
    return Response(status_code=204)


async def _process_one(
    file: UploadFile,
    user: User,
    session: AsyncSession,
    category_id: int | None = None,
) -> list[Band]:
    """Grava um arquivo em disco, indexa as bandas/faixas e persiste."""
    kind = kind_from_filename(file.filename or "")
    if kind is None:
        raise HTTPException(status_code=400, detail="Envie um arquivo .rar ou .zip.")

    # Quota restante deste usuário (admin também respeita a sua quota de 20 GB).
    used = await used_bytes_for(session, user.id)
    remaining = max(0, user.quota_bytes - used)

    stored_name = f"{uuid.uuid4().hex}.{kind}"
    stored_path = os.path.join(settings.data_dir, stored_name)

    # Grava o upload em disco em chunks, sem carregar tudo em RAM.
    written = 0
    try:
        async with aiofiles.open(stored_path, "wb") as out:
            while chunk := await file.read(_CHUNK):
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Arquivo muito grande.")
                if written > remaining:
                    # Estouro de quota — aborta e sinaliza para o modal de upgrade.
                    _safe_remove(stored_path)
                    raise _QuotaExceeded(used=used + written, quota=user.quota_bytes)
                await out.write(chunk)
    except (_QuotaExceeded, HTTPException):
        _safe_remove(stored_path)
        raise
    except Exception as exc:
        _safe_remove(stored_path)
        logger.exception("Falha ao gravar upload direto: %s", exc)
        raise HTTPException(
            status_code=500, detail="Falha ao salvar o arquivo. Tente novamente."
        ) from exc

    return await _index_archive(
        stored_path,
        kind,
        file.filename or stored_name,
        written,
        user,
        session,
        category_ids=[category_id] if category_id else None,
    )


async def _index_archive(
    stored_path: str,
    kind: str,
    original_filename: str,
    written: int,
    user: User,
    session: AsyncSession,
    category_ids: list[int] | None = None,
) -> list[Band]:
    """Valida (magic), indexa bandas/faixas e persiste um arquivo já gravado.

    Compartilhado entre o upload direto e a finalização do upload em pedaços.
    Se `category_ids` for informado, cada CD (banda) já nasce marcado com essas
    categorias existentes. Em qualquer falha, remove o arquivo e levanta HTTPException.
    """
    # Confere os magic bytes: a extensão sozinha não garante o formato real.
    try:
        async with aiofiles.open(stored_path, "rb") as fh:
            header = await fh.read(8)
    except OSError:
        header = b""
    if not verify_magic(header, kind):
        _safe_remove(stored_path)
        raise HTTPException(
            status_code=422,
            detail="Arquivo não parece ser um .rar/.zip válido.",
        )

    # Indexa as bandas (lê só o índice do arquivo, não extrai áudio).
    # Roda em threadpool: a leitura do .rar usa subprocesso/IO bloqueante e não
    # pode rodar direto no event loop (travaria os outros requests).
    try:
        band_meta = await run_in_threadpool(list_bands_with_tracks, stored_path, kind)
    except ArchiveServiceError as exc:
        _safe_remove(stored_path)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not band_meta:
        _safe_remove(stored_path)
        raise HTTPException(status_code=422, detail="Nenhum MP3 encontrado no arquivo.")

    # Lê a duração (ID3) de cada faixa, com limite anti zip-bomb, em threadpool.
    all_names = [t["name"] for bm in band_meta for t in bm["tracks"]]
    try:
        durations = await run_in_threadpool(
            read_track_durations, stored_path, kind, all_names
        )
    except Exception:
        durations = {}

    # Nome de fallback para faixas da raiz = nome do arquivo sem extensão.
    stored_name = posixpath.basename(stored_path)
    archive_stem = posixpath.splitext(
        posixpath.basename(original_filename or stored_name)
    )[0]

    # Categorias a marcar em cada CD (ignora ids inexistentes).
    cats: list[Category] = []
    if category_ids:
        cats_res = await session.execute(
            select(Category).where(Category.id.in_(category_ids))
        )
        cats = list(cats_res.scalars().all())

    archive = Archive(
        owner_id=user.id,
        filename=original_filename or stored_name,
        stored_path=stored_path,
        kind=kind,
        size_bytes=written,
    )
    for bm in band_meta:
        cover_name = bm.get("cover_name")
        # Sem imagem solta no arquivo? Tenta a capa embutida (ID3 APIC) da 1ª faixa.
        if not cover_name and bm["tracks"]:
            first_track = bm["tracks"][0]["name"]
            try:
                cover_name = await run_in_threadpool(
                    embedded_cover_name, stored_path, kind, first_track
                )
            except Exception:
                cover_name = None
        band = Band(
            name=bm["band_name"] or archive_stem or "Sem nome",
            prefix=bm["prefix"],
            cover_name=cover_name,
        )
        if cats:
            band.categories = list(cats)
        band.tracks = [
            Track(
                name=t["name"],
                display_name=t["display_name"],
                size=t["size"],
                index=t["index"],
                duration=durations.get(t["name"], 0),
            )
            for t in bm["tracks"]
        ]
        archive.bands.append(band)

    session.add(archive)
    await session.commit()

    # Recarrega com bands+tracks materializados para a resposta.
    await session.refresh(archive, attribute_names=["bands"])
    for band in archive.bands:
        await session.refresh(band, attribute_names=["tracks", "archive"])
    return list(archive.bands)


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
