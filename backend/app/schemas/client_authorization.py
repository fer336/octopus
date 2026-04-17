"""
Schemas para autorizaciones de subclientes en Cuenta Corriente.
"""

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ClientAuthorizationCreate(BaseSchema):
    """Alta de autorización titular/subcliente."""

    billing_client_id: UUID = Field(..., description="Cliente titular/pagador")
    operating_client_id: UUID = Field(..., description="Cliente subcliente/retirador")
    operating_credit_limit: Optional[Decimal] = Field(
        None,
        ge=0,
        description="Sublímite opcional para este subcliente en esta relación",
    )
    is_active: bool = True
    notes: Optional[str] = None


class ClientAuthorizationUpdate(BaseSchema):
    """Edición de autorización existente."""

    operating_credit_limit: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ClientAuthorizationResponse(BaseResponse):
    """Respuesta de autorización titular/subcliente."""

    billing_client_id: UUID
    operating_client_id: UUID
    operating_credit_limit: Optional[Decimal]
    is_active: bool
    notes: Optional[str]


class ClientAuthorizationListParams(BaseSchema):
    """Parámetros de listado de autorizaciones."""

    billing_client_id: Optional[UUID] = None
    operating_client_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)
