from datetime import datetime

from sqlalchemy import (
    Boolean,
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# Associação M:N entre bandas (CDs) e categorias (Forró/Samba/Pagode...).
band_categories = Table(
    "band_categories",
    Base.metadata,
    Column(
        "band_id",
        ForeignKey("bands.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Associação M:N entre planos e categorias (um plano = pacote de categorias).
plan_categories = Table(
    "plan_categories",
    Base.metadata,
    Column(
        "plan_id",
        ForeignKey("plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class User(Base):
    """Um usuário do sistema. Criado apenas pelo super admin."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Conta ativa? Se False, o login é recusado (bloqueio pelo admin).
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Nome de exibição (opcional; cai no email quando ausente).
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Nome do arquivo do avatar em disco (None se não houver).
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Quota total de armazenamento em bytes (soma dos arquivos no disco).
    quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Pode enviar arquivos? Ouvintes (clientes) têm False.
    can_upload: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Plano (pacote de categorias) que o usuário pode ouvir. None = sem plano.
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    # Expiração do plano (assinatura): acesso vale enquanto futuro.
    plan_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # ID do cliente no Asaas (reusado entre assinaturas).
    asaas_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    archives: Mapped[list["Archive"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    plan: Mapped["Plan | None"] = relationship(back_populates="users")


class Plan(Base):
    """Plano comercial = pacote de categorias liberadas a ouvintes."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    # Preço da assinatura mensal em centavos (ex. 1990 = R$ 19,90).
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    categories: Mapped[list["Category"]] = relationship(secondary=plan_categories)
    users: Mapped[list["User"]] = relationship(back_populates="plan")


class Archive(Base):
    """Um arquivo compactado (.rar/.zip) enviado, armazenado no volume.

    Unidade física de armazenamento e de exclusão. Um arquivo pode conter
    várias bandas (uma por subpasta de 1º nível).
    """

    __tablename__ = "archives"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Nome original do arquivo enviado (ex. "colecao.zip").
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    # Caminho absoluto onde o arquivo foi salvo dentro do container/volume.
    stored_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Tipo do arquivo: "rar" ou "zip".
    kind: Mapped[str] = mapped_column(String(8), nullable=False, default="rar")
    # Tamanho do arquivo no disco em bytes (usado no cálculo de quota).
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="archives")
    bands: Mapped[list["Band"]] = relationship(
        back_populates="archive",
        cascade="all, delete-orphan",
        order_by="Band.name",
    )


class Category(Base):
    """Categoria/gênero de CD (Forró, Samba, Pagode...). Criada pelo admin."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bands: Mapped[list["Band"]] = relationship(
        secondary=band_categories, back_populates="categories"
    )


class Band(Base):
    """Uma banda/coleção = pasta de 1º nível dentro de um arquivo (ou a raiz)."""

    __tablename__ = "bands"

    id: Mapped[int] = mapped_column(primary_key=True)
    archive_id: Mapped[int] = mapped_column(
        ForeignKey("archives.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Nome exibido (pasta de 1º nível, ou nome do arquivo se as faixas estão na raiz).
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    # Prefixo de caminho interno desta banda (ex. "Metallica/" ou "" para raiz).
    prefix: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    # Caminho interno da imagem de capa dentro do arquivo (None se não houver).
    cover_name: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Oculto na vitrine pública (não aparece em /novidades, landing nem /cd/{id}).
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    archive: Mapped["Archive"] = relationship(back_populates="bands")
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="band",
        cascade="all, delete-orphan",
        order_by="Track.index",
    )
    categories: Mapped[list["Category"]] = relationship(
        secondary=band_categories, back_populates="bands"
    )


class Track(Base):
    """Uma faixa MP3 indexada de dentro de um arquivo, pertencente a uma banda."""

    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    band_id: Mapped[int] = mapped_column(
        ForeignKey("bands.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Caminho interno completo da faixa dentro do arquivo (chave de extração).
    name: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Nome amigável exibido na UI (basename sem extensão).
    display_name: Mapped[str] = mapped_column(String(1024), nullable=False)
    # Tamanho descompactado da faixa em bytes.
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Ordem da faixa dentro da banda.
    index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Duração em segundos (lida do ID3 no upload; 0 se desconhecida).
    duration: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    band: Mapped["Band"] = relationship(back_populates="tracks")


class Playlist(Base):
    """Playlist criada por um usuário (lista ordenada de faixas)."""

    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    items: Mapped[list["PlaylistItem"]] = relationship(
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistItem.position",
    )


class PlaylistItem(Base):
    """Faixa dentro de uma playlist, com posição."""

    __tablename__ = "playlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    playlist_id: Mapped[int] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    playlist: Mapped["Playlist"] = relationship(back_populates="items")
    track: Mapped["Track"] = relationship()


class Favorite(Base):
    """Faixa curtida por um usuário (a 'playlist' especial Curtidas)."""

    __tablename__ = "favorites"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    track: Mapped["Track"] = relationship()


class PlaylistShare(Base):
    """Compartilhamento de uma playlist com outro usuário (acesso de leitura)."""

    __tablename__ = "playlist_share"

    id: Mapped[int] = mapped_column(primary_key=True)
    playlist_id: Mapped[int] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    shared_with_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PlayHistory(Base):
    """Registro de uma reprodução: faixa que o usuário tocou e quando.

    Alimenta a seção 'Tocadas recentemente'. Uma linha por play (não único).
    """

    __tablename__ = "play_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    track: Mapped["Track"] = relationship()


class Subscription(Base):
    """Assinatura de um usuário a um plano (gerida no Asaas)."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    # ID da assinatura no Asaas (sub_...).
    asaas_subscription_id: Mapped[str] = mapped_column(
        String(64), index=True, nullable=False
    )
    # pending | active | overdue | canceled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AppConfig(Base):
    """Configuração editável pelo admin (chave/valor). Ex.: credenciais do Asaas.

    Fica no banco para que cada instância (ex.: ao revender o sistema) configure
    o próprio gateway pelo painel, sem mexer no .env/servidor.
    """

    __tablename__ = "app_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
