"""
Schemas para Comprobantes (Ventas).
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import Field

from app.models.voucher import VoucherStatus, VoucherType
from app.schemas.base import BaseResponse, BaseSchema

from app.schemas.client import ClientResponse
from app.schemas.payment_method import VoucherPaymentCreate

class VoucherItemCreate(BaseSchema):
    """Schema para crear un ítem de comprobante."""

    product_id: UUID
    quantity: Decimal = Field(..., gt=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    
    # Precios que vienen del frontend (o se recalculan en backend)
    # Es mejor que el backend recalcule, pero recibimos algunos datos base
    unit_price: Decimal = Field(..., ge=0)


class VoucherCreate(BaseSchema):
    """Schema para crear un comprobante."""

    client_id: UUID
    voucher_type: VoucherType
    date: date
    notes: Optional[str] = None
    show_prices: bool = True  # Para remitos
    
    items: List[VoucherItemCreate]
    payments: Optional[List[VoucherPaymentCreate]] = Field(default=None, description="Métodos de pago (opcional para cotizaciones/remitos, obligatorio para facturas)")


class VoucherItemResponse(BaseResponse):
    """Schema de respuesta para ítem."""
    
    product_id: UUID
    code: str
    description: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    discount_percent: Decimal
    iva_rate: Decimal
    subtotal: Decimal
    total: Decimal


class ConvertQuotationToInvoice(BaseSchema):
    """Schema para convertir una cotización en factura."""
    payments: Optional[List[VoucherPaymentCreate]] = Field(
        default=None,
        description="Métodos de pago (requerido para que quede registrado el cobro)"
    )


class VoucherResponse(BaseResponse):
    """Schema de respuesta para comprobante."""

    client: Optional[ClientResponse] = None
    client_id: UUID
    voucher_type: VoucherType
    status: VoucherStatus
    sale_point: str
    number: str
    date: date
    due_date: Optional[date]
    
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    
    cae: Optional[str]
    cae_expiration: Optional[date]
    barcode: Optional[str]
    
    # Indica si tiene notas de crédito asociadas (para UI)
    has_credit_note: bool = False

    # ID de la factura generada a partir de esta cotización (None = pendiente de facturar)
    invoiced_voucher_id: Optional[UUID] = None

    items: List[VoucherItemResponse]
