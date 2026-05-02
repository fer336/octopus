"""
Router de activación de planes por pagos (MercadoPago vía n8n).
"""

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User

router = APIRouter(prefix="/api/billing/mp", tags=["billing"])
settings = get_settings()


class ActivatePlanRequest(BaseModel):
    email: EmailStr
    plan_code: Literal["excel", "basico", "negocio", "completo", "premium"]
    payment_id: str = Field(..., min_length=3, max_length=128)
    payment_status: str = Field(default="approved")


class ActivatePlanResponse(BaseModel):
    ok: bool
    business_id: str
    plan_code: str
    message: str


def _assert_n8n_secret(header_value: str | None) -> None:
    secret = getattr(settings, "BILLING_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BILLING_WEBHOOK_SECRET no configurado en backend.",
        )

    if not header_value or header_value != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook secret inválido.",
        )


def _apply_plan_flags(business: Business, plan_code: str) -> None:
    # Base conservadora: todo apagado y se habilita por plan
    business.invoicing_enabled = False
    business.receipts_enabled = False
    business.quotation_enabled = False
    business.inventory_enabled = False
    business.price_update_enabled = False
    business.reports_enabled = False
    business.sql_backup_enabled = False
    business.current_account_mode = "disabled"

    if plan_code == "excel":
        return

    # Básico
    business.quotation_enabled = True
    business.receipts_enabled = True
    business.inventory_enabled = True
    business.price_update_enabled = True

    if plan_code in {"negocio", "completo", "premium"}:
        business.current_account_mode = "automatic"

    if plan_code in {"completo", "premium"}:
        business.invoicing_enabled = True
        business.reports_enabled = True

    if plan_code == "premium":
        business.sql_backup_enabled = True


@router.post("/activate", response_model=ActivatePlanResponse)
async def activate_plan_after_payment(
    payload: ActivatePlanRequest,
    db: AsyncSession = Depends(get_db),
    x_billing_secret: str | None = Header(default=None, alias="X-Billing-Secret"),
):
    """
    Endpoint idempotente para activar plan al aprobarse un pago en MercadoPago.
    Lo invoca n8n tras verificar estado=approved.
    """
    _assert_n8n_secret(x_billing_secret)

    if payload.payment_status.lower() != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se activan planes con payment_status=approved.",
        )

    processed_logs_result = await db.execute(
        select(AuditLog).where(AuditLog.resource_type == "billing_activation")
    )
    processed_logs = processed_logs_result.scalars().all()
    if any((log.details or {}).get("payment_id") == payload.payment_id for log in processed_logs):
        return ActivatePlanResponse(
            ok=True,
            business_id="",
            plan_code=payload.plan_code,
            message="Pago ya procesado (idempotente).",
        )

    user_result = await db.execute(
        select(User).where(
            User.email == payload.email.lower(),
            User.deleted_at.is_(None),
        )
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado para el email")

    membership_result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user.id,
            TenantMembership.deleted_at.is_(None),
        )
    )
    membership = membership_result.scalars().first()
    if not membership:
        raise HTTPException(status_code=404, detail="El usuario no tiene tenant asignado")

    business_result = await db.execute(
        select(Business).where(
            Business.id == membership.business_id,
            Business.deleted_at.is_(None),
        )
    )
    business = business_result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    _apply_plan_flags(business, payload.plan_code)
    now = datetime.utcnow()
    business.subscription_starts_at = now
    business.subscription_ends_at = now + timedelta(days=30)
    business.subscription_status = "active"
    business.subscription_blocked_reason = None

    log = AuditLog(
        user_id=user.id,
        business_id=business.id,
        action="activate",
        resource_type="billing_activation",
        resource_id=business.id,
        details={
            "email": payload.email,
            "plan_code": payload.plan_code,
            "payment_id": payload.payment_id,
            "payment_status": payload.payment_status,
            "note": (
                "Si el plan incluye facturación electrónica, se coordina onboarding manual "
                "para configurar punto de venta ARCA/AFIP."
            ),
        },
    )
    db.add(log)
    await db.commit()

    return ActivatePlanResponse(
        ok=True,
        business_id=str(business.id),
        plan_code=payload.plan_code,
        message="Plan activado correctamente.",
    )
