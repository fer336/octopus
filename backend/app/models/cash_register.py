"""
Modelos de Caja.
CashRegister: caja del día (una por negocio por día).
CashMovement: cada movimiento individual dentro de la caja.
"""
import enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class CashRegisterStatus(str, enum.Enum):
    """Estado de la caja. EXPIRED se calcula en runtime, no se persiste."""
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class CashMovementType(str, enum.Enum):
    """Tipo de movimiento de caja."""
    SALE = "SALE"                       # Venta confirmada (automático)
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"  # Cobro de cuenta corriente (automático)
    INCOME = "INCOME"                   # Ingreso manual
    EXPENSE = "EXPENSE"                 # Egreso manual


class CashPaymentMethod(str, enum.Enum):
    """Método de pago del movimiento."""
    CASH = "CASH"
    CARD = "CARD"
    TRANSFER = "TRANSFER"
    CHECK = "CHECK"
    OTHER = "OTHER"


class CashRegister(BaseModel):
    """
    Caja diaria del negocio.
    Solo puede haber una caja con status=OPEN por negocio a la vez.
    El estado EXPIRED se calcula en runtime: status=OPEN y opened_at < NOW()-24hs.
    """
    __tablename__ = "cash_registers"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    opened_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    closed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    status = Column(
        Enum(CashRegisterStatus),
        nullable=False,
        default=CashRegisterStatus.OPEN,
    )

    # Apertura
    opening_amount = Column(Numeric(12, 2), nullable=False, default=0)
    opened_at = Column(DateTime, nullable=False)

    # Cierre
    closed_at = Column(DateTime, nullable=True)
    counted_cash = Column(Numeric(12, 2), nullable=True)   # Efectivo físico contado
    difference = Column(Numeric(12, 2), nullable=True)     # counted_cash - esperado efectivo; negativo=faltante
    difference_reason = Column(Text, nullable=True)        # Obligatorio si difference != 0
    closing_pdf_path = Column(String(500), nullable=True)  # Ruta del PDF generado

    # Relaciones
    business = relationship("Business")
    opener = relationship("User", foreign_keys=[opened_by])
    closer = relationship("User", foreign_keys=[closed_by])
    movements = relationship(
        "CashMovement",
        back_populates="cash_register",
        order_by="CashMovement.created_at",
    )

    def __repr__(self) -> str:
        return f"<CashRegister {self.opened_at.date()} status={self.status}>"


class CashMovement(BaseModel):
    """
    Movimiento individual dentro de una caja.
    Los de tipo SALE y PAYMENT_RECEIVED se crean automáticamente.
    Los de tipo INCOME y EXPENSE los crea el operador manualmente.
    """
    __tablename__ = "cash_movements"

    cash_register_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cash_registers.id"),
        nullable=False,
        index=True,
    )
    type = Column(
        Enum(CashMovementType),
        nullable=False,
    )
    payment_method = Column(
        Enum(CashPaymentMethod),
        nullable=False,
    )
    amount = Column(Numeric(12, 2), nullable=False)  # Siempre positivo
    description = Column(String(255), nullable=False)

    # Solo para movimientos automáticos
    voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id"),
        nullable=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    # Relaciones
    cash_register = relationship("CashRegister", back_populates="movements")
    voucher = relationship("Voucher")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<CashMovement {self.type} {self.payment_method} ${self.amount}>"
