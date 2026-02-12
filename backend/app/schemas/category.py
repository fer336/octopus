"""
Schemas para Categorías.
"""
from typing import Optional
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class CategoryCreate(BaseSchema):
    """Schema para crear una categoría."""

    name: str = Field(..., max_length=100, description="Nombre de la categoría")
    description: Optional[str] = None
    parent_id: Optional[UUID] = Field(None, description="ID de la categoría padre")


class CategoryUpdate(BaseSchema):
    """Schema para actualizar una categoría."""

    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[UUID] = None


class CategoryResponse(BaseResponse):
    """Schema para respuesta de categoría."""

    name: str
    description: Optional[str]
    parent_id: Optional[UUID]


class CategoryWithChildren(CategoryResponse):
    """Schema para categoría con subcategorías."""

    subcategories: list["CategoryWithChildren"] = []


class CategoryListParams(BaseSchema):
    """Parámetros para listar categorías."""

    search: Optional[str] = Field(None, description="Buscar por nombre")
    parent_id: Optional[UUID] = Field(None, description="Filtrar por categoría padre")
    root_only: bool = Field(default=False, description="Solo categorías raíz")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


# Necesario para la referencia recursiva
CategoryWithChildren.model_rebuild()
