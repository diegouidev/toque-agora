"""Painel do administrador: visão geral com estatísticas de uso e vendas."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin, used_bytes_for
from ..database import get_session
from ..models import Archive, Band, PlayHistory, Plan, Playlist, PlaylistItem, Track, User
from ..schemas import (
    AdminBilling,
    AdminOverview,
    AdminTotals,
    AdminUserDetail,
    AdminUserStat,
    PlaylistSummary,
    TopBand,
    UsagePoint,
)


def _plan_active_filter():
    """Condição SQL: usuário com plano válido (não vencido)."""
    now = datetime.now(timezone.utc)
    return User.plan_id.isnot(None) & or_(
        User.plan_expires_at.is_(None), User.plan_expires_at >= now
    )

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverview)
async def overview(
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminOverview:
    """Totais globais, estatísticas por usuário e bandas mais tocadas."""
    # ----- Totais globais -----
    totals = AdminTotals(
        users=int(await session.scalar(select(func.count(User.id))) or 0),
        used_bytes=int(
            await session.scalar(select(func.coalesce(func.sum(Archive.size_bytes), 0)))
            or 0
        ),
        archives=int(await session.scalar(select(func.count(Archive.id))) or 0),
        bands=int(await session.scalar(select(func.count(Band.id))) or 0),
        tracks=int(await session.scalar(select(func.count(Track.id))) or 0),
        plays=int(await session.scalar(select(func.count(PlayHistory.id))) or 0),
    )

    # ----- Subqueries por usuário (owner = dono do arquivo) -----
    arch_subq = (
        select(
            Archive.owner_id.label("uid"),
            func.count(Archive.id).label("archive_count"),
            func.coalesce(func.sum(Archive.size_bytes), 0).label("used_bytes"),
        )
        .group_by(Archive.owner_id)
        .subquery()
    )
    track_subq = (
        select(
            Archive.owner_id.label("uid"),
            func.count(Track.id).label("track_count"),
        )
        .join(Band, Band.archive_id == Archive.id)
        .join(Track, Track.band_id == Band.id)
        .group_by(Archive.owner_id)
        .subquery()
    )
    last_play_subq = (
        select(
            PlayHistory.owner_id.label("uid"),
            func.max(PlayHistory.played_at).label("last_played_at"),
        )
        .group_by(PlayHistory.owner_id)
        .subquery()
    )

    rows = await session.execute(
        select(
            User,
            func.coalesce(arch_subq.c.archive_count, 0),
            func.coalesce(arch_subq.c.used_bytes, 0),
            func.coalesce(track_subq.c.track_count, 0),
            last_play_subq.c.last_played_at,
            Plan.name,
        )
        .outerjoin(arch_subq, arch_subq.c.uid == User.id)
        .outerjoin(track_subq, track_subq.c.uid == User.id)
        .outerjoin(last_play_subq, last_play_subq.c.uid == User.id)
        .outerjoin(Plan, Plan.id == User.plan_id)
        .order_by(User.created_at)
    )
    users = [
        AdminUserStat(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            is_admin=u.is_admin,
            is_active=u.is_active,
            has_avatar=u.avatar_filename is not None,
            can_upload=u.can_upload,
            plan_id=u.plan_id,
            plan_name=plan_name,
            quota_bytes=u.quota_bytes,
            used_bytes=int(used_bytes),
            archive_count=int(archive_count),
            track_count=int(track_count),
            last_played_at=last_played_at,
            created_at=u.created_at,
        )
        for u, archive_count, used_bytes, track_count, last_played_at, plan_name in rows.all()
    ]

    # ----- Bandas mais tocadas (global) -----
    top_res = await session.execute(
        select(Band.id, Band.name, func.count(PlayHistory.id).label("plays"))
        .join(Track, Track.band_id == Band.id)
        .join(PlayHistory, PlayHistory.track_id == Track.id)
        .group_by(Band.id, Band.name)
        .order_by(func.count(PlayHistory.id).desc())
        .limit(10)
    )
    top_bands = [
        TopBand(id=bid, name=name, plays=int(plays))
        for bid, name, plays in top_res.all()
    ]

    # ----- Vendas / assinaturas -----
    active_filter = _plan_active_filter()
    active_subscribers = int(
        await session.scalar(select(func.count(User.id)).where(active_filter)) or 0
    )
    estimated_mrr = int(
        await session.scalar(
            select(func.coalesce(func.sum(Plan.price_cents), 0))
            .select_from(User)
            .join(Plan, Plan.id == User.plan_id)
            .where(active_filter)
        )
        or 0
    )
    top_plan_row = (
        await session.execute(
            select(Plan.name, func.count(User.id).label("c"))
            .select_from(User)
            .join(Plan, Plan.id == User.plan_id)
            .where(active_filter)
            .group_by(Plan.name)
            .order_by(func.count(User.id).desc())
            .limit(1)
        )
    ).first()
    billing = AdminBilling(
        active_subscribers=active_subscribers,
        estimated_mrr_cents=estimated_mrr,
        top_plan_name=top_plan_row[0] if top_plan_row else None,
        top_plan_count=int(top_plan_row[1]) if top_plan_row else 0,
    )

    # ----- Uso ao longo do tempo (reproduções/dia, últimos 30 dias) -----
    since = datetime.now(timezone.utc) - timedelta(days=30)
    day = func.date(PlayHistory.played_at)
    usage_res = await session.execute(
        select(day.label("d"), func.count(PlayHistory.id).label("c"))
        .where(PlayHistory.played_at >= since)
        .group_by(day)
        .order_by(day)
    )
    usage = [
        UsagePoint(date=str(d), plays=int(c)) for d, c in usage_res.all()
    ]

    return AdminOverview(
        totals=totals,
        billing=billing,
        users=users,
        top_bands=top_bands,
        usage=usage,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def user_detail(
    user_id: int,
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminUserDetail:
    """Perfil completo de um usuário (admin)."""
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    archive_count = int(
        await session.scalar(
            select(func.count(Archive.id)).where(Archive.owner_id == user_id)
        )
        or 0
    )
    track_count = int(
        await session.scalar(
            select(func.count(Track.id))
            .select_from(Track)
            .join(Band, Band.id == Track.band_id)
            .join(Archive, Archive.id == Band.archive_id)
            .where(Archive.owner_id == user_id)
        )
        or 0
    )
    playlist_count = int(
        await session.scalar(
            select(func.count(Playlist.id)).where(Playlist.owner_id == user_id)
        )
        or 0
    )
    last_played_at = await session.scalar(
        select(func.max(PlayHistory.played_at)).where(PlayHistory.owner_id == user_id)
    )
    used = await used_bytes_for(session, user_id)

    return AdminUserDetail(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        is_admin=u.is_admin,
        is_active=u.is_active,
        has_avatar=u.avatar_filename is not None,
        quota_bytes=u.quota_bytes,
        used_bytes=used,
        archive_count=archive_count,
        track_count=track_count,
        playlist_count=playlist_count,
        last_played_at=last_played_at,
        created_at=u.created_at,
    )


@router.get("/users/{user_id}/playlists", response_model=list[PlaylistSummary])
async def user_playlists(
    user_id: int,
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[PlaylistSummary]:
    """Playlists de um usuário (admin)."""
    count_subq = (
        select(PlaylistItem.playlist_id, func.count(PlaylistItem.id).label("c"))
        .group_by(PlaylistItem.playlist_id)
        .subquery()
    )
    res = await session.execute(
        select(Playlist, func.coalesce(count_subq.c.c, 0))
        .outerjoin(count_subq, Playlist.id == count_subq.c.playlist_id)
        .where(Playlist.owner_id == user_id)
        .order_by(Playlist.created_at.desc())
    )
    return [PlaylistSummary(id=p.id, name=p.name, track_count=c) for p, c in res.all()]
