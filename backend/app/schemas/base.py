"""
Schemas base reutilizables.
"""
from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class BaseSchema(BaseModel):
    """Schema base con configuración común."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class BaseResponse(BaseSchema):
    """Schema base para respuestas que incluyen campos de auditoría."""

    id: UUID
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(BaseSchema, Generic[T]):
    """Schema para respuestas paginadas."""

    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int


class MessageResponse(BaseSchema):
    """Schema para respuestas simples con mensaje."""

    message: str
    success: bool = True


class BulkDeleteResponse(BaseSchema):
    """Schema para respuesta de borrado masivo."""

    deleted_count: int
    message: str
