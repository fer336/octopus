"""
Modelo de Cuenta Corriente del Cliente.
Registra todos los movimientos que afectan el saldo.
"""
import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class MovementType(str, enum.Enum):
    """Tipos de movimiento en cuenta corriente."""

    INVOICE = "invoice"  # Factura emitida (aumenta deuda)
    PAYMENT = "payment"  # Pago recibido (disminuye deuda)
    CREDIT_NOTE = "credit_note"  # Nota de crédito (disminuye deuda)
    DEBIT_NOTE = "debit_note"  # Nota de débito (aumenta deuda)
    ADJUSTMENT_DEBIT = "adjustment_debit"  # Ajuste débito (aumenta deuda)
    ADJUSTMENT_CREDIT = "adjustment_credit"  # Ajuste crédito (disminuye deuda)


class ClientAccount(BaseModel):
    """
    Movimiento en la cuenta corriente de un cliente.
    Cada factura, pago o nota genera un movimiento.
    """

    __tablename__ = "client_accounts"

    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id"),
        nullable=True,
    )
    payment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payments.id"),
        nullable=True,
    )

    # Datos del movimiento
    date = Column(Date, nullable=False, index=True)
    movement_type = Column(Enum(MovementType), nullable=False)
    description = Column(String(255), nullable=False)

    # Montos
    debit = Column(Numeric(12, 2), default=0, nullable=False)  # Aumenta deuda
    credit = Column(Numeric(12, 2), default=0, nullable=False)  # Disminuye deuda
    balance = Column(Numeric(12, 2), nullable=False)  # Saldo después del movimiento

    # Relaciones
    client = relationship("Client", back_populates="account_movements")
    voucher = relationship("Voucher")
    payment = relationship("Payment")

    def __repr__(self) -> str:
        return f"<ClientAccount {self.date}: {self.movement_type.value} D:{self.debit} C:{self.credit}>"
