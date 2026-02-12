"""
Schemas para Proveedores.
"""
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import BaseResponse, BaseSchema


class CategoryDiscountItem(BaseSchema):
    """Descuento específico para una categoría."""
    category_id: UUID
    category_name: Optional[str] = None
    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class SupplierCreate(BaseSchema):
    """Schema para crear un proveedor."""

    name: str = Field(..., max_length=255, description="Nombre o razón social")
    cuit: Optional[str] = Field(None, max_length=13)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None

    default_discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    default_discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    default_discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    
    category_ids: Optional[List[UUID]] = Field(default=[], description="IDs de categorías asociadas")
    category_discounts: Optional[List[CategoryDiscountItem]] = Field(default=[], description="Descuentos específicos por categoría")


class SupplierUpdate(BaseSchema):
    """Schema para actualizar un proveedor."""

    name: Optional[str] = Field(None, max_length=255)
    cuit: Optional[str] = Field(None, max_length=13)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None

    default_discount_1: Optional[Decimal] = Field(None, ge=0, le=100)
    default_discount_2: Optional[Decimal] = Field(None, ge=0, le=100)
    default_discount_3: Optional[Decimal] = Field(None, ge=0, le=100)
    
    category_ids: Optional[List[UUID]] = Field(None, description="IDs de categorías asociadas")
    category_discounts: Optional[List[CategoryDiscountItem]] = Field(None, description="Descuentos específicos por categoría")


class SupplierResponse(BaseResponse):
    """Schema para respuesta de proveedor."""

    name: str
    cuit: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    city: Optional[str]
    province: Optional[str]
    contact_name: Optional[str]
    notes: Optional[str]

    default_discount_1: Decimal
    default_discount_2: Decimal
    default_discount_3: Decimal
    
    category_ids: List[UUID] = Field(default_factory=list, description="IDs de categorías asociadas")
    category_discounts: List[CategoryDiscountItem] = Field(default_factory=list, description="Descuentos por categoría")
    
    @staticmethod
    def from_orm_with_categories(supplier: "Supplier") -> "SupplierResponse":
        """Crea una respuesta incluyendo los IDs de categorías."""
        response = SupplierResponse.model_validate(supplier)
        response.category_ids = [cat.id for cat in supplier.categories]
        return response
    
    class Config:
        from_attributes = True


class SupplierListParams(BaseSchema):
    """Parámetros para listar proveedores."""

    search: Optional[str] = Field(None, description="Buscar por nombre o CUIT")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
