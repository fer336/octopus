"""Schemas para Marcas."""

from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class BrandCreate(BaseSchema):
    """Schema para crear una marca."""

    name: str = Field(..., max_length=100, description="Nombre de la marca")


class BrandUpdate(BaseSchema):
    """Schema para actualizar una marca."""

    name: str | None = Field(None, max_length=100)


class BrandResponse(BaseResponse):
    """Schema para respuesta de marca."""

    name: str
    normalized_name: str
    product_count: int = 0


class BrandProductItem(BaseSchema):
    """Schema liviano para producto vinculado a una marca."""

    id: UUID
    code: str
    description: str
    sale_price: Decimal
    current_stock: int
    is_active: bool


class BrandListParams(BaseSchema):
    """Parámetros para listar marcas."""

    search: str | None = Field(None, description="Buscar por nombre")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=100, ge=1, le=100)


class BrandBulkDeleteRequest(BaseSchema):
    """Request para eliminar múltiples marcas."""

    ids: list[UUID] = Field(..., min_length=1, description="IDs de marcas")


class BrandBulkDeleteResponse(BaseSchema):
    """Resultado de eliminación masiva de marcas."""

    deleted: int
    not_found: int
