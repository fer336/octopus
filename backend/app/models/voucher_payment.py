"""
Modelo de Pago de Comprobante.
Relación N:N entre Vouchers y PaymentMethods.
"""
from sqlalchemy import Column, String, ForeignKey, Numeric, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from decimal import Decimal
from app.models.base import BaseModel


class VoucherPayment(BaseModel):
    """
    Registro de un pago asociado a un comprobante.
    Un comprobante puede tener múltiples pagos (pago mixto).
    
    Ejemplo:
    Factura #123 - Total: $10,000
    Pagos:
      - Efectivo: $5,000
      - Débito: $3,000
      - Transferencia: $2,000
    """
    __tablename__ = "voucher_payments"

    voucher_id = Column(UUID(as_uuid=True), ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False)
    payment_method_id = Column(UUID(as_uuid=True), ForeignKey("payment_methods.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)  # Monto pagado con este método
    reference = Column(String(100), nullable=True)    # N° de transacción, cheque, etc.

    # Relaciones
    voucher = relationship("Voucher", back_populates="voucher_payments")
    payment_method_catalog = relationship("PaymentMethodCatalog", back_populates="voucher_payments")

    # Constraints
    __table_args__ = (
        CheckConstraint('amount > 0', name='positive_amount'),
    )

    def __repr__(self):
        return f"<VoucherPayment {self.payment_method_catalog.name if self.payment_method_catalog else 'Unknown'}: ${self.amount}>"
