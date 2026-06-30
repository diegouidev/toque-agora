"""Configurações editáveis pelo admin (ex.: credenciais do Asaas)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..app_settings import get_all_public, set_config
from ..auth import require_admin
from ..database import get_session
from ..schemas import AppConfigUpdate

router = APIRouter(prefix="/api/admin/config", tags=["admin-config"])


@router.get("")
async def get_config_view(
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Estado das configs (segredos retornados só como flag 'preenchido')."""
    return await get_all_public(session)


@router.put("")
async def update_config(
    body: AppConfigUpdate,
    _admin=Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Salva as configs enviadas (campos None são ignorados; vazio limpa)."""
    if body.asaas_api_key is not None:
        await set_config(session, "asaas_api_key", body.asaas_api_key.strip())
    if body.asaas_base_url is not None:
        await set_config(session, "asaas_base_url", body.asaas_base_url.strip())
    if body.asaas_webhook_token is not None:
        await set_config(session, "asaas_webhook_token", body.asaas_webhook_token.strip())
    return await get_all_public(session)
