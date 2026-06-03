"""
Schemas para Comprobantes (Ventas).
"""

from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.models.voucher import VoucherStatus, VoucherType
from app.schemas.base import BaseResponse, BaseSchema
from app.schemas.client import ClientResponse
from app.schemas.payment_method import VoucherPaymentCreate


class VoucherItemCreate(BaseSchema):
    """Schema para crear un ítem de comprobante."""

    product_id: UUID
    quantity: Decimal = Field(
        ...,
        description="Cantidad del ítem. Permite negativos para devoluciones; no permite cero.",
    )
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    # Precios que vienen del frontend (o se recalculan en backend)
    # Es mejor que el backend recalcule, pero recibimos algunos datos base
    unit_price: Decimal = Field(..., ge=0)

    @field_validator("quantity")
    @classmethod
    def quantity_cannot_be_zero(cls, value: Decimal) -> Decimal:
        """Evita renglones sin impacto comercial ni stock."""
        if value == Decimal("0"):
            raise ValueError("La cantidad no puede ser cero")
        return value


class CustomerCreditReturnRequest(BaseSchema):
    """Request para registrar devolución excedente como saldo a favor."""

    client_id: UUID
    date: date
    notes: str | None = None
    general_discount: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    items: list[VoucherItemCreate]


class CustomerCreditReturnResponse(BaseSchema):
    """Respuesta de registro de saldo a favor por devolución."""

    client_id: UUID
    return_receipt_id: UUID | None = None
    return_receipt_number: str | None = None
    credit_amount: Decimal
    previous_balance: Decimal
    new_balance: Decimal
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    message: str


class VoucherCreate(BaseSchema):
    """Schema para crear un comprobante."""

    client_id: UUID
    voucher_type: VoucherType
    date: date
    notes: str | None = None
    show_prices: bool = True  # Para remitos
    is_current_account: bool = False
    billing_client_id: UUID | None = None
    operating_client_id: UUID | None = None
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%) aplicado sobre el subtotal de todos los ítems",
    )
    # Días de plazo para facturas en cuenta corriente
    payment_days: int | None = Field(
        default=None,
        ge=0,
        le=999,
        description="Días hábiles de plazo para pago (7, 15, 30, 60, 90). Solo para facturas en cuenta corriente.",
    )
    # ID del acopio para remitos hijos (retiros parciales de acopio)
    stockpile_id: UUID | None = Field(
        default=None,
        description="ID del acopio vinculado (para remitos hijos de retiros parciales)",
    )

    items: list[VoucherItemCreate]
    payments: list[VoucherPaymentCreate] | None = Field(
        default=None,
        description="Métodos de pago (opcional para cotizaciones/remitos, obligatorio para facturas)",
    )


class VoucherTotalsPreviewRequest(BaseSchema):
    """Request para previsualizar totales de venta con lógica backend."""

    voucher_type: VoucherType
    general_discount: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    items: list[VoucherItemCreate]


class VoucherTotalsPreviewResponse(BaseSchema):
    """Respuesta de previsualización de totales."""

    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal


class VoucherUpdate(BaseSchema):
    """Schema para actualizar un comprobante editable."""

    client_id: UUID
    date: date
    notes: str | None = None
    show_prices: bool = True
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%) aplicado sobre el subtotal de todos los ítems",
    )

    items: list[VoucherItemCreate]


class ItemQuantityOverride(BaseSchema):
    """Override de cantidad para un ítem específico al cerrar o previsualizar."""

    voucher_item_id: UUID
    quantity: Decimal


class CurrentAccountCloseRequest(BaseSchema):
    """Request para cierre de cuenta corriente por titular."""

    billing_client_id: UUID
    receipt_ids: list[UUID] | None = None
    close_all: bool = False
    notes: str | None = None
    item_quantity_overrides: list[ItemQuantityOverride] | None = None


class CurrentAccountClosePreviewRequest(BaseSchema):
    """Request para preview de cierre de cuenta corriente (sin persistir)."""

    billing_client_id: UUID
    receipt_ids: list[UUID] | None = None
    close_all: bool = False
    notes: str | None = None
    item_quantity_overrides: list[ItemQuantityOverride] | None = None


class CurrentAccountCloseItemPreview(BaseSchema):
    """Ítem en el preview del cierre."""

    receipt_id: UUID
    receipt_number: str
    receipt_date: date
    operating_client_name: str | None = None
    is_withdrawal_authorized: bool = False
    general_discount: Decimal | None = None
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
    items: list[CurrentAccountCloseItemPreview]
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
    operating_client_name: str | None = None
    total: Decimal


class CurrentAccountClosureHistoryItem(BaseSchema):
    """Un cierre histórico."""

    closure_voucher_id: UUID
    closure_number: str
    closure_date: date
    notes: str | None = None
    total_receipts: int
    total_items: int
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    receipts: list[CurrentAccountClosureReceiptSummary]


class CurrentAccountCloseHistoryResponse(BaseSchema):
    """Lista de cierres históricos."""

    closures: list[CurrentAccountClosureHistoryItem]
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
    iva_amount: Decimal | None = None
    subtotal: Decimal
    total: Decimal
    product_lot_id: UUID | None = None


