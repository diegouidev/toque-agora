"""Assinaturas (Asaas): planos públicos, assinar, status e webhook."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import asaas
from ..app_settings import get_config
from ..auth import get_current_user
from ..database import get_session
from ..models import Plan, Subscription, User
from ..schemas import (
    BillingStatus,
    PublicPlan,
    SubscribeIn,
    SubscribeOut,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])

# margem além dos 30 dias para não cortar acesso no dia exato da renovação
_GRACE_DAYS = 33


@router.get("/plans", response_model=list[PublicPlan])
async def public_plans(
    session: AsyncSession = Depends(get_session),
) -> list[PublicPlan]:
    """Planos com preço para a vitrine (apenas planos com preço > 0)."""
    res = await session.execute(
        select(Plan).options(selectinload(Plan.categories)).order_by(Plan.name)
    )
    out = []
    for p in res.scalars().all():
        if p.price_cents <= 0:
            continue
        out.append(
            PublicPlan(
                id=p.id,
                name=p.name,
                price_cents=p.price_cents,
                category_names=[c.name for c in p.categories],
            )
        )
    return out


@router.post("/subscribe", response_model=SubscribeOut)
async def subscribe(
    body: SubscribeIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SubscribeOut:
    plan = await session.get(Plan, body.plan_id)
    if plan is None or plan.price_cents <= 0:
        raise HTTPException(status_code=404, detail="Plano não encontrado ou sem preço.")

    # Garante o customer no Asaas.
    if not user.asaas_customer_id:
        cid = await asaas.create_customer(session, user.display_name or user.email, user.email)
        user.asaas_customer_id = cid
        await session.commit()

    sub = await asaas.create_subscription(
        session,
        customer_id=user.asaas_customer_id,
        value_reais=plan.price_cents / 100.0,
        description=f"Assinatura {plan.name} - TOQUE AGORA",
    )
    asaas_sub_id = sub["id"]

    session.add(
        Subscription(
            user_id=user.id,
            plan_id=plan.id,
            asaas_subscription_id=asaas_sub_id,
            status="pending",
        )
    )
    await session.commit()

    invoice_url = await asaas.first_invoice_url(session, asaas_sub_id)
    return SubscribeOut(invoice_url=invoice_url, status="pending")


@router.get("/status", response_model=BillingStatus)
async def billing_status(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BillingStatus:
    res = await session.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .order_by(Subscription.created_at.desc())
    )
    sub = res.scalars().first()
    plan_name = None
    if user.plan_id:
        plan = await session.get(Plan, user.plan_id)
        plan_name = plan.name if plan else None
    return BillingStatus(
        status=sub.status if sub else "none",
        plan_name=plan_name,
        expires_at=user.plan_expires_at,
    )


@router.post("/webhook")
async def asaas_webhook(
    request: Request,
    asaas_access_token: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Recebe eventos de cobrança do Asaas. Validado por token configurável.

    O Asaas envia o token no header 'asaas-access-token' (configurado no painel).
    """
    expected = await get_config(session, "asaas_webhook_token")
    if expected and asaas_access_token != expected:
        raise HTTPException(status_code=401, detail="Token de webhook inválido.")

    body = await request.json()
    event = body.get("event", "")
    payment = body.get("payment") or {}
    sub_id = payment.get("subscription")

    # Só nos interessam pagamentos vinculados a uma assinatura.
    if not sub_id:
        return Response(status_code=200)

    res = await session.execute(
        select(Subscription).where(Subscription.asaas_subscription_id == sub_id)
    )
    sub = res.scalars().first()
    if sub is None:
        return Response(status_code=200)  # idempotente / desconhecido

    user = await session.get(User, sub.user_id)
    if user is None:
        return Response(status_code=200)

    if event in ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"):
        # Libera/estende o acesso.
        new_end = datetime.now(timezone.utc) + timedelta(days=_GRACE_DAYS)
        sub.status = "active"
        sub.current_period_end = new_end
        user.plan_id = sub.plan_id
        user.plan_expires_at = new_end
        await session.commit()
    elif event in ("PAYMENT_OVERDUE",):
        sub.status = "overdue"
        await session.commit()
    elif event in ("PAYMENT_DELETED", "PAYMENT_REFUNDED", "SUBSCRIPTION_DELETED"):
        sub.status = "canceled"
        await session.commit()

    return Response(status_code=200)
