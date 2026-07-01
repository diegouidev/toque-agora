"""Cliente da API do Asaas (assinaturas recorrentes).

As credenciais vêm das configs dinâmicas (banco, editáveis pelo admin) com
fallback no .env — ver app_settings.py.
"""

import logging
from datetime import date

import httpx
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .app_settings import get_config

logger = logging.getLogger("asaas")


class AsaasError(Exception):
    pass


async def _client(session: AsyncSession) -> httpx.AsyncClient:
    api_key = await get_config(session, "asaas_api_key")
    base_url = await get_config(session, "asaas_base_url")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Pagamentos não configurados. O administrador precisa definir a chave do Asaas.",
        )
    return httpx.AsyncClient(
        base_url=base_url.rstrip("/"),
        headers={"access_token": api_key, "Content-Type": "application/json"},
        timeout=20.0,
    )


async def _post(session: AsyncSession, path: str, payload: dict) -> dict:
    async with await _client(session) as c:
        try:
            r = await c.post(path, json=payload)
        except httpx.HTTPError as exc:
            logger.warning("Asaas POST %s falhou na conexão: %s", path, exc)
            raise HTTPException(status_code=502, detail=f"Falha ao falar com o Asaas: {exc}")
    if r.status_code >= 400:
        logger.warning("Asaas POST %s -> %s: %s", path, r.status_code, r.text[:500])
        raise HTTPException(status_code=502, detail=f"Asaas: {r.text[:300]}")
    return r.json()


async def _get(session: AsyncSession, path: str) -> dict:
    async with await _client(session) as c:
        try:
            r = await c.get(path)
        except httpx.HTTPError as exc:
            logger.warning("Asaas GET %s falhou na conexão: %s", path, exc)
            raise HTTPException(status_code=502, detail=f"Falha ao falar com o Asaas: {exc}")
    if r.status_code >= 400:
        logger.warning("Asaas GET %s -> %s: %s", path, r.status_code, r.text[:500])
        raise HTTPException(status_code=502, detail=f"Asaas: {r.text[:300]}")
    return r.json()


async def create_customer(
    session: AsyncSession, name: str, email: str, cpf_cnpj: str | None = None
) -> str:
    payload: dict = {"name": name or email, "email": email}
    if cpf_cnpj:
        # O Asaas exige CPF/CNPJ (só dígitos) para gerar cobranças em produção.
        payload["cpfCnpj"] = cpf_cnpj
    data = await _post(session, "/customers", payload)
    return data["id"]


async def create_subscription(
    session: AsyncSession,
    customer_id: str,
    value_reais: float,
    description: str,
) -> dict:
    """Cria assinatura mensal. billingType UNDEFINED deixa o cliente escolher PIX/cartão."""
    payload = {
        "customer": customer_id,
        "billingType": "UNDEFINED",
        "value": round(value_reais, 2),
        "cycle": "MONTHLY",
        "nextDueDate": date.today().isoformat(),
        "description": description,
    }
    return await _post(session, "/subscriptions", payload)


async def delete_subscription(session: AsyncSession, subscription_id: str) -> None:
    """Cancela (remove) a assinatura recorrente no Asaas — sem novas cobranças."""
    async with await _client(session) as c:
        try:
            r = await c.delete(f"/subscriptions/{subscription_id}")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Falha ao falar com o Asaas: {exc}")
    # 404 = já não existe no Asaas: tratamos como cancelado (idempotente).
    if r.status_code >= 400 and r.status_code != 404:
        raise HTTPException(status_code=502, detail=f"Asaas: {r.text[:300]}")


async def first_invoice_url(session: AsyncSession, subscription_id: str) -> str | None:
    """URL da fatura da 1ª cobrança da assinatura (onde o cliente paga)."""
    data = await _get(session, f"/subscriptions/{subscription_id}/payments")
    items = data.get("data") or []
    if not items:
        return None
    return items[0].get("invoiceUrl")
