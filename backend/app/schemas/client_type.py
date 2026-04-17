"""
Schemas para Tipos de Cliente.
"""

from typing import Optional

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ClientTypeCreate(BaseSchema):
    """Schema para crear tipo de cliente."""

    name: str = Field(..., min_length=2, max_length=80)
    is_subclient_eligible: bool = Field(
        default=False,
        description="Indica si clientes de este tipo pueden retirar por terceros",
    )


class ClientTypeUpdate(BaseSchema):
    """Schema para actualizar tipo de cliente."""

    name: Optional[str] = Field(None, min_length=2, max_length=80)
    is_subclient_eligible: Optional[bool] = None


class ClientTypeResponse(BaseResponse):
    """Schema de respuesta para tipo de cliente."""

    name: str
    is_subclient_eligible: bool


class ClientTypeListParams(BaseSchema):
    """Parámetros para listar tipos de cliente."""

    search: Optional[str] = Field(None, description="Buscar por nombre")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)