class VoucherPartySummary(BaseSchema):
    """Datos mínimos de cliente para contexto de remitos CC."""

    id: UUID
    name: str


class ConvertQuotationToInvoice(BaseSchema):
    """Schema para convertir una cotización en factura."""

    fiscal_client_id: UUID | None = Field(
        default=None,
        description="Cliente fiscal final de la factura (opcional). Si no se envía, se usa el cliente origen.",
    )
    payments: list[VoucherPaymentCreate] | None = Field(
        default=None,
        description="Métodos de pago (requerido para que quede registrado el cobro)",
    )
    is_current_account: bool = Field(
        default=False,
        description="Si la factura resultante queda pendiente en cuenta corriente.",
    )
    payment_days: int | None = Field(
        default=None,
        ge=1,
        le=365,
        description="Días de plazo para facturas en cuenta corriente.",
    )
    price_strategy: Literal["historical", "current"] = Field(
        default="historical",
        description=(
            "Estrategia de precios para facturar desde comprobante: "
            "'historical' usa unit_price + iva_rate del comprobante origen; "
            "'current' usa net_price + iva_rate actuales del producto."
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

    quotation_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="IDs de cotizaciones/remitos a facturar (mínimo 1)",
    )
    payments: list[VoucherPaymentCreate] | None = Field(
        default=None,
        description="Métodos de pago (requerido para facturas)",
    )
    is_current_account: bool = Field(
        default=False,
        description="Si la factura compilada queda pendiente en cuenta corriente.",
    )
    payment_days: int | None = Field(
        default=None,
        ge=1,
        le=365,
        description="Días de plazo para facturas en cuenta corriente.",
    )
    fiscal_client_id: UUID | None = Field(
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
            "'current' usa net_price + iva_rate actuales del producto."
        ),
    )


class PriceDifferenceItem(BaseSchema):
    """Detalle de diferencia de precio entre comprobante y catálogo actual."""

    product_id: UUID
    product_name: str
    code: str
    old_price: Decimal
    current_price: Decimal
    difference_percent: Decimal


class VoucherPriceCheckResponse(BaseSchema):
    """Respuesta del chequeo de precios al cargar cotización por código."""

    has_differences: bool
    differences: list[PriceDifferenceItem]
    affected_items: int
    total_items: int


class CompilePreviewRequest(BaseSchema):
    """Request para previsualizar totales de compilación con estrategia de precios."""

    quotation_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="IDs de cotizaciones/remitos a compilar",
    )
    general_discount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        description="Descuento general (%)",
    )
    price_strategy: Literal["historical", "current"] = Field(
        default="historical",
        description="Estrategia de precios",
    )
    fiscal_client_id: UUID | None = Field(
        default=None,
        description="Cliente fiscal final de la factura (opcional). Si no se envía, se usa el cliente origen.",
    )


class CompilePreviewResponse(BaseSchema):
    """Respuesta del preview de compilación con totales calculados."""

    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    discount_amount: Decimal
    voucher_count: int
    item_count: int
    invoice_variant: str = Field(
        default="B",
        description="Variante de factura según condición fiscal del cliente: 'A' (Responsable Inscripto) o 'B' (Monotributista/CF)",
    )
    fiscal_client_id: UUID | None = Field(
        default=None,
        description="ID del cliente fiscal final (si se overrideó)",
    )


class VoucherResponse(BaseResponse):
    """Schema de respuesta para comprobante."""

    client: ClientResponse | None = None
    client_id: UUID
    voucher_type: VoucherType
    status: VoucherStatus
    sale_point: str
    number: str
    date: date
    due_date: date | None
    notes: str | None = None
    is_current_account: bool = False
    is_current_account_closure: bool = False
    is_return_receipt: bool = False
    billing_client_id: UUID | None = None
    operating_client_id: UUID | None = None
    billing_client: VoucherPartySummary | None = None
    operating_client: VoucherPartySummary | None = None
    is_withdrawal_authorized: bool = False
    withdrawal_client_name: str | None = None
    general_discount: Decimal

    # Vendedor que emitió el comprobante
    created_by: UUID | None = None
    created_by_name: str | None = None

    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal

    cae: str | None
    cae_expiration: date | None
    barcode: str | None

    # Indica si tiene notas de crédito asociadas (para UI)
    has_credit_note: bool = False

    # ID de la factura generada a partir de esta cotización (None = pendiente de facturar)
    invoiced_voucher_id: UUID | None = None

    # Campos de pago para facturas en cuenta corriente
    payment_days: int | None = None
    is_paid: bool = False
    payment_date: date | None = None
    paid_amount: Decimal | None = None

    # Información de acopio para remitos hijos de retiros parciales
    stockpile_id: UUID | None = None
    stockpile: dict[str, Any] | None = None
    is_stockpile_principal_receipt: bool = False

    items: list[VoucherItemResponse]


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

    user_id: UUID | None = None
    action: str
    resource_type: str
    resource_id: UUID | None = None
    details: dict[str, Any] | None = None
