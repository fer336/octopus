"""
Schemas para Métodos de Pago y Pagos de Comprobantes.
"""
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from decimal import Decimal


class PaymentMethodResponse(BaseModel):
    """Método de pago disponible."""
    
    id: UUID
    business_id: UUID
    name: str
    code: str
    is_active: bool
    requires_reference: bool
    
    class Config:
        from_attributes = True


class VoucherPaymentCreate(BaseModel):
    """Datos para registrar un pago de un comprobante."""
    
    payment_method_id: UUID = Field(description="ID del método de pago")
    amount: Decimal = Field(gt=0, description="Monto pagado con este método")
    reference: Optional[str] = Field(None, max_length=100, description="N° de transacción, cheque, etc.")
    
    class Config:
        json_schema_extra = {
            "example": {
                "payment_method_id": "123e4567-e89b-12d3-a456-426614174000",
                "amount": 5000.00,
                "reference": "TRX-ABC123"
            }
        }


class VoucherPaymentResponse(BaseModel):
    """Pago registrado de un comprobante."""
    
    id: UUID
    voucher_id: UUID
    payment_method_id: UUID
    amount: Decimal
    reference: Optional[str]
    
    # Datos del método (joined)
    payment_method_name: Optional[str] = None
    payment_method_code: Optional[str] = None
    
    class Config:
        from_attributes = True
