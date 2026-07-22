"""
Schemas para Categorías.
"""
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class CategoryCreate(BaseSchema):
    """Schema para crear una categoría."""

    name: str = Field(..., max_length=100, description="Nombre de la categoría")
    description: str | None = None
    parent_id: UUID | None = Field(None, description="ID de la categoría padre")


class CategoryUpdate(BaseSchema):
    """Schema para actualizar una categoría."""

    name: str | None = Field(None, max_length=100)
    description: str | None = None
    parent_id: UUID | None = None


class CategoryResponse(BaseResponse):
    """Schema para respuesta de categoría."""

    name: str
    description: str | None
    parent_id: UUID | None


class CategoryWithChildren(CategoryResponse):
    """Schema para categoría con subcategorías."""

    subcategories: list["CategoryWithChildren"] = []


class CategoryListParams(BaseSchema):
    """Parámetros para listar categorías."""

    search: str | None = Field(None, description="Buscar por nombre")
    parent_id: UUID | None = Field(None, description="Filtrar por categoría padre")
    root_only: bool = Field(default=False, description="Solo categorías raíz")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class CategoryBulkDeleteRequest(BaseSchema):
    """Request para eliminar múltiples categorías."""

    ids: list[UUID] = Field(..., min_length=1, description="IDs de categorías")


class CategoryBulkDeleteResponse(BaseSchema):
    """Resultado de eliminación masiva de categorías."""

    deleted: int
    not_found: int


# Necesario para la referencia recursiva
CategoryWithChildren.model_rebuild()
