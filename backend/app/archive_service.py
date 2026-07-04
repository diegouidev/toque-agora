"""Serviço de leitura/extração parcial de arquivos compactados (.rar e .zip).

Núcleo da aplicação: lista as faixas MP3 de dentro do arquivo — agrupadas por
banda (pasta de 1º nível) — e extrai *apenas* a faixa pedida para memória (RAM),
sem descompactar o arquivo inteiro no disco.

- `.zip`: usa `zipfile` (stdlib).
- `.rar`: usa `rarfile`, que é um wrapper sobre o binário externo `unrar`/`unar`
  (instalado no Dockerfile do back-end). A biblioteca autodetecta o backend.
"""

import io
import logging
import os
import posixpath
import threading
import time
import zipfile
from collections import OrderedDict
from typing import Literal

import rarfile

logger = logging.getLogger("toqueagora.archive")

Kind = Literal["rar", "zip"]

# Limite de tamanho descompactado de UMA faixa/arquivo interno servido em memória.
# Protege contra "zip bomb": um arquivo pequeno que declara conteúdo gigante e
# estouraria a RAM do container ao ser lido. 200 MiB cobre MP3s longos com folga.
MAX_MEMBER_BYTES = 200 * 1024 * 1024


class ArchiveServiceError(Exception):
    """Erro ao ler ou extrair conteúdo de um arquivo compactado."""


# Alias retrocompatível (código antigo importava RarServiceError).
RarServiceError = ArchiveServiceError


def kind_from_filename(filename: str) -> Kind | None:
    """Detecta o tipo do arquivo pela extensão. None se não suportado."""
    lower = filename.lower()
    if lower.endswith(".rar"):
        return "rar"
    if lower.endswith(".zip"):
        return "zip"
    return None


# Assinaturas (magic bytes) dos formatos suportados.
_RAR_SIGS = (b"Rar!\x1a\x07\x00", b"Rar!\x1a\x07\x01\x00")  # RAR4 / RAR5
_ZIP_SIGS = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")  # zip normal/vazio/spanned


def verify_magic(header: bytes, kind: Kind) -> bool:
    """Confere se os primeiros bytes batem com o tipo declarado pela extensão.

    Evita aceitar um arquivo renomeado (ex. .exe disfarçado de .zip).
    """
    if kind == "rar":
        return any(header.startswith(s) for s in _RAR_SIGS)
    return any(header.startswith(s) for s in _ZIP_SIGS)


def _is_mp3(name: str) -> bool:
    return name.lower().endswith(".mp3")


_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def _is_image(name: str) -> bool:
    return name.lower().endswith(_IMAGE_EXTS)


def content_type_for_image(name: str) -> str:
    lower = name.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _norm(name: str) -> str:
    """Normaliza separadores (.rar pode usar '\\')."""
    return name.replace("\\", "/")


def _display_name(internal_name: str) -> str:
    """Deriva um nome amigável a partir do caminho interno."""
    base = posixpath.basename(_norm(internal_name))
    stem, _ext = posixpath.splitext(base)
    return stem or base


def _band_key(internal_name: str) -> str:
    """Pasta de 1º nível do caminho. '' se o MP3 está na raiz do arquivo."""
    norm = _norm(internal_name)
    if "/" in norm:
        return norm.split("/", 1)[0]
    return ""


class _Entry:
    """Abstrai uma entrada do arquivo (rar ou zip) com a mesma interface."""

    def __init__(self, name: str, is_dir: bool, size: int):
        self.name = name
        self.is_dir = is_dir
        self.size = size


def _list_entries(stored_path: str, kind: Kind) -> list[_Entry]:
    # Mensagens de erro NÃO incluem caminhos internos do servidor nem detalhes
    # de exceção: elas chegam ao cliente via HTTPException(detail=str(exc)).
    # O detalhe técnico vai para o log.
    if not os.path.exists(stored_path):
        logger.warning("Arquivo de origem ausente no disco: %s", stored_path)
        raise ArchiveServiceError("Arquivo de origem não encontrado no armazenamento.")

    try:
        if kind == "zip":
            with zipfile.ZipFile(stored_path) as zf:
                return [
                    _Entry(i.filename, i.is_dir(), int(i.file_size or 0))
                    for i in zf.infolist()
                ]
        else:
            with rarfile.RarFile(stored_path) as rf:
                return [
                    _Entry(i.filename, i.is_dir(), int(i.file_size or 0))
                    for i in rf.infolist()
                ]
    except (rarfile.Error, zipfile.BadZipFile) as exc:
        logger.warning("Falha ao ler %s: %s", stored_path, exc)
        raise ArchiveServiceError(
            "Falha ao ler o arquivo (corrompido ou formato não suportado)."
        ) from exc


