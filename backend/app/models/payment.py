"""
Modelo de Pago.
Registra los pagos recibidos de clientes.
"""
import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PaymentMethod(str, enum.Enum):
    """Métodos de pago disponibles."""

    CASH = "cash"  # Efectivo
    TRANSFER = "transfer"  # Transferencia bancaria
    CHECK = "check"  # Cheque
    CREDIT_CARD = "credit_card"  # Tarjeta de crédito
    DEBIT_CARD = "debit_card"  # Tarjeta de débito
    MERCADOPAGO = "mercadopago"  # MercadoPago
    OTHER = "other"  # Otro


class Payment(BaseModel):
    """
    Pago recibido de un cliente.
    Puede estar asociado a un comprobante o ser un pago a cuenta.
    """

    __tablename__ = "payments"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id"),
        nullable=True,  # Puede ser pago a cuenta
        index=True,
    )
    received_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # Datos del pago
    date = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    method = Column(Enum(PaymentMethod), nullable=False)

    # Referencia (número de cheque, transferencia, etc.)
    reference = Column(String(100), nullable=True)

    # Para cheques
    check_bank = Column(String(100), nullable=True)
    check_date = Column(Date, nullable=True)  # Fecha de cobro

    notes = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business")
    client = relationship("Client", back_populates="payments")
    voucher = relationship("Voucher", back_populates="payments")

    def __repr__(self) -> str:
        return f"<Payment {self.date}: ${self.amount} ({self.method.value})>"
