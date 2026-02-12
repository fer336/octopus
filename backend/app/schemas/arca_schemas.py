"""
Schemas para Afip SDK y ARCA/AFIP.
Define las estructuras de datos para facturación electrónica.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Schemas de Configuración ARCA (Afip SDK)
# ============================================================================

class AfipSdkConfigUpdate(BaseModel):
    """Schema para actualizar la configuración de Afip SDK."""
    afipsdk_access_token: Optional[str] = Field(None, description="Access token de Afip SDK")
    afip_cert: Optional[str] = Field(None, description="Contenido del certificado PEM de AFIP")
    afip_key: Optional[str] = Field(None, description="Contenido de la clave privada PEM de AFIP")
    arca_environment: Optional[str] = Field(None, description="Entorno: testing o production")


class AfipSdkConfigResponse(BaseModel):
    """Schema de respuesta de configuración Afip SDK."""
    afipsdk_access_token_configured: bool
    afip_cert_configured: bool = False
    afip_key_configured: bool = False
    arca_environment: str
    cuit: Optional[str] = None
    sale_point: Optional[str] = None
    business_name: Optional[str] = None
    tax_condition: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Schemas de Emisión de Comprobantes
# ============================================================================

class EmitInvoiceRequest(BaseModel):
    """Request desde el frontend para emitir factura."""
    voucher_id: str = Field(..., description="ID del comprobante a emitir")
    

class EmitInvoiceResponse(BaseModel):
    """Response de emisión de factura."""
    success: bool
    message: str
    cae: Optional[str] = None
    cae_expiration: Optional[str] = None
    voucher_number: Optional[str] = None
    pdf_url: Optional[str] = None
    errors: Optional[List[str]] = None


# ============================================================================
# Schemas de Consulta
# ============================================================================

class LastVoucherRequest(BaseModel):
    """Request para obtener el último comprobante."""
    sale_point: int = Field(..., description="Punto de venta")
    voucher_type: int = Field(..., description="Tipo de comprobante (código AFIP)")


class VoucherInfoRequest(BaseModel):
    """Request para obtener info de un comprobante."""
    number: int = Field(..., description="Número de comprobante")
    sale_point: int = Field(..., description="Punto de venta")
    voucher_type: int = Field(..., description="Tipo de comprobante (código AFIP)")


# ============================================================================
# Schemas de Factura de Prueba
# ============================================================================

class TestInvoiceResponse(BaseModel):
    """Respuesta de factura de prueba."""
    success: bool
    message: str
    step: Optional[str] = None
    cae: Optional[str] = None
    cae_expiration: Optional[str] = None
    voucher_number: Optional[int] = None
    error: Optional[str] = None
    request_data: Optional[dict] = None
    api_response: Optional[dict] = None
