"""
Schemas para Remitos de Pago.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.models.payment import PaymentMethod
from app.schemas.base import BaseResponse, BaseSchema


class PaymentReceiptItemResponse(BaseSchema):
    """Ítem del comprobante original (para mostrar en el remito de pago)."""

    code: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    iva_rate: Decimal
    subtotal: Decimal
    total: Decimal


class PaymentReceiptCreate(BaseSchema):
    """Schema para registrar el pago de una factura en cuenta corriente."""

    payment_date: date
    amount: Decimal = Decimal(0)
    payment_method: PaymentMethod
    reference: str | None = None
    notes: str | None = None


class PaymentReceiptResponse(BaseResponse):
    """Schema de respuesta para remito de pago."""

    invoice_voucher_id: UUID
    invoice_voucher_number: str | None = None
    client_id: UUID
    client_name: str | None = None
    payment_date: date
    amount: Decimal
    payment_method: PaymentMethod
    reference: str | None = None
    sale_point: str
    number: str
    notes: str | None = None

    # Datos de la factura pagada
    invoice_items: list[PaymentReceiptItemResponse] = []
    invoice_total: Decimal | None = None


class VoucherPayRequest(BaseSchema):
    """Request para pagar una factura en cuenta corriente."""

    payment_date: date
    amount: Decimal
    payment_method: PaymentMethod
    reference: str | None = None
    notes: str | None = None


class VoucherPayResponse(BaseSchema):
    """Response después de registrar el pago."""

    voucher_id: UUID
    is_paid: bool
    payment_date: date
    paid_amount: Decimal

    # Datos del remito de pago generado
    payment_receipt: PaymentReceiptResponse | None = None