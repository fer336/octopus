"""
Schemas para Afip SDK y ARCA/AFIP.
Define las estructuras de datos para facturación electrónica.
"""

from pydantic import BaseModel, Field

# ============================================================================
# Schemas de Configuración ARCA (Afip SDK)
# ============================================================================

class AfipSdkConfigUpdate(BaseModel):
    """Schema para actualizar la configuración de Afip SDK."""
    afipsdk_access_token: str | None = Field(None, description="Access token de Afip SDK")
    afip_cert: str | None = Field(None, description="Contenido del certificado PEM de AFIP")
    afip_key: str | None = Field(None, description="Contenido de la clave privada PEM de AFIP")
    arca_environment: str | None = Field(None, description="Entorno: testing o production")


class AfipSdkConfigResponse(BaseModel):
    """Schema de respuesta de configuración Afip SDK."""
    afipsdk_access_token_configured: bool
    afip_cert_configured: bool = False
    afip_key_configured: bool = False
    arca_environment: str
    cuit: str | None = None
    sale_point: str | None = None
    business_name: str | None = None
    tax_condition: str | None = None

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
    cae: str | None = None
    cae_expiration: str | None = None
    voucher_number: str | None = None
    pdf_url: str | None = None
    errors: list[str] | None = None


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
    step: str | None = None
    cae: str | None = None
    cae_expiration: str | None = None
    voucher_number: int | None = None
    error: str | None = None
    request_data: dict | None = None
    api_response: dict | None = None
