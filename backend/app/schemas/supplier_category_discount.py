"""
Schemas para descuentos de proveedor por categoría.
"""
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class SupplierCategoryDiscountBase(BaseSchema):
    """Base schema para descuentos por categoría."""
    
    category_id: UUID
    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class SupplierCategoryDiscountCreate(SupplierCategoryDiscountBase):
    """Schema para crear descuento por categoría."""
    pass


class SupplierCategoryDiscountResponse(SupplierCategoryDiscountBase):
    """Schema de respuesta para descuento por categoría."""
    
    id: UUID
    supplier_id: UUID
    category_name: str | None = None  # Para display
    
    class Config:
        from_attributes = True
