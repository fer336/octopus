"""
Schemas Pydantic para Órdenes de Pedido e ítems.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import field_validator, model_validator

from app.models.purchase_order import PurchaseOrderStatus
from app.schemas.base import BaseResponse, BaseSchema


# ---------------------------------------------------------------------------
# Schemas de ítems
# ---------------------------------------------------------------------------


class PurchaseOrderItemCreate(BaseSchema):
    """Datos para crear un ítem de orden de pedido."""

    product_id: UUID
    system_stock: int = 0
    counted_stock: Optional[int] = None
    quantity_to_order: int
    unit_cost: Decimal          # Precio de costo con bonificaciones (sin IVA), editable
    iva_rate: Decimal = Decimal("21.00")

    @field_validator("quantity_to_order")
    @classmethod
    def quantity_must_be_positive(cls, v: int) -> int:
        if v < 0:
            raise ValueError("La cantidad a pedir no puede ser negativa")
        return v

    @field_validator("unit_cost")
    @classmethod
    def cost_must_be_positive(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("El precio de costo no puede ser negativo")
        return v


class PurchaseOrderItemUpdate(BaseSchema):
    """Datos para actualizar un ítem de una orden en borrador."""

    quantity_to_order: Optional[int] = None
    unit_cost: Optional[Decimal] = None
    counted_stock: Optional[int] = None


class PurchaseOrderItemResponse(BaseResponse):
    """Respuesta completa de un ítem de orden de pedido."""

    purchase_order_id: UUID
    product_id: UUID
    system_stock: int
    counted_stock: Optional[int]
    quantity_to_order: int
    unit_cost: Decimal
    iva_rate: Decimal
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal

    # Datos del producto (para mostrar en UI y PDF)
    product_code: Optional[str] = None
    product_description: Optional[str] = None
    product_supplier_code: Optional[str] = None
    category_name: Optional[str] = None
    supplier_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Schemas de orden de pedido
# ---------------------------------------------------------------------------


class PurchaseOrderCreate(BaseSchema):
    """Datos para crear una orden de pedido (con ítems)."""

    supplier_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    notes: Optional[str] = None
    items: list[PurchaseOrderItemCreate]

    @model_validator(mode="after")
    def supplier_or_category_required(self) -> "PurchaseOrderCreate":
        if not self.supplier_id and not self.category_id:
            raise ValueError("Debe especificar al menos un proveedor o una categoría")
        if not self.items:
            raise ValueError("La orden de pedido debe tener al menos un ítem")
        return self


class PurchaseOrderUpdate(BaseSchema):
    """Datos para actualizar una orden en estado DRAFT."""

    notes: Optional[str] = None
    items: Optional[list[PurchaseOrderItemCreate]] = None


class PurchaseOrderResponse(BaseResponse):
    """Respuesta completa de una orden de pedido."""

    business_id: UUID
    supplier_id: Optional[UUID]
    category_id: Optional[UUID]
    created_by: UUID
    status: PurchaseOrderStatus
    sale_point: str = "0001"
    number: str = "00000001"
    subtotal: Decimal
    total_iva: Decimal
    total: Decimal
    notes: Optional[str]
    confirmed_at: Optional[datetime]
    items: list[PurchaseOrderItemResponse] = []

    # Datos relacionados (para mostrar en la lista)
    supplier_name: Optional[str] = None
    category_name: Optional[str] = None
    created_by_name: Optional[str] = None

    @property
    def full_number(self) -> str:
        """Número completo: 0001-00000001."""
        return f"{self.sale_point}-{self.number}"


class PurchaseOrderListItem(BaseResponse):
    """Ítem resumido para la lista de órdenes de pedido."""

    supplier_id: Optional[UUID]
    category_id: Optional[UUID]
    status: PurchaseOrderStatus
    sale_point: str = "0001"
    number: str = "00000001"
    subtotal: Decimal
    total_iva: Decimal
    total: Decimal
    confirmed_at: Optional[datetime]
    items_count: int = 0

    # Datos relacionados
    supplier_name: Optional[str] = None
    category_name: Optional[str] = None
    created_by_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Schema para la planilla de conteo (filtros del PDF)
# ---------------------------------------------------------------------------


class InventoryCountFilter(BaseSchema):
    """Filtros para generar la planilla de conteo físico en PDF."""

    supplier_id: Optional[UUID] = None
    category_id: Optional[UUID] = None

    @model_validator(mode="after")
    def supplier_or_category_required(self) -> "InventoryCountFilter":
        if not self.supplier_id and not self.category_id:
            raise ValueError("Debe especificar al menos un proveedor o una categoría")
        return self
