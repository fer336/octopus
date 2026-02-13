"""
Schemas para Notas de Crédito.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
from decimal import Decimal


class CreditNoteItemCreate(BaseModel):
    """Item de una Nota de Crédito."""
    
    product_id: UUID
    quantity: Decimal = Field(gt=0, description="Cantidad a devolver")
    unit_price: Decimal = Field(ge=0, description="Precio unitario original")
    discount_percent: Decimal = Field(ge=0, le=100, default=0)


class CreditNoteCreate(BaseModel):
    """
    Datos para crear una Nota de Crédito.
    """
    
    original_voucher_id: UUID = Field(description="ID de la factura original")
    reason: str = Field(min_length=1, max_length=500, description="Motivo de la NC")
    items: List[CreditNoteItemCreate] = Field(min_items=1, description="Productos a devolver")
    
    class Config:
        json_schema_extra = {
            "example": {
                "original_voucher_id": "123e4567-e89b-12d3-a456-426614174000",
                "reason": "Devolución por producto defectuoso",
                "items": [
                    {
                        "product_id": "123e4567-e89b-12d3-a456-426614174001",
                        "quantity": 2,
                        "unit_price": 1500.50,
                        "discount_percent": 10
                    }
                ]
            }
        }


class CreditNoteResponse(BaseModel):
    """Respuesta al crear una NC."""
    
    id: UUID
    voucher_type: str
    sale_point: str
    number: str
    full_number: str
    date: str
    subtotal: Decimal
    iva_amount: Decimal
    total: Decimal
    cae: Optional[str] = None
    cae_expiration: Optional[str] = None
    original_voucher_id: UUID
    
    class Config:
        from_attributes = True
