"""
Schemas para actualización masiva de precios.
"""
from decimal import Decimal
from enum import Enum
from typing import List, Optional
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
    CURRENT_STOCK = "current_stock"


class PriceUpdateRequest(BaseSchema):
    """Request para actualización de precios."""
    
    product_ids: List[UUID] = Field(..., description="IDs de productos a actualizar")
    field: FieldToUpdate = Field(..., description="Campo a actualizar")
    update_type: UpdateType = Field(..., description="Tipo de actualización")
    value: Decimal = Field(..., description="Porcentaje o valor según el tipo")


class PriceUpdatePreviewItem(BaseSchema):
    """Item de preview de actualización."""
    
    id: UUID
    code: str
    description: str
    category_name: Optional[str] = None
    supplier_name: Optional[str] = None
    
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
    items: List[PriceUpdatePreviewItem]


class PriceUpdateApplyResponse(BaseSchema):
    """Respuesta al aplicar actualización."""
    
    updated_count: int
    message: str
