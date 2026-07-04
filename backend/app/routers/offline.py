"""Licença de reprodução offline (DRM leve).

O app baixa faixas cifradas (AES-GCM) no dispositivo; para tocar, precisa da
chave, que só é entregue a assinante com plano válido. A chave é DERIVADA do
segredo do servidor + id do usuário (sem coluna no banco), e a licença tem
validade (TTL) — o app renova ao abrir online. Sem assinatura ativa, o servidor
recusa e os downloads travam até renovar.
"""

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..access import _plan_is_valid
from ..auth import get_current_user
from ..config import settings
from ..database import get_session
from ..models import User

router = APIRouter(prefix="/api/offline", tags=["offline"])


class OfflineLicense(BaseModel):
    # Chave AES de 256 bits em base64 (importada no Web Crypto do cliente).
    key: str
    expires_at: datetime


def _derive_key_b64(user_id: int) -> str:
    """Chave AES-256 determinística por usuário, derivada do segredo do servidor."""
    mac = hmac.new(
        settings.offline_key_base.encode(),
        f"offline:{user_id}".encode(),
        hashlib.sha256,
    ).digest()  # 32 bytes = AES-256
    return base64.b64encode(mac).decode()


@router.get("/license", response_model=OfflineLicense)
async def get_license(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OfflineLicense:
    """Emite a licença offline — só para assinante com plano válido.

    Admin/uploader (que sobe o próprio acervo) também recebe, para poder testar.
    """
    if not (user.is_admin or user.can_upload or _plan_is_valid(user)):
        raise HTTPException(
            status_code=403,
            detail="Downloads offline exigem uma assinatura ativa.",
        )
    expires = datetime.now(timezone.utc) + timedelta(
        days=settings.offline_license_ttl_days
    )
    return OfflineLicense(key=_derive_key_b64(user.id), expires_at=expires)
