"""Painel do administrador: visão geral com estatísticas de uso."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_admin
from ..database import get_session
from ..models import Archive, Band, PlayHistory, Track, User
from ..schemas import AdminOverview, AdminTotals, AdminUserStat, TopBand

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
        )
        .outerjoin(arch_subq, arch_subq.c.uid == User.id)
        .outerjoin(track_subq, track_subq.c.uid == User.id)
        .outerjoin(last_play_subq, last_play_subq.c.uid == User.id)
        .order_by(User.created_at)
    )
    users = [
        AdminUserStat(
            id=u.id,
            email=u.email,
            is_admin=u.is_admin,
            quota_bytes=u.quota_bytes,
            used_bytes=int(used_bytes),
            archive_count=int(archive_count),
            track_count=int(track_count),
            last_played_at=last_played_at,
            created_at=u.created_at,
        )
        for u, archive_count, used_bytes, track_count, last_played_at in rows.all()
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

    return AdminOverview(totals=totals, users=users, top_bands=top_bands)
