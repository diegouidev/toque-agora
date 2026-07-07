"""Comentários nos CDs (prova social). Ler/comentar exige acesso ao CD;
apagar é permitido ao autor ou ao admin."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import can_access_band
from ..auth import get_current_user
from ..database import get_session
from ..models import Band, CdComment, User
from ..schemas import CommentCreate, CommentOut

router = APIRouter(prefix="/api", tags=["comments"])

_LIMIT = 100


def _to_out(c: CdComment, u: User | None, me_id: int) -> CommentOut:
    name = (u.display_name or u.email.split("@")[0]) if u else "usuário"
    return CommentOut(
        id=c.id,
        body=c.body,
        user_id=c.user_id,
        user_name=name,
        has_avatar=bool(u and u.avatar_filename),
        mine=c.user_id == me_id,
        created_at=c.created_at,
    )


@router.get("/bands/{band_id}/comments", response_model=list[CommentOut])
async def list_comments(
    band_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CommentOut]:
    if not await can_access_band(session, user, band_id):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    res = await session.execute(
        select(CdComment, User)
        .join(User, User.id == CdComment.user_id)
        .where(CdComment.band_id == band_id)
        .order_by(CdComment.created_at.desc())
        .limit(_LIMIT)
    )
    return [_to_out(c, u, user.id) for c, u in res.all()]


@router.post("/bands/{band_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    band_id: int,
    body: CommentCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CommentOut:
    band = await session.get(Band, band_id)
    if band is None:
        raise HTTPException(status_code=404, detail="CD não encontrado.")
    if not await can_access_band(session, user, band_id):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    comment = CdComment(band_id=band_id, user_id=user.id, body=body.body.strip())
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    return _to_out(comment, user, user.id)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    comment = await session.get(CdComment, comment_id)
    if comment is None:
        return Response(status_code=204)  # idempotente
    if comment.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Você só pode apagar seu comentário.")
    await session.delete(comment)
    await session.commit()
    return Response(status_code=204)