def list_bands_with_tracks(stored_path: str, kind: Kind) -> list[dict]:
    """Lê o índice e agrupa as faixas MP3 por banda (pasta de 1º nível).

    Retorna: [{ "band_name": str|None, "prefix": str, "tracks": [ {...} ] }]
    onde `band_name=None` indica faixas da raiz (o router usa o nome do arquivo).
    A ordem das bandas e das faixas é estável (alfabética).
    """
    all_entries = [e for e in _list_entries(stored_path, kind) if not e.is_dir]
    mp3s = [e for e in all_entries if _is_mp3(e.name)]
    images = [e for e in all_entries if _is_image(e.name)]

    # Agrupa MP3s e imagens por pasta de 1º nível.
    groups: dict[str, list[_Entry]] = {}
    for e in mp3s:
        groups.setdefault(_band_key(e.name), []).append(e)

    images_by_band: dict[str, list[_Entry]] = {}
    for e in images:
        images_by_band.setdefault(_band_key(e.name), []).append(e)

    bands: list[dict] = []
    for key in sorted(groups.keys(), key=str.lower):
        items = sorted(groups[key], key=lambda e: e.name.lower())
        tracks = [
            {
                "name": e.name,  # caminho interno completo (chave de extração)
                "display_name": _display_name(e.name),
                "size": e.size,
                "index": idx,
            }
            for idx, e in enumerate(items)
        ]
        bands.append(
            {
                "band_name": key or None,  # None = raiz → nome do arquivo
                "prefix": f"{key}/" if key else "",
                "cover_name": _pick_cover(images_by_band.get(key, [])),
                "tracks": tracks,
            }
        )
    return bands


def _pick_cover(images: list[_Entry]) -> str | None:
    """Escolhe a melhor imagem de capa de uma banda.

    Prioriza nomes comuns (cover/folder/front/capa); senão a primeira em ordem.
    """
    if not images:
        return None
    preferred = ("cover", "folder", "front", "capa", "album")
    images_sorted = sorted(images, key=lambda e: e.name.lower())
    for img in images_sorted:
        base = posixpath.basename(_norm(img.name)).lower()
        if any(p in base for p in preferred):
            return img.name
    return images_sorted[0].name


def extract_file_bytes(stored_path: str, kind: Kind, internal_name: str) -> bytes:
    """Extrai qualquer arquivo interno (ex. imagem de capa) para memória."""
    return extract_track_bytes(stored_path, kind, internal_name)


def read_track_durations(stored_path: str, kind: Kind, names: list[str]) -> dict[str, int]:
    """Lê a duração (segundos) de cada MP3 via mutagen, com limite de tamanho.

    Retorna {internal_name: duration_seconds}. Faixas grandes demais ou ilegíveis
    são puladas (duration fica 0). Roda em threadpool a partir do upload.
    """
    import io

    from mutagen.mp3 import MP3

    durations: dict[str, int] = {}
    opener = zipfile.ZipFile if kind == "zip" else rarfile.RarFile
    try:
        with opener(stored_path) as ar:
            for name in names:
                try:
                    with ar.open(name) as fh:
                        data = fh.read(MAX_MEMBER_BYTES + 1)
                    if len(data) > MAX_MEMBER_BYTES:
                        durations[name] = 0  # zip bomb suspeito → pula
                        continue
                    audio = MP3(io.BytesIO(data))
                    durations[name] = int(audio.info.length or 0)
                except Exception:
                    durations[name] = 0  # MP3 ilegível → duração desconhecida
    except (rarfile.Error, zipfile.BadZipFile):
        pass
    return durations


def embedded_cover_name(stored_path: str, kind: Kind, track_name: str) -> str | None:
    """Se a faixa tiver capa embutida (ID3 APIC), devolve um nome-sentinela.

    O sentinela ('@id3:<caminho interno>') é guardado em Band.cover_name quando
    o CD não tem imagem solta no arquivo; o cover é extraído sob demanda depois.
    Retorna None se não houver capa embutida ou a faixa for ilegível.
    """
    data, _mime = extract_embedded_cover(stored_path, kind, track_name)
    return f"@id3:{track_name}" if data else None


def load_cover(
    stored_path: str, kind: Kind, cover_name: str
) -> tuple[bytes | None, str]:
    """Resolve a capa de um CD a partir do valor de Band.cover_name.

    - '@id3:<faixa>'  → arte embutida (APIC) da faixa.
    - qualquer outro  → imagem solta dentro do arquivo (caminho interno).
    Retorna (bytes, mime) ou (None, "") em falha.
    """
    if cover_name.startswith("@id3:"):
        return extract_embedded_cover(stored_path, kind, cover_name[len("@id3:") :])
    try:
        data = extract_file_bytes(stored_path, kind, cover_name)
    except ArchiveServiceError:
        return None, ""
    return data, content_type_for_image(cover_name)


