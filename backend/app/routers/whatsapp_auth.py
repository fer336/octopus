import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.business import Business
from app.models.whatsapp_auth_request import WhatsAppAuthRequest
from app.schemas.whatsapp_auth_schemas import (
    WhatsAppAuthRequestCreate,
    WhatsAppAuthRequestResponse,
    WhatsAppAuthRequestUpdate,
    WhatsAppWebhookPayload,
)
from app.services.whatsapp_evolution_service import WhatsAppEvolutionService
from app.utils.security import get_current_business, get_current_user

settings = get_settings()

router = APIRouter(prefix="/whatsapp-auth", tags=["WhatsApp Authorization"])
webhook_router = APIRouter(prefix="/webhooks", tags=["WhatsApp Authorization Webhooks"])


def get_evolution_service() -> WhatsAppEvolutionService:
    return WhatsAppEvolutionService()


@router.post("/requests", response_model=WhatsAppAuthRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_auth_request(
    data: WhatsAppAuthRequestCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
    service: WhatsAppEvolutionService = Depends(get_evolution_service),
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.deleted_at.is_(None))
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Negocio no encontrado")

    token = secrets.token_urlsafe(8)
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=24)

    auth_request = WhatsAppAuthRequest(
        business_id=business_id,
        client_id=data.client_id,
        client_name=data.client_name,
        client_phone=data.client_phone,
        requester_name=data.requester_name,
        description=data.description,
        token=token,
        status="pending",
        whatsapp_instance=business.whatsapp_instance_name,
        expires_at=expires_at,
    )
    db.add(auth_request)
    await db.flush()

    jwt_payload: dict[str, Any] = {
        "sub": str(auth_request.id),
        "biz": str(business_id),
        "tok": token,
        "type": "whatsapp_auth",
    }
    jwt_token = jwt.encode(jwt_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    auth_request.jwt_token = jwt_token
    await db.commit()
    await db.refresh(auth_request)

    if business.whatsapp_instance_name:
        instance = business.whatsapp_instance_name
        payload: dict[str, Any] = {
            "number": f"{data.client_phone}@s.whatsapp.net",
            "title": "\U0001f510 Solicitud de Autorización",
            "description": (
                f"Empresa: {business.name}\n"
                f"Solicita: {data.description}\n"
                f"Cliente: {data.client_name}\n"
                f"Responsable: {data.requester_name}"
            ),
            "buttonText": "Responder",
            "footerText": "Esta solicitud expira en 24 hs.",
            "sections": [
                {
                    "title": "Selección de respuesta",
                    "rows": [
                        {
                            "title": "✅ Autorizar",
                            "description": f"Confirmar para {data.description}",
                            "rowId": f"A:{token}",
                        },
                        {
                            "title": "❌ Cancelar",
                            "description": "Rechazar la solicitud",
                            "rowId": f"C:{token}",
                        },
                    ],
                }
            ],
        }
        try:
            evo_response = await service.request(
                "POST", f"/message/sendList/{instance}", json=payload
            )
            if isinstance(evo_response, dict):
                msg_id = evo_response.get("key", {}).get("id") or evo_response.get("id")
                if msg_id:
                    auth_request.evolution_message_id = str(msg_id)
                    await db.commit()
                    await db.refresh(auth_request)
        except HTTPException:
            pass

    return WhatsAppAuthRequestResponse.model_validate(auth_request)


@router.get("/requests", response_model=list[WhatsAppAuthRequestResponse])
async def list_auth_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    q = select(WhatsAppAuthRequest).where(
        WhatsAppAuthRequest.business_id == business_id
    )
    if status_filter:
        q = q.where(WhatsAppAuthRequest.status == status_filter)
    q = q.order_by(WhatsAppAuthRequest.created_at.desc())
    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    items = result.scalars().all()
    return [WhatsAppAuthRequestResponse.model_validate(i) for i in items]


@router.patch("/requests/{request_id}", response_model=WhatsAppAuthRequestResponse)
async def update_auth_request(
    request_id: UUID,
    data: WhatsAppAuthRequestUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    result = await db.execute(
        select(WhatsAppAuthRequest).where(
            WhatsAppAuthRequest.id == request_id,
            WhatsAppAuthRequest.business_id == business_id,
        )
    )
    auth_request = result.scalar_one_or_none()
    if not auth_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")

    auth_request.status = data.status
    if data.status in ("authorized", "cancelled"):
        auth_request.responded_at = datetime.utcnow()
    await db.commit()
    await db.refresh(auth_request)
    return WhatsAppAuthRequestResponse.model_validate(auth_request)


@webhook_router.post("/whatsapp-auth")
async def whatsapp_auth_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "invalid_json"}

    payload = WhatsAppWebhookPayload.model_validate(body)
    data = payload.data or {}

    message = data.get("message") or {}
    list_response = message.get("listResponseMessage") or {}
    reply = list_response.get("singleSelectReply") or {}
    row_id: str = reply.get("selectedRowId", "")

    if not row_id or (not row_id.startswith("A:") and not row_id.startswith("C:")):
        return {"ok": True, "skipped": True}

    new_status = "authorized" if row_id.startswith("A:") else "cancelled"
    token = row_id[2:]

    result = await db.execute(
        select(WhatsAppAuthRequest).where(WhatsAppAuthRequest.token == token)
    )
    auth_request = result.scalar_one_or_none()
    if not auth_request:
        return {"ok": True, "skipped": True, "reason": "token_not_found"}

    auth_request.status = new_status
    auth_request.responded_at = datetime.utcnow()
    await db.commit()

    return {"ok": True}
