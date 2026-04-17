"""
Schemas para Clientes.
"""

from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import BaseResponse, BaseSchema


class ClientCreate(BaseSchema):
    """Schema para crear un cliente."""

    name: str = Field(..., max_length=255, description="Razón social o nombre")
    document_type: str = Field(..., max_length=10, description="CUIT, CUIL o DNI")
    document_number: str = Field(..., max_length=20, description="Número de documento")
    tax_condition: str = Field(..., max_length=50, description="Condición ante IVA")
    client_type_id: Optional[UUID] = Field(
        None,
        description="Tipo de cliente (si no se envía, se asigna el tipo por defecto)",
    )

    # Dirección
    street: Optional[str] = Field(None, max_length=255)
    street_number: Optional[str] = Field(None, max_length=20)
    floor: Optional[str] = Field(None, max_length=10)
    apartment: Optional[str] = Field(None, max_length=10)
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=10)

    # Contacto
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    notes: Optional[str] = None

    credit_limit: Optional[Decimal] = Field(None, ge=0)
    current_account_mode: Literal["disabled", "limited", "unlimited"] = "disabled"


class ClientUpdate(BaseSchema):
    """Schema para actualizar un cliente."""

    name: Optional[str] = Field(None, max_length=255)
    document_type: Optional[str] = Field(None, max_length=10)
    document_number: Optional[str] = Field(None, max_length=20)
    tax_condition: Optional[str] = Field(None, max_length=50)
    client_type_id: Optional[UUID] = None

    street: Optional[str] = Field(None, max_length=255)
    street_number: Optional[str] = Field(None, max_length=20)
    floor: Optional[str] = Field(None, max_length=10)
    apartment: Optional[str] = Field(None, max_length=10)
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=10)

    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    notes: Optional[str] = None

    credit_limit: Optional[Decimal] = Field(None, ge=0)
    current_account_mode: Optional[Literal["disabled", "limited", "unlimited"]] = None


class ClientResponse(BaseResponse):
    """Schema para respuesta de cliente."""

    name: str
    document_type: str
    document_number: str
    tax_condition: str
    client_type_id: UUID

    street: Optional[str]
    street_number: Optional[str]
    floor: Optional[str]
    apartment: Optional[str]
    city: Optional[str]
    province: Optional[str]
    postal_code: Optional[str]

    phone: Optional[str]
    email: Optional[str]
    notes: Optional[str]

    current_balance: Decimal
    credit_limit: Optional[Decimal]
    current_account_mode: Literal["disabled", "limited", "unlimited"]


class ClientListParams(BaseSchema):
    """Parámetros para listar clientes."""

    search: Optional[str] = Field(None, description="Buscar por nombre o documento")
    tax_condition: Optional[str] = None
    client_type_id: Optional[UUID] = None
    current_account_mode: Optional[Literal["disabled", "limited", "unlimited"]] = None
    has_balance: Optional[bool] = Field(None, description="Filtrar clientes con saldo")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)
