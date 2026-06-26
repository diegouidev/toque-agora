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
    display_name: str | None = None
    has_avatar: bool = False
    is_admin: bool
    quota_bytes: int
    used_bytes: int
    quota_gb: float
    used_gb: float
    admin_whatsapp: str = ""


class MeUpdate(BaseModel):
    """Usuário edita o próprio perfil (nome). Senha vai em ChangePassword."""

    display_name: str | None = Field(default=None, max_length=255)


class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = Field(default=None, max_length=255)
    quota_gb: float | None = None  # default vem do settings se None
    is_admin: bool = False


class UserUpdate(BaseModel):
    """Edição pelo admin: quota, senha (reset), nome, bloqueio."""

    quota_gb: float | None = None
    password: str | None = Field(default=None, min_length=8)
    display_name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str | None = None
    is_admin: bool
    is_active: bool = True
    has_avatar: bool = False
    quota_bytes: int
    used_bytes: int = 0


class AdminUserDetail(BaseModel):
    """Perfil completo de um usuário, visto pelo admin."""

    id: int
    email: str
    display_name: str | None = None
    is_admin: bool
    is_active: bool
    has_avatar: bool
    quota_bytes: int
    used_bytes: int
    archive_count: int
    track_count: int
    playlist_count: int
    last_played_at: datetime | None = None
    created_at: datetime | None = None


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
    # Preenchidos quando a playlist é "compartilhada comigo".
    owner_email: str | None = None
    shared: bool = False


class PlaylistShareIn(BaseModel):
    email: EmailStr


class PlaylistShareOut(BaseModel):
    user_id: int
    email: str


class NameUpdate(BaseModel):
    """Renomear banda (name) ou faixa (display_name)."""

    name: str = Field(min_length=1, max_length=512)


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
    # Dono do CD (quem postou) — para o hero da view de banda.
    owner_id: int | None = None
    owner_name: str | None = None
    owner_has_avatar: bool = False
    categories: list["CategoryOut"] = []


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class BandCategoriesUpdate(BaseModel):
    """Define o conjunto de categorias de um CD (lista de ids)."""

    category_ids: list[int]


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


class SearchResult(BaseModel):
    """Resultado da busca: bandas e faixas que casam com o termo."""

    bands: list[BandSummary] = []
    tracks: list[TrackOut] = []


class UploadComplete(BaseModel):
    """Finaliza um upload em pedaços: junta o .part e indexa as bandas."""

    upload_id: str = Field(min_length=8, max_length=64)
    filename: str = Field(min_length=1, max_length=512)


# ---------------- Admin (estatísticas) ----------------
class AdminTotals(BaseModel):
    users: int = 0
    used_bytes: int = 0
    archives: int = 0
    bands: int = 0
    tracks: int = 0
    plays: int = 0


class AdminUserStat(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    is_admin: bool
    is_active: bool = True
    has_avatar: bool = False
    quota_bytes: int
    used_bytes: int
    archive_count: int = 0
    track_count: int = 0
    last_played_at: datetime | None = None
    created_at: datetime | None = None


class TopBand(BaseModel):
    id: int
    name: str
    plays: int


class AdminOverview(BaseModel):
    totals: AdminTotals
    users: list[AdminUserStat] = []
    top_bands: list[TopBand] = []
