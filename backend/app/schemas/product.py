"""
Schemas para Productos.
"""

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ProductCreate(BaseSchema):
    """Schema para crear un producto."""

    code: str = Field(..., max_length=50, description="Código interno del negocio")
    supplier_code: str | None = Field(
        None, max_length=50, description="Código del proveedor"
    )
    description: str = Field(
        ..., max_length=500, description="Descripción del producto"
    )
    details: str | None = Field(None, description="Descripción extendida")
    brand: str | None = Field(None, max_length=100)
    line: str | None = Field(None, max_length=100)
    application_area: str | None = Field(None, max_length=100)
    finish: str | None = Field(None, max_length=80)
    quality_tier: str | None = Field(None, max_length=40)
    attributes_json: str | None = Field(
        None,
        description="Atributos por categoría en JSON serializado",
    )
    customer_terms: str | None = Field(
        None,
        description="Términos populares / jerga del cliente separados por comas. Usados por el agente IA.",
    )

    category_id: UUID | None = None
    supplier_id: UUID | None = None

    cost_price: Decimal = Field(default=Decimal("0"), ge=0)
    list_price: Decimal = Field(default=Decimal("0"), ge=0)

    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    extra_cost: Decimal = Field(
        default=Decimal("0"), ge=0, description="Porcentaje de cargo extra"
    )
    profit_margin: Decimal = Field(
        default=Decimal("0"), ge=0, description="Ganancia/utilidad en porcentaje"
    )

    iva_rate: Decimal = Field(default=Decimal("21.00"), description="Alícuota IVA")

    current_stock: int = Field(default=0, ge=0)
    minimum_stock: int = Field(default=0, ge=0)
    unit: str = Field(default="unidad", max_length=20)


class ProductUpdate(BaseSchema):
    """Schema para actualizar un producto (todos los campos opcionales)."""

    code: str | None = Field(None, max_length=50)
    supplier_code: str | None = Field(None, max_length=50)
    description: str | None = Field(None, max_length=500)
    details: str | None = None
    brand: str | None = Field(None, max_length=100)
    line: str | None = Field(None, max_length=100)
    application_area: str | None = Field(None, max_length=100)
    finish: str | None = Field(None, max_length=80)
    quality_tier: str | None = Field(None, max_length=40)
    attributes_json: str | None = Field(
        None,
        description="Atributos por categoría en JSON serializado",
    )
    customer_terms: str | None = Field(
        None,
        description="Términos populares / jerga del cliente separados por comas.",
    )

    category_id: UUID | None = None
    supplier_id: UUID | None = None

    cost_price: Decimal | None = Field(None, ge=0)
    list_price: Decimal | None = Field(None, ge=0)

    discount_1: Decimal | None = Field(None, ge=0, le=100)
    discount_2: Decimal | None = Field(None, ge=0, le=100)
    discount_3: Decimal | None = Field(None, ge=0, le=100)
    extra_cost: Decimal | None = Field(None, ge=0)
    profit_margin: Decimal | None = Field(None, ge=0)

    iva_rate: Decimal | None = None

    current_stock: int | None = Field(None, ge=0)
    minimum_stock: int | None = Field(None, ge=0)
    unit: str | None = Field(None, max_length=20)

    is_active: bool | None = None


class ProductBulkUpdateItem(ProductUpdate):
    """Producto dentro de una actualización en lote."""

    id: UUID


class ProductBulkUpdateRequest(BaseSchema):
    """Request para actualizar varios productos en una sola operación."""

    products: list[ProductBulkUpdateItem] = Field(..., min_length=1)


class ProductResponse(BaseResponse):
    """Schema para respuesta de producto."""

    code: str
    supplier_code: str | None
    description: str
    details: str | None
    brand: str | None
    line: str | None
    application_area: str | None
    finish: str | None
    quality_tier: str | None
    attributes_json: str | None
    customer_terms: str | None

    category_id: UUID | None
    supplier_id: UUID | None

    cost_price: Decimal
    list_price: Decimal

    discount_1: Decimal
    discount_2: Decimal
    discount_3: Decimal
    discount_display: str | None
    extra_cost: Decimal
    profit_margin: Decimal

    net_price: Decimal
    sale_price: Decimal

    iva_rate: Decimal

    current_stock: int
    minimum_stock: int
    unit: str

    is_active: bool


class ProductBulkUpdateResponse(BaseSchema):
    """Resultado de una actualización en lote."""

    updated_count: int
    not_found_ids: list[UUID] = Field(default_factory=list)
    products: list[ProductResponse]


class ProductListParams(BaseSchema):
    """Parámetros para listar productos."""

    search: str | None = Field(None, description="Buscar por código o descripción")
    category_id: UUID | None = None
    supplier_id: UUID | None = None
    brand: str | None = None
    line: str | None = None
    application_area: str | None = None
    finish: str | None = None
    quality_tier: str | None = None
    is_active: bool | None = True
    low_stock: bool | None = Field(
        None, description="Filtrar productos con stock bajo"
    )
    sort_by: Literal["description", "sale_price", "current_stock"] = "description"
    sort_order: Literal["asc", "desc"] = "asc"
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
