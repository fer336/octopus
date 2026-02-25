"""
Schemas Pydantic para el módulo de Caja.
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
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
    """Cuerpo para cerrar la caja."""
    counted_cash: Decimal = Field(
        ge=0,
        description="Efectivo físico contado al cierre",
    )
    difference_reason: Optional[str] = Field(
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
    voucher_id: Optional[UUID]
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
    by_method: List[PaymentMethodSummary]
    total_net: Decimal
    expected_cash: Decimal  # fondo inicial + neto en efectivo


class CashRegisterResponse(BaseModel):
    """Respuesta completa de una caja."""
    id: UUID
    business_id: UUID
    opened_by: UUID
    closed_by: Optional[UUID]
    status: CashRegisterStatus
    is_expired: bool  # calculado: status=OPEN y opened_at < NOW()-24hs
    opening_amount: Decimal
    opened_at: datetime
    closed_at: Optional[datetime]
    counted_cash: Optional[Decimal]
    difference: Optional[Decimal]
    difference_reason: Optional[str]
    closing_pdf_path: Optional[str]
    movements: List[CashMovementResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class CashRegisterSummaryResponse(BaseModel):
    """Respuesta resumida de la caja (sin lista de movimientos)."""
    id: UUID
    status: CashRegisterStatus
    is_expired: bool
    opening_amount: Decimal
    opened_at: datetime
    closed_at: Optional[datetime]
    difference: Optional[Decimal]

    model_config = {"from_attributes": True}
