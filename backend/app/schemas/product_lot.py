"""
Schemas para Lotes de Producto (Product Lot).
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ProductLotCreate(BaseSchema):
    """Schema para crear un lote de producto (ingreso de stock)."""

    quantity: int = Field(..., gt=0, description="Cantidad inicial del lote")
    initial_quantity: int | None = Field(
        None, ge=0, description="Cantidad original (opcional, default = quantity)"
    )
    expiration_date: date | None = Field(
        None, description="Fecha de vencimiento del lote"
    )
    cost_price: Decimal | None = Field(
        None, ge=0, description="Precio de costo del lote"
    )
    code: str | None = Field(
        None, max_length=50, description="Código interno del lote"
    )
    received_date: date | None = Field(
        None, description="Fecha de recepción (default: hoy)"
    )


class ProductLotUpdate(BaseSchema):
    """Schema para actualizar un lote de producto."""

    quantity: int | None = Field(None, ge=0, description="Cantidad actual del lote")
    expiration_date: date | None = Field(None, description="Fecha de vencimiento")
    cost_price: Decimal | None = Field(None, ge=0, description="Precio de costo")


class ProductLotResponse(BaseResponse):
    """Schema para respuesta de lote de producto."""

    product_id: UUID
    business_id: UUID
    code: str | None
    quantity: int
    initial_quantity: int
    expiration_date: date | None
    cost_price: Decimal | None
    received_date: date
