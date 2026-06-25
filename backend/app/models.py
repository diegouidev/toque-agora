from datetime import datetime

from sqlalchemy import Boolean, BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    """Um usuário do sistema. Criado apenas pelo super admin."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Quota total de armazenamento em bytes (soma dos arquivos no disco).
    quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    archives: Mapped[list["Archive"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    archive: Mapped["Archive"] = relationship(back_populates="bands")
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="band",
        cascade="all, delete-orphan",
        order_by="Track.index",
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
