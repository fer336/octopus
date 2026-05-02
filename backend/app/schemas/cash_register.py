"""
Schemas Pydantic para el módulo de Caja.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.cash_register import CashMovementType, CashPaymentMethod, CashRegisterStatus

# ─── Requests ────────────────────────────────────────────────────────────────

class CashOpenRequest(BaseModel):
    """Cuerpo para abrir una caja."""
    opening_amount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        description="Monto inicial de efectivo (fondo de caja)",
    )


class CashCloseRequest(BaseModel):
    """Cierre automático de caja (sin contar efectivo manualmente)."""
    # counted_cash es opcional: si no se pasa, usa el efectivo esperado
    counted_cash: Decimal | None = Field(
        default=None,
        ge=0,
        description="Efectivo físico contado. Si no se pasa, se usa el esperado automáticamente",
    )
    difference_reason: str | None = Field(
        default=None,
        max_length=500,
        description="Motivo de diferencia. Obligatorio si hay diferencia != 0",
    )


class CashMovementCreateRequest(BaseModel):
    """Cuerpo para registrar un movimiento manual (INCOME o EXPENSE)."""
    type: CashMovementType = Field(description="Solo INCOME o EXPENSE")
    payment_method: CashPaymentMethod
    amount: Decimal = Field(gt=0, description="Monto del movimiento, siempre positivo")
    description: str = Field(min_length=1, max_length=255)

    @field_validator("type")
    @classmethod
    def only_manual_types(cls, v: CashMovementType) -> CashMovementType:
        """Solo se permiten movimientos manuales desde este endpoint."""
        if v not in (CashMovementType.INCOME, CashMovementType.EXPENSE):
            raise ValueError("Solo se pueden crear movimientos de tipo INCOME o EXPENSE manualmente")
        return v


# ─── Responses ────────────────────────────────────────────────────────────────

class CashMovementResponse(BaseModel):
    """Respuesta de un movimiento de caja."""
    id: UUID
    type: CashMovementType
    payment_method: CashPaymentMethod
    amount: Decimal
    description: str
    voucher_id: UUID | None
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentMethodSummary(BaseModel):
    """Totales de una caja agrupados por método de pago."""
    payment_method: CashPaymentMethod
    total_sales: Decimal = Decimal("0")
    total_payments_received: Decimal = Decimal("0")
    total_income: Decimal = Decimal("0")
    total_expense: Decimal = Decimal("0")
    net: Decimal = Decimal("0")  # entradas - salidas


class CashSummaryResponse(BaseModel):
    """Resumen de totales de la caja por método de pago."""
    by_method: list[PaymentMethodSummary]
    total_net: Decimal
    expected_cash: Decimal  # fondo inicial + neto en efectivo


class CashRegisterResponse(BaseModel):
    """Respuesta completa de una caja."""
    id: UUID
    business_id: UUID
    opened_by: UUID
    closed_by: UUID | None
    status: CashRegisterStatus
    is_expired: bool  # calculado: status=OPEN y opened_at < NOW()-24hs
    opening_amount: Decimal
    opened_at: datetime
    closed_at: datetime | None
    counted_cash: Decimal | None
    difference: Decimal | None
    difference_reason: str | None
    closing_pdf_path: str | None
    movements: list[CashMovementResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class CashRegisterSummaryResponse(BaseModel):
    """Respuesta resumida de la caja (sin lista de movimientos)."""
    id: UUID
    status: CashRegisterStatus
    is_expired: bool
    opening_amount: Decimal
    opened_at: datetime
    closed_at: datetime | None
    difference: Decimal | None

    model_config = {"from_attributes": True}
