"""
Modelo de Método de Pago.
"""
from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class PaymentMethodCatalog(BaseModel):
    """
    Catálogo de métodos de pago disponibles para un negocio.
    Ej: Efectivo, Débito, Crédito, Transferencia, Mercado Pago, Cheque
    
    Diferente de PaymentMethod (enum) que se usa en la tabla payments para cuenta corriente.
    """
    __tablename__ = "payment_methods"

    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.id"), nullable=False)
    name = Column(String(100), nullable=False)  # "Efectivo", "Débito", "Crédito"
    code = Column(String(20), nullable=False)   # "CASH", "DEBIT", "CREDIT"
    is_active = Column(Boolean, default=True, nullable=False)
    requires_reference = Column(Boolean, default=False, nullable=False)  # Si requiere N° de transacción

    # Relaciones
    business = relationship("Business", back_populates="payment_methods_catalog")
    voucher_payments = relationship("VoucherPayment", back_populates="payment_method_catalog", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PaymentMethodCatalog {self.code}: {self.name}>"
