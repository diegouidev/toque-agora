from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeOut(BaseModel):
    """Dados do usuário logado + estado de quota."""

    id: int
    email: str
    is_admin: bool
    quota_bytes: int
    used_bytes: int
    quota_gb: float
    used_gb: float
    admin_whatsapp: str = ""


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    quota_gb: float | None = None  # default vem do settings se None
    is_admin: bool = False


class UserUpdate(BaseModel):
    """Edição de quota (e opcionalmente senha) pelo admin."""

    quota_gb: float | None = None
    password: str | None = Field(default=None, min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_admin: bool
    quota_bytes: int
    used_bytes: int = 0


class TrackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    band_id: int
    name: str
    display_name: str
    size: int
    index: int
    duration: int = 0
    is_favorite: bool = False


class PlaylistSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    track_count: int = 0


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class PlaylistTrackIn(BaseModel):
    track_id: int


class PlaylistReorder(BaseModel):
    """Nova ordem das faixas (lista de track_id na ordem desejada)."""

    track_ids: list[int]


class BandSummary(BaseModel):
    """Banda para a grade de cards (sem as faixas)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    archive_id: int
    name: str
    kind: str
    track_count: int
    has_cover: bool = False


class BandOut(BaseModel):
    """Banda com suas faixas."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    archive_id: int
    name: str
    tracks: list[TrackOut] = []


class UploadError(BaseModel):
    """Falha no processamento de um arquivo durante upload em lote."""

    filename: str
    detail: str


class UploadResult(BaseModel):
    """Resultado de um upload (vários arquivos, cada um com várias bandas)."""

    bands: list[BandSummary] = []
    errors: list[UploadError] = []
