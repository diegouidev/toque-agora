import os
import posixpath
import uuid

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from ..archive_service import (
    ArchiveServiceError,
    kind_from_filename,
    list_bands_with_tracks,
    read_track_durations,
    verify_magic,
)
from ..auth import get_current_user, used_bytes_for
from ..config import settings
from ..database import get_session
from ..models import Archive, Band, Track, User
from ..schemas import BandSummary, UploadError, UploadResult

router = APIRouter(prefix="/api", tags=["upload"])

_CHUNK = 1024 * 1024  # 1 MiB por chunk ao gravar em disco
_GB = 1024 * 1024 * 1024


class _QuotaExceeded(Exception):
    """Sinaliza estouro de quota — vira 413 com detail estruturado."""

    def __init__(self, used: int, quota: int):
        self.used = used
        self.quota = quota


@router.post("/upload", response_model=UploadResult, status_code=201)
async def upload_archives(
    files: list[UploadFile],
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UploadResult:
    """Recebe um ou vários .rar/.zip, grava no volume e indexa as bandas.

    Cada subpasta de 1º nível do arquivo vira uma banda; MP3s na raiz viram
    uma banda com o nome do arquivo. Erros em um arquivo não impedem os demais.
    Respeita a quota do usuário (soma dos arquivos no disco).
    """
    if not files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado.")

    os.makedirs(settings.data_dir, exist_ok=True)

    created_bands: list[Band] = []
    errors: list[UploadError] = []

    for file in files:
        try:
            bands = await _process_one(file, user, session)
            created_bands.extend(bands)
        except _QuotaExceeded as q:
            # Para o lote: o front mostra o modal de upgrade (WhatsApp).
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "quota_exceeded",
                    "used_gb": round(q.used / _GB, 2),
                    "quota_gb": round(q.quota / _GB, 2),
                    "whatsapp": settings.admin_whatsapp,
                },
            )
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


async def _process_one(
    file: UploadFile, user: User, session: AsyncSession
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
        raise HTTPException(status_code=500, detail=f"Falha ao salvar: {exc}") from exc

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
    archive_stem = posixpath.splitext(posixpath.basename(file.filename or stored_name))[0]

    archive = Archive(
        owner_id=user.id,
        filename=file.filename or stored_name,
        stored_path=stored_path,
        kind=kind,
        size_bytes=written,
    )
    for bm in band_meta:
        band = Band(
            name=bm["band_name"] or archive_stem or "Sem nome",
            prefix=bm["prefix"],
            cover_name=bm.get("cover_name"),
        )
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
