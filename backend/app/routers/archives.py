import os

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from ..access import can_access_band
from ..archive_service import (
    ArchiveServiceError,
    content_type_for_image,
    extract_file_bytes,
)
from ..auth import get_current_user
from ..database import get_session
from ..models import Archive, Band, Favorite, Track, User
from ..schemas import BandSummary, NameUpdate, TrackOut

router = APIRouter(prefix="/api", tags=["bands"])


@router.get("/bands", response_model=list[BandSummary])
async def list_bands(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BandSummary]:
    """Lista as bandas do usuário (admin vê todas) com contagem de faixas."""
    count_subq = (
        select(Track.band_id, func.count(Track.id).label("track_count"))
        .group_by(Track.band_id)
        .subquery()
    )
    query = (
        select(
            Band,
            Archive.kind,
            func.coalesce(count_subq.c.track_count, 0),
            User.id,
            User.display_name,
            User.email,
            User.avatar_filename,
        )
        .join(Archive, Band.archive_id == Archive.id)
        .join(User, User.id == Archive.owner_id)
        .outerjoin(count_subq, Band.id == count_subq.c.band_id)
        .order_by(Archive.created_at.desc(), Band.name)
    )
    if not user.is_admin:
        query = query.where(Archive.owner_id == user.id)

    result = await session.execute(query)
    return [
        BandSummary(
            id=band.id,
            archive_id=band.archive_id,
            name=band.name,
            kind=kind,
            track_count=track_count,
            has_cover=band.cover_name is not None,
            owner_id=owner_id,
            owner_name=(owner_name or owner_email),
            owner_has_avatar=owner_avatar is not None,
        )
        for band, kind, track_count, owner_id, owner_name, owner_email, owner_avatar in result.all()
    ]


async def _band_owned_or_admin(
    band_id: int, user: User, session: AsyncSession
) -> Band:
    band = await session.get(Band, band_id)
    if band is None:
        raise HTTPException(status_code=404, detail="Banda não encontrada.")
    if not user.is_admin:
        archive = await session.get(Archive, band.archive_id)
        if archive is None or archive.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Acesso negado.")
    return band


@router.get("/bands/{band_id}/tracks", response_model=list[TrackOut])
async def get_band_tracks(
    band_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TrackOut]:
    """Retorna as faixas de uma banda do usuário (ou de qualquer uma, se admin)."""
    await _band_owned_or_admin(band_id, user, session)
    result = await session.execute(
        select(Track).where(Track.band_id == band_id).order_by(Track.index)
    )
    tracks = list(result.scalars().all())
    fav_res = await session.execute(
        select(Favorite.track_id).where(Favorite.owner_id == user.id)
    )
    fav_ids = set(fav_res.scalars().all())
    return [
        TrackOut(
            id=t.id,
            band_id=t.band_id,
            name=t.name,
            display_name=t.display_name,
            size=t.size,
            index=t.index,
            duration=t.duration,
            is_favorite=t.id in fav_ids,
        )
        for t in tracks
    ]


@router.get("/bands/{band_id}/cover")
async def get_band_cover(
    band_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Serve a imagem de capa da banda extraída do arquivo (cookie de sessão)."""
    band = await session.get(Band, band_id)
    if band is None or not band.cover_name:
        raise HTTPException(status_code=404, detail="Sem capa.")
    archive = await session.get(Archive, band.archive_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if not await can_access_band(session, user, band_id):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    try:
        data = await run_in_threadpool(
            extract_file_bytes, archive.stored_path, archive.kind, band.cover_name
        )
    except ArchiveServiceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return Response(
        content=data,
        media_type=content_type_for_image(band.cover_name),
        headers={
            "Cache-Control": "private, max-age=86400",
            # Defesa contra MIME sniffing (ex. SVG/HTML disfarçado de imagem).
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


@router.patch("/bands/{band_id}", response_model=BandSummary)
async def rename_band(
    band_id: int,
    body: NameUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BandSummary:
    """Renomeia o nome exibido de uma banda (dono ou admin)."""
    band = await _band_owned_or_admin(band_id, user, session)
    band.name = body.name.strip()
    await session.commit()
    count = await session.scalar(
        select(func.count(Track.id)).where(Track.band_id == band_id)
    )
    archive = await session.get(Archive, band.archive_id)
    return BandSummary(
        id=band.id,
        archive_id=band.archive_id,
        name=band.name,
        kind=archive.kind if archive else "",
        track_count=int(count or 0),
        has_cover=band.cover_name is not None,
    )


@router.patch("/tracks/{track_id}", response_model=TrackOut)
async def rename_track(
    track_id: int,
    body: NameUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TrackOut:
    """Renomeia o nome exibido de uma faixa (dono ou admin)."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    await _band_owned_or_admin(track.band_id, user, session)
    track.display_name = body.name.strip()
    await session.commit()
    fav = await session.scalar(
        select(Favorite.id).where(
            Favorite.owner_id == user.id, Favorite.track_id == track_id
        )
    )
    return TrackOut(
        id=track.id,
        band_id=track.band_id,
        name=track.name,
        display_name=track.display_name,
        size=track.size,
        index=track.index,
        duration=track.duration,
        is_favorite=fav is not None,
    )


@router.delete("/archives/{archive_id}", status_code=204)
async def delete_archive(
    archive_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Exclui um arquivo para sempre: remove do disco e todas as suas bandas.

    Só o dono do arquivo (ou o admin) pode excluir.
    """
    archive = await session.get(Archive, archive_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    if not user.is_admin and archive.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    stored_path = archive.stored_path

    await session.delete(archive)
    await session.commit()

    try:
        if stored_path and os.path.exists(stored_path):
            os.remove(stored_path)
    except OSError:
        pass

    return Response(status_code=204)
