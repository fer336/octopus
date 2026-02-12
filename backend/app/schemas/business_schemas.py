"""
Schemas para Business (Negocio).
"""
from typing import Optional
from pydantic import BaseModel, Field


class BusinessBase(BaseModel):
    """Schema base para Business."""
    name: str = Field(..., min_length=1, max_length=255, description="Razón social")
    cuit: str = Field(..., pattern=r"^\d{2}-\d{8}-\d{1}$", description="CUIT formato XX-XXXXXXXX-X")
    tax_condition: str = Field(..., min_length=1, max_length=50, description="Condición ante IVA")
    address: Optional[str] = Field(None, max_length=500, description="Dirección")
    city: Optional[str] = Field(None, max_length=100, description="Ciudad")
    province: Optional[str] = Field(None, max_length=100, description="Provincia")
    postal_code: Optional[str] = Field(None, max_length=10, description="Código postal")
    phone: Optional[str] = Field(None, max_length=50, description="Teléfono")
    email: Optional[str] = Field(None, max_length=255, description="Email")
    logo_url: Optional[str] = Field(None, max_length=500, description="URL del logo")
    header_text: Optional[str] = Field(None, description="Texto adicional para membrete")
    sale_point: str = Field("0001", max_length=5, description="Punto de venta ARCA")


class BusinessUpdate(BaseModel):
    """Schema para actualizar Business."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    cuit: Optional[str] = Field(None, max_length=13)
    tax_condition: Optional[str] = Field(None, min_length=1, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=10)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=500)
    header_text: Optional[str] = Field(None)
    sale_point: Optional[str] = Field(None, max_length=5)


class BusinessResponse(BaseModel):
    """Schema de respuesta para Business."""
    id: str
    name: str
    cuit: str
    tax_condition: str
    address: Optional[str]
    city: Optional[str]
    province: Optional[str]
    postal_code: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    logo_url: Optional[str]
    header_text: Optional[str]
    sale_point: str
    
    # Configuración ARCA (solo lectura, se edita en /arca)
    arca_environment: Optional[str]
    
    class Config:
        from_attributes = True
