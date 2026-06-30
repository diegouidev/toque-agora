"""Configurações dinâmicas (editáveis pelo admin), com fallback no .env.

Permite que cada instância configure o gateway (Asaas) pelo painel, sem mexer
no servidor — útil ao revender o sistema. Chaves ficam na tabela app_config;
se não houver valor no banco, cai no valor do .env (settings).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import AppConfig

# Chaves configuráveis e o atributo do .env usado como fallback.
_FALLBACK = {
    "asaas_api_key": "asaas_api_key",
    "asaas_base_url": "asaas_base_url",
    "asaas_webhook_token": "asaas_webhook_token",
}

# Chaves sensíveis: nunca devolver o valor cheio para o front (só se está setado).
SECRET_KEYS = {"asaas_api_key", "asaas_webhook_token"}


async def get_config(session: AsyncSession, key: str) -> str:
    """Valor do banco; se vazio/ausente, usa o fallback do .env."""
    row = await session.get(AppConfig, key)
    if row is not None and row.value:
        return row.value
    fb = _FALLBACK.get(key)
    return getattr(settings, fb) if fb else ""


async def set_config(session: AsyncSession, key: str, value: str) -> None:
    row = await session.get(AppConfig, key)
    if row is None:
        session.add(AppConfig(key=key, value=value))
    else:
        row.value = value
    await session.commit()


async def get_all_public(session: AsyncSession) -> dict[str, object]:
    """Estado das configs para o admin: valores não-sensíveis e flags 'configurado'."""
    result: dict[str, object] = {}
    for key in _FALLBACK:
        val = await get_config(session, key)
        if key in SECRET_KEYS:
            result[key + "_set"] = bool(val)  # só informa se está preenchido
        else:
            result[key] = val
    return result
