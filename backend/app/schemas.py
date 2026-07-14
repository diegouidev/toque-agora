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
    can_upload: bool = True
    plan_name: str | None = None
    # Vencimento da assinatura (para o aviso "vence em X dias"); None = sem plano/expiração.
    plan_expires_at: datetime | None = None
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
    can_upload: bool = True
    plan_id: int | None = None


class UserUpdate(BaseModel):
    """Edição pelo admin: quota, senha (reset), nome, bloqueio, plano, upload."""

    quota_gb: float | None = None
    password: str | None = Field(default=None, min_length=8)
    display_name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    can_upload: bool | None = None
    # plan_id: use 0 para remover o plano (None = não alterar).
    plan_id: int | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str | None = None
    is_admin: bool
    is_active: bool = True
    has_avatar: bool = False
    can_upload: bool = True
    plan_id: int | None = None
    plan_name: str | None = None
    quota_bytes: int
    used_bytes: int = 0


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price_cents: int = 0
    categories: list["CategoryOut"] = []
    user_count: int = 0


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price_cents: int = Field(default=0, ge=0)


class PlanCategoriesUpdate(BaseModel):
    category_ids: list[int]


# ----- Auth público / Billing / Config -----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = Field(default=None, max_length=255)


class PublicPlan(BaseModel):
    """Plano para a vitrine (sem dados internos)."""

    id: int
    name: str
    price_cents: int
    category_names: list[str] = []


class SubscribeIn(BaseModel):
    plan_id: int
    # CPF/CNPJ do cliente (exigido pelo Asaas em produção). Aceita com máscara.
    cpf_cnpj: str | None = None


class SubscribeOut(BaseModel):
    invoice_url: str | None = None
    status: str


class BillingStatus(BaseModel):
    status: str  # none | pending | active | overdue | canceled
    plan_name: str | None = None
    expires_at: datetime | None = None


class AppConfigUpdate(BaseModel):
    asaas_api_key: str | None = None
    asaas_base_url: str | None = None
    asaas_webhook_token: str | None = None


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
    # Token do link público (só na lista do próprio dono). None = não publicada.
    public_token: str | None = None
    # Preenchidos quando a playlist é "compartilhada comigo".
    owner_email: str | None = None
    shared: bool = False


class PublishOut(BaseModel):
    """Resultado de publicar/despublicar uma playlist."""

    public_token: str | None = None


class PublicPlaylistTrack(BaseModel):
    id: int
    display_name: str
    duration: int = 0
    band_id: int
    band_name: str | None = None
    # Tem prévia de 30s pública (CD do catálogo pago)?
    preview: bool = False


class PublicPlaylist(BaseModel):
    """Playlist vista por link público (sem login) — tracklist + prévias."""

    name: str
    owner_name: str | None = None
    track_count: int = 0
    tracks: list[PublicPlaylistTrack] = []


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
    is_hidden: bool = False
    # CD curtido pelo usuário (favorito de CD inteiro).
    is_favorite: bool = False
    # Dono do CD (quem postou) — para o hero da view de banda.
    owner_id: int | None = None
    owner_name: str | None = None
    owner_has_avatar: bool = False
    categories: list["CategoryOut"] = []


class BandHidden(BaseModel):
    hidden: bool


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


# ---------------- Vitrine pública (sem login) ----------------
class PublicTrack(BaseModel):
    """Faixa exibida na página pública do CD (sem caminho interno)."""

    id: int
    display_name: str
    duration: int = 0


class PublicCd(BaseModel):
    """CD (banda) na vitrine pública."""

    id: int
    name: str
    cover: bool = False
    track_count: int = 0
    category_names: list[str] = []
    owner_name: str | None = None
    created_at: datetime | None = None


class PublicCdDetail(PublicCd):
    """Detalhe do CD público, com a tracklist para a prévia."""

    tracks: list[PublicTrack] = []


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
    # Categoria opcional para já marcar o(s) CD(s) criado(s) no upload.
    category_id: int | None = None


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
    can_upload: bool = True
    plan_id: int | None = None
    plan_name: str | None = None
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


class AdminBilling(BaseModel):
    """Métricas de vendas/assinaturas para o dashboard do admin."""

    active_subscribers: int = 0
    estimated_mrr_cents: int = 0  # receita mensal estimada (assinantes ativos)
    top_plan_name: str | None = None
    top_plan_count: int = 0


class UsagePoint(BaseModel):
    """Um ponto do gráfico de uso (reproduções por dia)."""

    date: str  # YYYY-MM-DD
    plays: int


class AdminOverview(BaseModel):
    totals: AdminTotals
    billing: AdminBilling = Field(default_factory=AdminBilling)
    users: list[AdminUserStat] = []
    top_bands: list[TopBand] = []
    usage: list[UsagePoint] = []


# ---------------- Retrospectiva do usuário ("Wrapped") ----------------
class StatItem(BaseModel):
    """Um item de ranking pessoal (faixa, banda ou categoria mais tocada)."""

    id: int | None = None
    label: str
    sublabel: str | None = None
    plays: int


class MeStats(BaseModel):
    total_plays: int = 0
    total_minutes: int = 0
    unique_tracks: int = 0
    since: datetime | None = None
    top_tracks: list[StatItem] = []
    top_bands: list[StatItem] = []
    top_categories: list[StatItem] = []


# ---------------- Novidades (CDs novos desde a última visita) ----------------
class NewsCount(BaseModel):
    count: int = 0


# ---------------- Web Push (notificações de CD novo) ----------------
class PushKeys(BaseModel):
    """Chaves de criptografia da inscrição (vêm do PushSubscription do navegador)."""

    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1024)
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1024)


class PushKeyOut(BaseModel):
    """Chave pública VAPID em base64url (applicationServerKey)."""

    key: str


# ---------------- Comentários nos CDs ----------------
class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: int
    body: str
    user_id: int
    user_name: str
    has_avatar: bool = False
    mine: bool = False
    created_at: datetime
