"""Rota de streaming de áudio sob demanda de dentro do arquivo (.rar/.zip).

No Play, extrai *apenas* a faixa pedida para um buffer em RAM e a transmite,
com suporte a HTTP Range (206 Partial Content) para permitir seek/arrastar a
barra de progresso sem descompactar o arquivo inteiro no disco.
"""

import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import can_access_track
from ..archive_service import ArchiveServiceError, extract_track_bytes
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Track, User

router = APIRouter(prefix="/api", tags=["stream"])

_CHUNK = 64 * 1024  # 64 KiB por chunk enviado
_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@router.get("/stream/{track_id}")
async def stream_track(
    track_id: int,
    request: Request,
    range_header: str | None = Header(default=None, alias="Range"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Autentica pelo cookie de sessão (enviado pelo <audio> same-origin)."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    band = await session.get(Band, track.band_id)
    archive = await session.get(Archive, band.archive_id) if band else None
    if archive is None:
        raise HTTPException(status_code=404, detail="Arquivo de origem não encontrado.")

    # Dono, admin, ou destinatário de uma playlist compartilhada com a faixa.
    if not await can_access_track(session, user, track):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Extrai SÓ esta faixa para memória (sem descompactar o resto no disco).
    # Roda em threadpool: a extração do .rar é IO/subprocesso bloqueante.
    try:
        data = await run_in_threadpool(
            extract_track_bytes, archive.stored_path, archive.kind, track.name
        )
    except ArchiveServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    total = len(data)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
    }

    start, end = _parse_range(range_header, total)

    # Sem Range válido → 200 com o áudio completo, em chunks a partir do buffer.
    if start is None:
        headers["Content-Length"] = str(total)
        return StreamingResponse(
            _iter_bytes(data, 0, total),
            status_code=200,
            headers=headers,
            media_type="audio/mpeg",
        )

    # Com Range → 206 Partial Content, fatiando o buffer em RAM.
    length = end - start + 1
    headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    headers["Content-Length"] = str(length)
    return StreamingResponse(
        _iter_bytes(data, start, end + 1),
        status_code=206,
        headers=headers,
        media_type="audio/mpeg",
    )


def _parse_range(range_header: str | None, total: int) -> tuple[int | None, int | None]:
    """Interpreta o header Range. Retorna (start, end) inclusivos, ou (None, None)."""
    if not range_header or total == 0:
        return None, None
    match = _RANGE_RE.fullmatch(range_header.strip())
    if not match:
        return None, None

    raw_start, raw_end = match.group(1), match.group(2)
    if raw_start == "" and raw_end == "":
        return None, None

    if raw_start == "":
        # Sufixo: últimos N bytes.
        suffix = int(raw_end)
        if suffix <= 0:
            return None, None
        start = max(0, total - suffix)
        end = total - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else total - 1

    # Clampa para os limites do arquivo.
    start = max(0, start)
    end = min(end, total - 1)
    if start > end:
        return None, None
    return start, end


def _iter_bytes(data: bytes, start: int, stop: int):
    pos = start
    while pos < stop:
        chunk = data[pos : min(pos + _CHUNK, stop)]
        pos += len(chunk)
        yield chunk
