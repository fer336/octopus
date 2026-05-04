"""
Modelo de Remito de Pago.
Se genera automáticamente al registrar el pago de una factura en Cuenta Corriente.
"""

from sqlalchemy import Column, Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel
from app.models.payment import PaymentMethod


class PaymentReceipt(BaseModel):
    """
    Remito de Pago - documento que se genera cuando se paga una factura en cuenta corriente.
    Incluye: número de factura original, detalle de ítems, monto abonado, método de pago, fecha.
    """

    __tablename__ = "payment_receipts"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    # Factura que se está pagando
    invoice_voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id"),
        nullable=False,
        index=True,
    )
    # Cliente que paga
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    # Usuario que registra el pago
    received_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # Datos del pago
    payment_date = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)  # Monto abonado
    payment_method = Column(Enum(PaymentMethod), nullable=False)
    reference = Column(String(100), nullable=True)  # Número de referencia (transferencia, cheque, etc.)

    # Numeración del remito de pago
    sale_point = Column(String(5), nullable=False)
    number = Column(String(8), nullable=False)

    # Notas adicionales
    notes = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business")
    client = relationship("Client")
    invoice_voucher = relationship("Voucher", foreign_keys=[invoice_voucher_id])
    received_by_user = relationship("User")

    @property
    def full_number(self) -> str:
        """Retorna el número completo del remito de pago."""
        return f"{self.sale_point}-{self.number}"

    def __repr__(self) -> str:
        return f"<PaymentReceipt {self.full_number} for Invoice {self.invoice_voucher_id}>"