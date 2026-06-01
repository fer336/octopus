"""Schemas para Marcas."""

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


class BrandListParams(BaseSchema):
    """Parámetros para listar marcas."""

    search: str | None = Field(None, description="Buscar por nombre")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=100, ge=1, le=100)