def extract_embedded_cover(
    stored_path: str, kind: Kind, track_name: str
) -> tuple[bytes | None, str]:
    """Extrai a imagem de capa embutida (APIC) de um MP3 dentro do arquivo.

    Retorna (bytes, mime). (None, "") se a faixa não tiver arte embutida.
    """
    from mutagen.id3 import ID3

    try:
        raw = extract_track_bytes(stored_path, kind, track_name)
    except ArchiveServiceError:
        return None, ""
    try:
        tags = ID3(io.BytesIO(raw))
    except Exception:
        return None, ""
    for frame in tags.getall("APIC"):
        if getattr(frame, "data", None):
            return frame.data, getattr(frame, "mime", "") or "image/jpeg"
    return None, ""


def _read_limited(fh, declared_size: int | None) -> bytes:
    """Lê o stream respeitando MAX_MEMBER_BYTES (defesa contra zip bomb).

    Lê 1 byte a mais que o limite; se vier, o conteúdo real excede o permitido.
    """
    if declared_size is not None and declared_size > MAX_MEMBER_BYTES:
        raise ArchiveServiceError("Faixa excede o tamanho máximo permitido.")
    data = fh.read(MAX_MEMBER_BYTES + 1)
    if len(data) > MAX_MEMBER_BYTES:
        raise ArchiveServiceError("Faixa excede o tamanho máximo permitido.")
    return data


# ---------------- Cache de faixas extraídas ----------------
# Cada requisição de streaming (e cada seek/Range) extrai a faixa inteira para a
# RAM. Sem cache, arrastar a barra de progresso re-extrai o arquivo repetidas
# vezes; com vários ouvintes simultâneos isso vira pressão de memória/CPU e um
# vetor de DoS. Um cache pequeno, com TTL e teto de tamanho total, faz os
# acessos seguidos à mesma faixa reaproveitarem o buffer já extraído.
_CACHE_TTL_SECONDS = 30
_CACHE_MAX_TOTAL_BYTES = 256 * 1024 * 1024  # teto de memória do cache (~256 MiB)
_cache: "OrderedDict[tuple[str, str], tuple[float, bytes]]" = OrderedDict()
_cache_lock = threading.Lock()
_cache_total = 0


def _cache_get(key: tuple[str, str]) -> bytes | None:
    global _cache_total
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        ts, data = entry
        if time.monotonic() - ts > _CACHE_TTL_SECONDS:
            del _cache[key]
            _cache_total -= len(data)
            return None
        _cache.move_to_end(key)  # LRU: recém-usado vai para o fim
        return data


def _cache_put(key: tuple[str, str], data: bytes) -> None:
    global _cache_total
    # Não cacheia faixas grandes demais (não vale o custo de memória).
    if len(data) > _CACHE_MAX_TOTAL_BYTES // 2:
        return
    with _cache_lock:
        if key in _cache:
            _cache_total -= len(_cache[key][1])
        _cache[key] = (time.monotonic(), data)
        _cache.move_to_end(key)
        _cache_total += len(data)
        # Evicção LRU até caber no teto total.
        while _cache_total > _CACHE_MAX_TOTAL_BYTES and _cache:
            _, (_, old) = _cache.popitem(last=False)
            _cache_total -= len(old)


def extract_track_bytes_cached(stored_path: str, kind: Kind, internal_name: str) -> bytes:
    """Como extract_track_bytes, mas reaproveita o buffer por alguns segundos.

    Ideal para o streaming: seeks (HTTP Range) repetidos na mesma faixa não
    re-extraem o arquivo inteiro toda vez.
    """
    key = (stored_path, internal_name)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    data = extract_track_bytes(stored_path, kind, internal_name)
    _cache_put(key, data)
    return data


def extract_track_bytes(stored_path: str, kind: Kind, internal_name: str) -> bytes:
    """Extrai *apenas* a faixa indicada para um buffer em memória.

    Defesas: valida que o nome existe no índice do arquivo (anti path-traversal)
    e limita o tamanho descompactado lido (anti zip bomb). O seek (HTTP Range)
    é feito depois fatiando o buffer em RAM — sem recompressão nem disco.
    """
    if not os.path.exists(stored_path):
        logger.warning("Arquivo de origem ausente no disco: %s", stored_path)
        raise ArchiveServiceError("Arquivo de origem não encontrado no armazenamento.")

    try:
        if kind == "zip":
            with zipfile.ZipFile(stored_path) as zf:
                # Anti-traversal: o nome precisa existir literalmente no índice.
                info = zf.getinfo(internal_name)
                with zf.open(info) as fh:
                    return _read_limited(fh, info.file_size)
        else:
            with rarfile.RarFile(stored_path) as rf:
                names = set(rf.namelist())
                if internal_name not in names:
                    raise KeyError(internal_name)
                info = rf.getinfo(internal_name)
                with rf.open(internal_name) as fh:
                    return _read_limited(fh, getattr(info, "file_size", None))
    except KeyError as exc:
        raise ArchiveServiceError("Faixa não existe no arquivo.") from exc
    except (rarfile.Error, zipfile.BadZipFile) as exc:
        logger.warning("Falha ao extrair '%s' de %s: %s", internal_name, stored_path, exc)
        raise ArchiveServiceError("Falha ao extrair a faixa do arquivo.") from exc
