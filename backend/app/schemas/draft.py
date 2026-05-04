"""
Schemas Pydantic para la tabla de Borradores (Drafts).
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DraftItemSchema(BaseModel):
    """Schema para un item dentro del borrador."""
    
    product_id: str = Field(..., description="ID del producto")
    code: str = Field(..., description="Código del producto")
    description: str = Field(..., description="Descripción del producto")
    net_price: float = Field(..., description="Precio sin IVA")
    sale_price: float = Field(..., description="Precio con IVA")
    quantity: float = Field(..., description="Cantidad")
    discount: float = Field(default=0, description="Porcentaje de descuento")


class DraftCreate(BaseModel):
    """Schema para crear un borrador."""
    
    voucher_type: str = Field(..., description="Tipo de voucher: quotation, receipt, current_account, invoice")
    client_id: Optional[str] = Field(None, description="ID del cliente")
    client_name: Optional[str] = Field(None, description="Nombre del cliente (cache)")
    operating_client_id: Optional[str] = Field(None, description="ID del cliente operativo (para cuenta corriente)")
    items: list[DraftItemSchema] = Field(default_factory=list, description="Lista de items")
    general_discount: float = Field(default=0, ge=0, le=100, description="Descuento general (0-100)")
    show_prices: bool = Field(default=True, description="Si muestra precios")


class DraftUpdate(BaseModel):
    """Schema para actualizar un borrador."""
    
    voucher_type: Optional[str] = Field(None, description="Tipo de voucher")
    client_id: Optional[str] = Field(None, description="ID del cliente")
    client_name: Optional[str] = Field(None, description="Nombre del cliente (cache)")
    operating_client_id: Optional[str] = Field(None, description="ID del cliente operativo")
    items: Optional[list[DraftItemSchema]] = Field(None, description="Lista de items")
    general_discount: Optional[float] = Field(None, ge=0, le=100, description="Descuento general (0-100)")
    show_prices: Optional[bool] = Field(None, description="Si muestra precios")


class DraftResponse(BaseModel):
    """Schema para retornar un borrador."""
    
    id: str
    business_id: str
    user_id: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    voucher_type: str
    operating_client_id: Optional[str] = None
    items: list[dict]
    general_discount: float
    show_prices: bool
    item_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DraftListResponse(BaseModel):
    """Schema para listar borradores."""
    
    id: str
    client_name: Optional[str]
    voucher_type: str
    item_count: int
    general_discount: float
    show_prices: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True