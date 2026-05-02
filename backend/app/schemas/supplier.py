"""
Schemas para Proveedores.
"""
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import BaseResponse, BaseSchema

if TYPE_CHECKING:
    from app.models.supplier import Supplier


class CategoryDiscountItem(BaseSchema):
    """Descuento específico para una categoría."""
    category_id: UUID
    category_name: str | None = None
    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class SupplierCreate(BaseSchema):
    """Schema para crear un proveedor."""

    name: str = Field(..., max_length=255, description="Nombre o razón social")
    cuit: str | None = Field(None, max_length=13)
    phone: str | None = Field(None, max_length=50)
    email: EmailStr | None = None
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    province: str | None = Field(None, max_length=100)
    contact_name: str | None = Field(None, max_length=255)
    notes: str | None = None

    default_discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    default_discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    default_discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    category_ids: list[UUID] | None = Field(default=[], description="IDs de categorías asociadas")
    category_discounts: list[CategoryDiscountItem] | None = Field(default=[], description="Descuentos específicos por categoría")


class SupplierUpdate(BaseSchema):
    """Schema para actualizar un proveedor."""

    name: str | None = Field(None, max_length=255)
    cuit: str | None = Field(None, max_length=13)
    phone: str | None = Field(None, max_length=50)
    email: EmailStr | None = None
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    province: str | None = Field(None, max_length=100)
    contact_name: str | None = Field(None, max_length=255)
    notes: str | None = None

    default_discount_1: Decimal | None = Field(None, ge=0, le=100)
    default_discount_2: Decimal | None = Field(None, ge=0, le=100)
    default_discount_3: Decimal | None = Field(None, ge=0, le=100)

    category_ids: list[UUID] | None = Field(None, description="IDs de categorías asociadas")
    category_discounts: list[CategoryDiscountItem] | None = Field(None, description="Descuentos específicos por categoría")


class SupplierResponse(BaseResponse):
    """Schema para respuesta de proveedor."""

    name: str
    cuit: str | None
    phone: str | None
    email: str | None
    address: str | None
    city: str | None
    province: str | None
    contact_name: str | None
    notes: str | None

    default_discount_1: Decimal
    default_discount_2: Decimal
    default_discount_3: Decimal

    category_ids: list[UUID] = Field(default_factory=list, description="IDs de categorías asociadas")
    category_discounts: list[CategoryDiscountItem] = Field(default_factory=list, description="Descuentos por categoría")

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

    search: str | None = Field(None, description="Buscar por nombre o CUIT")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
