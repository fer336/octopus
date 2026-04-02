"""
Schemas para Métodos de Pago y Pagos de Comprobantes.
"""

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict, Field

from app.schemas.base import BaseResponse, BaseSchema


class PaymentMethodCreate(BaseSchema):
    """Datos para crear un método de pago del negocio."""

    name: str
    code: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Código interno opcional. Si no se envía, se genera automáticamente.",
    )
    requires_reference: bool = False
    is_active: bool = True


class PaymentMethodUpdate(BaseSchema):
    """Datos para actualizar un método de pago existente."""

    name: str
    code: Optional[str] = Field(default=None, max_length=20)
    requires_reference: bool
    is_active: bool


class PaymentMethodStatusUpdate(BaseSchema):
    """Cambio rápido de estado activo/inactivo."""

    is_active: bool


class PaymentMethodResponse(BaseResponse):
    """Método de pago disponible."""

    business_id: UUID
    name: str
    code: str
    is_active: bool
    requires_reference: bool


class VoucherPaymentCreate(BaseSchema):
    """Datos para registrar un pago de un comprobante."""

    payment_method_id: UUID = Field(description="ID del método de pago")
    amount: Decimal = Field(gt=0, description="Monto pagado con este método")
    reference: Optional[str] = Field(
        None, max_length=100, description="N° de transacción, cheque, etc."
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "payment_method_id": "123e4567-e89b-12d3-a456-426614174000",
                "amount": 5000.00,
                "reference": "TRX-ABC123",
            }
        },
    )


class VoucherPaymentResponse(BaseSchema):
    """Pago registrado de un comprobante."""

    id: UUID
    voucher_id: UUID
    payment_method_id: UUID
    amount: Decimal
    reference: Optional[str]

    # Datos del método (joined)
    payment_method_name: Optional[str] = None
    payment_method_code: Optional[str] = None
