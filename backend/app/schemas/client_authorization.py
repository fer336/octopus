"""
Schemas para autorizaciones de subclientes en Cuenta Corriente.
"""

from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseResponse, BaseSchema


class ClientAuthorizationCreate(BaseSchema):
    """Alta de autorización titular/subcliente."""

    billing_client_id: UUID = Field(..., description="Cliente titular/pagador")
    operating_client_id: UUID = Field(..., description="Cliente subcliente/retirador")
    operating_credit_limit: Decimal | None = Field(
        None,
        ge=0,
        description="Sublímite opcional para este subcliente en esta relación",
    )
    is_active: bool = True
    notes: str | None = None


class ClientAuthorizationUpdate(BaseSchema):
    """Edición de autorización existente."""

    operating_credit_limit: Decimal | None = Field(None, ge=0)
    is_active: bool | None = None
    notes: str | None = None


class ClientAuthorizationResponse(BaseResponse):
    """Respuesta de autorización titular/subcliente."""

    billing_client_id: UUID
    operating_client_id: UUID
    operating_credit_limit: Decimal | None
    is_active: bool
    notes: str | None


class ClientAuthorizationListParams(BaseSchema):
    """Parámetros de listado de autorizaciones."""

    billing_client_id: UUID | None = None
    operating_client_id: UUID | None = None
    is_active: bool | None = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)
