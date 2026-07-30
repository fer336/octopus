"""
Schemas Pydantic para Facturas de Compra (Compras — carga manual e IA).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.models.purchase_invoice import PurchaseInvoiceSource, PurchaseInvoiceStatus
from app.schemas.base import BaseResponse, BaseSchema

# ---------------------------------------------------------------------------
# Schemas de ítems
# ---------------------------------------------------------------------------


class PurchaseInvoiceItemCreate(BaseSchema):
    """Datos para crear/editar un ítem de factura de compra.

    `product_id` es opcional: cuando la IA no pudo matchear el producto contra
    el catálogo queda en null y `description` conserva el texto crudo extraído
    (ver `InvoiceAIService`). Nunca se auto-crea un producto a partir de esto.
    """

    product_id: UUID | None = None
    description: str = Field(..., min_length=1, max_length=500)
    quantity: Decimal = Field(..., gt=0, description="Cantidad del ítem")
    unit_cost: Decimal = Field(
        default=Decimal("0"), ge=0, description="Costo unitario sin IVA"
    )
    iva_rate: Decimal = Field(default=Decimal("21.00"), ge=0)
    expiration_date: date | None = None


class PurchaseInvoiceItemResponse(BaseResponse):
    """Respuesta de un ítem de factura de compra."""

    purchase_invoice_id: UUID
    product_id: UUID | None
    lot_id: UUID | None
    description: str
    quantity: Decimal
    unit_cost: Decimal
    iva_rate: Decimal
    expiration_date: date | None
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal

    # Datos relacionados (para UI de revisión de borrador)
    product_code: str | None = None
    product_description: str | None = None


# ---------------------------------------------------------------------------
# Schemas de factura de compra
# ---------------------------------------------------------------------------


class PurchaseInvoiceCreate(BaseSchema):
    """Datos para crear una factura de compra en borrador (carga manual)."""

    supplier_id: UUID | None = None
    purchase_order_id: UUID | None = None
    invoice_number: str = Field(..., min_length=1, max_length=50)
    invoice_date: date
    items: list[PurchaseInvoiceItemCreate]

    @model_validator(mode="after")
    def items_required(self) -> PurchaseInvoiceCreate:
        if not self.items:
            raise ValueError("La factura debe tener al menos un ítem")
        return self


class PurchaseInvoiceUpdate(BaseSchema):
    """Datos para editar una factura en estado borrador.

    Todos los campos son opcionales (edición parcial); si se envía `items`,
    reemplaza la lista completa de ítems (igual convención que
    `PurchaseOrderUpdate`).
    """

    supplier_id: UUID | None = None
    purchase_order_id: UUID | None = None
    invoice_number: str | None = Field(None, min_length=1, max_length=50)
    invoice_date: date | None = None
    items: list[PurchaseInvoiceItemCreate] | None = None
    is_duplicate_ack: bool | None = None


class PurchaseInvoiceConfirmRequest(BaseSchema):
    """
    Datos para confirmar una factura de compra.

    `update_stock` y `update_prices` son toggles independientes que aplican a
    toda la factura (no por ítem). `update_prices` default False.
    """

    update_stock: bool = True
    update_prices: bool = False


class PurchaseInvoiceReversalRequest(BaseSchema):
    """
    Datos para editar una factura ya confirmada (reversión + recálculo).

    `force_adjustment` debe ser True explícitamente para proceder cuando algún
    lote generado por la factura ya fue consumido (parcial o totalmente); si
    es False y hay consumo, el servicio lanza `InvoiceReversalConflictError`.
    """

    supplier_id: UUID | None = None
    purchase_order_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    items: list[PurchaseInvoiceItemCreate] | None = None
    force_adjustment: bool = False


class PurchaseInvoiceResponse(BaseResponse):
    """Respuesta completa de una factura de compra."""

    business_id: UUID
    supplier_id: UUID | None
    purchase_order_id: UUID | None
    created_by: UUID
    confirmed_by: UUID | None
    status: PurchaseInvoiceStatus
    source: PurchaseInvoiceSource
    invoice_number: str
    invoice_date: date
    update_stock: bool
    update_prices: bool
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    source_document_key: str | None
    is_duplicate_ack: bool
    confirmed_at: datetime | None
    items: list[PurchaseInvoiceItemResponse] = []

    # Datos relacionados (para mostrar en UI)
    supplier_name: str | None = None
    created_by_name: str | None = None


class PurchaseInvoiceListItem(BaseResponse):
    """Ítem resumido para el historial/listado de facturas de compra."""

    supplier_id: UUID | None
    purchase_order_id: UUID | None
    status: PurchaseInvoiceStatus
    source: PurchaseInvoiceSource
    invoice_number: str
    invoice_date: date
    total: Decimal
    is_duplicate_ack: bool
    confirmed_at: datetime | None
    items_count: int = 0

    supplier_name: str | None = None


class DuplicateWarning(BaseSchema):
    """Advertencia de posible factura duplicada (no bloqueante — supplier_id + invoice_number)."""

    is_duplicate: bool
    existing_invoice_id: UUID | None = None
    existing_invoice_status: PurchaseInvoiceStatus | None = None


class ReversalConflictItem(BaseSchema):
    """Detalle de un lote consumido detectado durante una edición post-confirmación."""

    lot_id: UUID
    product_id: UUID | None
    initial_quantity: int
    remaining_quantity: int
    consumed_quantity: int
