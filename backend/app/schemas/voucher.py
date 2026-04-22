"""
Schemas para Comprobantes (Ventas).
"""

from datetime import date
from decimal import Decimal
from typing import Any, List, Optional, Literal
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
    is_current_account: bool = False
    billing_client_id: Optional[UUID] = None
    operating_client_id: Optional[UUID] = None
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%) aplicado sobre el subtotal de todos los ítems",
    )

    items: List[VoucherItemCreate]
    payments: Optional[List[VoucherPaymentCreate]] = Field(
        default=None,
        description="Métodos de pago (opcional para cotizaciones/remitos, obligatorio para facturas)",
    )


class VoucherUpdate(BaseSchema):
    """Schema para actualizar un comprobante editable."""

    client_id: UUID
    date: date
    notes: Optional[str] = None
    show_prices: bool = True
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%) aplicado sobre el subtotal de todos los ítems",
    )

    items: List[VoucherItemCreate]


class CurrentAccountCloseRequest(BaseSchema):
    """Request para cierre de cuenta corriente por titular."""

    billing_client_id: UUID
    receipt_ids: Optional[List[UUID]] = None
    close_all: bool = False
    notes: Optional[str] = None


class CurrentAccountClosePreviewRequest(BaseSchema):
    """Request para preview de cierre de cuenta corriente (sin persistir)."""

    billing_client_id: UUID
    receipt_ids: Optional[List[UUID]] = None
    close_all: bool = False
    notes: Optional[str] = None


class CurrentAccountCloseItemPreview(BaseSchema):
    """Ítem en el preview del cierre."""

    receipt_id: UUID
    receipt_number: str
    receipt_date: date
    operating_client_name: Optional[str] = None
    is_withdrawal_authorized: bool = False
    general_discount: Optional[Decimal] = None
    code: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    iva_rate: Decimal
    subtotal: Decimal
    total: Decimal


class CurrentAccountClosePreviewResponse(BaseSchema):
    """Response del preview de cierre."""

    billing_client_name: str
    items: List[CurrentAccountCloseItemPreview]
    total_receipts: int
    total_items: int
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal


class CurrentAccountClosureReceiptSummary(BaseSchema):
    """Resumen de receipt incluido en un cierre."""

    receipt_id: UUID
    receipt_number: str
    receipt_date: date
    operating_client_name: Optional[str] = None
    total: Decimal


class CurrentAccountClosureHistoryItem(BaseSchema):
    """Un cierre histórico."""

    closure_voucher_id: UUID
    closure_number: str
    closure_date: date
    notes: Optional[str] = None
    total_receipts: int
    total_items: int
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    receipts: List[CurrentAccountClosureReceiptSummary]


class CurrentAccountCloseHistoryResponse(BaseSchema):
    """Lista de cierres históricos."""

    closures: List[CurrentAccountClosureHistoryItem]
    total: int


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


class VoucherPartySummary(BaseSchema):
    """Datos mínimos de cliente para contexto de remitos CC."""

    id: UUID
    name: str


class ConvertQuotationToInvoice(BaseSchema):
    """Schema para convertir una cotización en factura."""

    fiscal_client_id: Optional[UUID] = Field(
        default=None,
        description="Cliente fiscal final de la factura (opcional). Si no se envía, se usa el cliente origen.",
    )
    payments: Optional[List[VoucherPaymentCreate]] = Field(
        default=None,
        description="Métodos de pago (requerido para que quede registrado el cobro)",
    )
    price_strategy: Literal["historical", "current"] = Field(
        default="historical",
        description=(
            "Estrategia de precios para facturar desde comprobante: "
            "'historical' usa unit_price + iva_rate del comprobante origen; "
            "'current' usa sale_price + iva_rate actuales del producto."
        ),
    )


class CompileToInvoiceRequest(BaseSchema):
    """
    Schema para compilar comprobantes (cotizaciones/remitos) en una factura.

    Validaciones:
    - Todos los comprobantes deben existir y pertenecer al tenant.
    - Los tipos permitidos son: 'quotation' o 'receipt'.
    - Ninguna debe estar ya facturada.
    - Todas deben tener el MISMO cliente (no mezclar clientes).
    - Descuento general: usa exactamente el valor recibido (0 = sin descuento).
    """

    quotation_ids: List[UUID] = Field(
        ...,
        min_length=1,
        description="IDs de cotizaciones/remitos a facturar (mínimo 1)",
    )
    payments: Optional[List[VoucherPaymentCreate]] = Field(
        default=None,
        description="Métodos de pago (requerido para facturas)",
    )
    fiscal_client_id: Optional[UUID] = Field(
        default=None,
        description="Cliente fiscal final de la factura (opcional). Si no se envía, se usa el cliente origen.",
    )
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%) aplicado a la factura compilada. 0 = sin descuento.",
    )
    price_strategy: Literal["historical", "current"] = Field(
        default="historical",
        description=(
            "Estrategia de precios para facturar desde comprobantes: "
            "'historical' usa unit_price + iva_rate del comprobante origen; "
            "'current' usa sale_price + iva_rate actuales del producto."
        ),
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
    notes: Optional[str] = None
    is_current_account: bool = False
    is_current_account_closure: bool = False
    billing_client_id: Optional[UUID] = None
    operating_client_id: Optional[UUID] = None
    billing_client: Optional[VoucherPartySummary] = None
    operating_client: Optional[VoucherPartySummary] = None
    is_withdrawal_authorized: bool = False
    withdrawal_client_name: Optional[str] = None
    general_discount: Decimal

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


class SourceQuotationResponse(BaseSchema):
    """Comprobante origen (cotización/remito) de una factura."""

    id: UUID
    voucher_type: VoucherType
    code: str
    date: date
    client_name: str
    total: Decimal
    item_count: int


class VoucherAuditLogResponse(BaseResponse):
    """Schema de respuesta para auditoría de comprobantes."""

    user_id: Optional[UUID] = None
    action: str
    resource_type: str
    resource_id: Optional[UUID] = None
    details: Optional[dict[str, Any]] = None
