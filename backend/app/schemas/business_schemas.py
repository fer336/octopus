"""
Schemas para Business (Negocio).
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class BusinessBase(BaseModel):
    """Schema base para Business."""

    name: str = Field(..., min_length=1, max_length=255, description="Razón social")
    cuit: str = Field(
        ..., pattern=r"^\d{2}-\d{8}-\d{1}$", description="CUIT formato XX-XXXXXXXX-X"
    )
    tax_condition: str = Field(
        ..., min_length=1, max_length=50, description="Condición ante IVA"
    )
    address: str | None = Field(None, max_length=500, description="Dirección")
    city: str | None = Field(None, max_length=100, description="Ciudad")
    province: str | None = Field(None, max_length=100, description="Provincia")
    postal_code: str | None = Field(None, max_length=10, description="Código postal")
    phone: str | None = Field(None, max_length=50, description="Teléfono")
    email: str | None = Field(None, max_length=255, description="Email")
    logo_url: str | None = Field(None, max_length=500, description="URL del logo")
    hide_business_name_in_pdf: bool = Field(
        False,
        description="Si true y hay logo, oculta razón social en PDFs",
    )
    logo_position: Literal["left", "center", "right"] = Field(
        "left",
        description="Posición horizontal del logo en el header PDF",
    )
    logo_display_mode: Literal["alongside_text", "replace_text"] = Field(
        "alongside_text",
        description="Si el logo acompaña al nombre o lo reemplaza",
    )
    header_text: str | None = Field(
        None, description="Texto adicional para membrete"
    )
    sale_point: str = Field("0001", max_length=5, description="Punto de venta ARCA")


class BusinessUpdate(BaseModel):
    """Schema para actualizar Business."""

    name: str | None = Field(None, min_length=1, max_length=255)
    cuit: str | None = Field(None, max_length=13)
    tax_condition: str | None = Field(None, min_length=1, max_length=50)
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=10)
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    logo_url: str | None = Field(None, max_length=500)
    hide_business_name_in_pdf: bool | None = Field(None)
    logo_position: Literal["left", "center", "right"] | None = Field(None)
    logo_display_mode: Literal["alongside_text", "replace_text"] | None = Field(None)
    header_text: str | None = Field(None)
    sale_point: str | None = Field(None, max_length=5)


class BusinessResponse(BaseModel):
    """Schema de respuesta para Business."""

    id: str | UUID
    name: str
    cuit: str
    tax_condition: str
    address: str | None
    city: str | None
    province: str | None
    postal_code: str | None
    phone: str | None
    email: str | None
    logo_url: str | None
    hide_business_name_in_pdf: bool
    logo_position: Literal["left", "center", "right"]
    logo_display_mode: Literal["alongside_text", "replace_text"]
    header_text: str | None
    sale_point: str
    ai_agent_enabled: bool
    current_account_mode: Literal["disabled", "automatic", "manual"]
    invoicing_enabled: bool
    receipts_enabled: bool
    quotation_enabled: bool
    inventory_enabled: bool
    stockpile_enabled: bool
    price_update_enabled: bool
    reports_enabled: bool
    sql_backup_enabled: bool

    # Configuración ARCA (solo lectura, se edita en /arca)
    arca_environment: str | None

    class Config:
        from_attributes = True
