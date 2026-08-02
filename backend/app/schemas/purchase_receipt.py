"""
Schemas Pydantic para Remitos de Proveedor (Compras — recepción de mercadería).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field, model_validator

from app.models.purchase_receipt import PurchaseReceiptStatus
from app.schemas.base import BaseResponse, BaseSchema

# ---------------------------------------------------------------------------
# Schemas de ítems
# ---------------------------------------------------------------------------


class PurchaseReceiptItemCreate(BaseSchema):
    """Datos para crear/editar un ítem de remito.

    `product_id` es obligatorio: a diferencia de la factura, el remito
    siempre es carga manual y su único propósito es mover stock.
    """

    product_id: UUID
    quantity: Decimal = Field(..., gt=0, description="Cantidad recibida del ítem")
    expiration_date: date | None = None
    notes: str | None = Field(None, max_length=500)


class PurchaseReceiptItemResponse(BaseResponse):
    """Respuesta de un ítem de remito."""

    purchase_receipt_id: UUID
    product_id: UUID
    lot_id: UUID | None
    quantity: Decimal
    expiration_date: date | None
    notes: str | None

    # Datos relacionados (para UI de revisión)
    product_code: str | None = None
    product_description: str | None = None


# ---------------------------------------------------------------------------
# Schemas de remito
# ---------------------------------------------------------------------------


class PurchaseReceiptCreate(BaseSchema):
    """Datos para crear un remito en borrador."""

    supplier_id: UUID | None = None
    receipt_number: str = Field(..., min_length=1, max_length=50)
    received_date: date
    expected_invoice_number: str | None = Field(None, max_length=50)
    notes: str | None = None
    items: list[PurchaseReceiptItemCreate]

    @model_validator(mode="after")
    def items_required(self) -> PurchaseReceiptCreate:
        if not self.items:
            raise ValueError("El remito debe tener al menos un ítem")
        return self


class PurchaseReceiptUpdate(BaseSchema):
    """Datos para editar un remito en estado borrador.

    Todos los campos son opcionales (edición parcial); si se envía `items`,
    reemplaza la lista completa (misma convención que `PurchaseInvoiceUpdate`).
    """

    supplier_id: UUID | None = None
    receipt_number: str | None = Field(None, min_length=1, max_length=50)
    received_date: date | None = None
    expected_invoice_number: str | None = Field(None, max_length=50)
    notes: str | None = None
    items: list[PurchaseReceiptItemCreate] | None = None


class PurchaseReceiptConfirmRequest(BaseSchema):
    """
    Datos para confirmar un remito.

    `update_stock=False` permite cargar un remito "solo registro" que no
    impacte stock al confirmarse (mismo toggle que `PurchaseInvoiceConfirmRequest`).
    """

    update_stock: bool = True


class PurchaseReceiptResponse(BaseResponse):
    """Respuesta completa de un remito de proveedor."""

    business_id: UUID
    supplier_id: UUID | None
    purchase_invoice_id: UUID | None
    created_by: UUID
    confirmed_by: UUID | None
    status: PurchaseReceiptStatus
    receipt_number: str
    received_date: date
    expected_invoice_number: str | None
    update_stock: bool
    notes: str | None
    confirmed_at: datetime | None
    items: list[PurchaseReceiptItemResponse] = []

    # Datos relacionados (para mostrar en UI)
    supplier_name: str | None = None
    created_by_name: str | None = None


class PurchaseReceiptListItem(BaseResponse):
    """Ítem resumido para el historial/listado de remitos."""

    supplier_id: UUID | None
    purchase_invoice_id: UUID | None
    status: PurchaseReceiptStatus
    receipt_number: str
    received_date: date
    expected_invoice_number: str | None
    confirmed_at: datetime | None
    items_count: int = 0

    supplier_name: str | None = None
