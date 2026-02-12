"""
Schemas para Productos.
"""
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ProductCreate(BaseSchema):
    """Schema para crear un producto."""

    code: str = Field(..., max_length=50, description="Código interno del negocio")
    supplier_code: Optional[str] = Field(None, max_length=50, description="Código del proveedor")
    description: str = Field(..., max_length=500, description="Descripción del producto")
    details: Optional[str] = Field(None, description="Descripción extendida")

    category_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None

    cost_price: Decimal = Field(default=Decimal("0"), ge=0)
    list_price: Decimal = Field(default=Decimal("0"), ge=0)

    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    extra_cost: Decimal = Field(default=Decimal("0"), ge=0, description="Porcentaje de cargo extra")

    iva_rate: Decimal = Field(default=Decimal("21.00"), description="Alícuota IVA")

    current_stock: int = Field(default=0, ge=0)
    minimum_stock: int = Field(default=0, ge=0)
    unit: str = Field(default="unidad", max_length=20)


class ProductUpdate(BaseSchema):
    """Schema para actualizar un producto (todos los campos opcionales)."""

    code: Optional[str] = Field(None, max_length=50)
    supplier_code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    details: Optional[str] = None

    category_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None

    cost_price: Optional[Decimal] = Field(None, ge=0)
    list_price: Optional[Decimal] = Field(None, ge=0)

    discount_1: Optional[Decimal] = Field(None, ge=0, le=100)
    discount_2: Optional[Decimal] = Field(None, ge=0, le=100)
    discount_3: Optional[Decimal] = Field(None, ge=0, le=100)
    extra_cost: Optional[Decimal] = Field(None, ge=0)

    iva_rate: Optional[Decimal] = None

    current_stock: Optional[int] = Field(None, ge=0)
    minimum_stock: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=20)

    is_active: Optional[bool] = None


class ProductResponse(BaseResponse):
    """Schema para respuesta de producto."""

    code: str
    supplier_code: Optional[str]
    description: str
    details: Optional[str]

    category_id: Optional[UUID]
    supplier_id: Optional[UUID]

    cost_price: Decimal
    list_price: Decimal

    discount_1: Decimal
    discount_2: Decimal
    discount_3: Decimal
    discount_display: Optional[str]
    extra_cost: Decimal

    net_price: Decimal
    sale_price: Decimal

    iva_rate: Decimal

    current_stock: int
    minimum_stock: int
    unit: str

    is_active: bool


class ProductListParams(BaseSchema):
    """Parámetros para listar productos."""

    search: Optional[str] = Field(None, description="Buscar por código o descripción")
    category_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    is_active: Optional[bool] = True
    low_stock: Optional[bool] = Field(None, description="Filtrar productos con stock bajo")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
