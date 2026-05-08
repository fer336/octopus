"""
Schemas para actualización masiva de precios.
"""
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import Field, field_serializer

from app.schemas.base import BaseSchema


class UpdateType(str, Enum):
    """Tipo de actualización de precio."""
    INCREASE = "increase"  # Aumentar X%
    DECREASE = "decrease"  # Disminuir X%
    REMOVE_INCREASE = "remove_increase"  # Quitar aumento previo de X%
    SET_VALUE = "set_value"  # Establecer valor fijo


class FieldToUpdate(str, Enum):
    """Campo a actualizar."""
    LIST_PRICE = "list_price"
    DISCOUNT_1 = "discount_1"
    DISCOUNT_2 = "discount_2"
    DISCOUNT_3 = "discount_3"
    EXTRA_COST = "extra_cost"
    PROFIT_MARGIN = "profit_margin"
    CURRENT_STOCK = "current_stock"


class PriceUpdateRequest(BaseSchema):
    """Request para actualización de precios."""

    product_ids: list[UUID] = Field(..., description="IDs de productos a actualizar")
    field: FieldToUpdate = Field(..., description="Campo a actualizar")
    update_type: UpdateType = Field(..., description="Tipo de actualización")
    value: Decimal = Field(..., description="Porcentaje o valor según el tipo")


class PriceUpdatePreviewItem(BaseSchema):
    """Item de preview de actualización."""

    id: UUID
    code: str
    description: str
    category_name: str | None = None
    supplier_name: str | None = None

    # Valores actuales
    current_value: Decimal

    # Valores nuevos (calculados)
    new_value: Decimal
    change_amount: Decimal
    change_percentage: Decimal

    # Serializar Decimals como float para JSON
    @field_serializer('current_value', 'new_value', 'change_amount', 'change_percentage')
    def serialize_decimal(self, value: Decimal) -> float:
        """Convierte Decimal a float para JSON."""
        return float(value)


class PriceUpdatePreviewResponse(BaseSchema):
    """Respuesta del preview de actualización."""

    total_products: int
    field_name: str
    update_description: str
    items: list[PriceUpdatePreviewItem]


class PriceUpdateApplyResponse(BaseSchema):
    """Respuesta al aplicar actualización."""

    updated_count: int
    message: str


class ExcelPriceUpdateColumnPreviewResponse(BaseSchema):
    """Columnas y filas detectadas desde un Excel de actualización de precios."""

    file_name: str
    total_rows: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    rows: list[dict[str, Any]]


class ExcelPriceUpdateMappingRequest(BaseSchema):
    """Mapeo manual de columnas para cruzar códigos de proveedor contra productos."""

    rows: list[dict[str, Any]] = Field(..., min_length=1)
    code_column: str = Field(..., min_length=1)
    price_column: str = Field(..., min_length=1)
    supplier_name: str | None = None


class ExcelPriceUpdatePreviewItem(BaseSchema):
    """Resultado de cruzar una fila del Excel contra un producto existente."""

    row_number: int
    supplier_code: str
    imported_list_price: Decimal | None = None
    product_id: UUID | None = None
    product_code: str | None = None
    description: str | None = None
    current_list_price: Decimal | None = None
    current_sale_price: Decimal | None = None
    new_sale_price: Decimal | None = None
    status: str
    error_message: str | None = None

    @field_serializer('imported_list_price', 'current_list_price', 'current_sale_price', 'new_sale_price')
    def serialize_decimal_or_none(self, value: Decimal | None) -> float | None:
        """Convierte Decimal a float para JSON."""
        return float(value) if value is not None else None


class ExcelPriceUpdatePreviewResponse(BaseSchema):
    """Preview del cruce Excel → productos antes de aplicar cambios."""

    total_rows: int
    matched_count: int
    error_count: int
    supplier_name: str | None = None
    items: list[ExcelPriceUpdatePreviewItem]
