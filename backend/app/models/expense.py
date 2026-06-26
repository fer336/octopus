"""
Modelos de Gastos.
Representa categorías de gastos y gastos del negocio.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class ExpenseCategory(BaseModel):
    """Categoría de gasto del negocio."""

    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    business: Mapped["Business"] = relationship(
        "Business", back_populates="expense_categories"
    )

    # Relaciones
    expenses: Mapped[list["Expense"]] = relationship(
        "Expense", back_populates="category", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ExpenseCategory {self.name}>"


class Expense(BaseModel):
    """Gasto registrado del negocio."""

    __tablename__ = "expenses"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    business: Mapped["Business"] = relationship(  # noqa: F821
        "Business", back_populates="expenses"
    )

    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("expense_categories.id"),
        nullable=False,
        index=True,
    )
    category: Mapped["ExpenseCategory"] = relationship(
        "ExpenseCategory", back_populates="expenses"
    )

    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # cash/transfer/check/credit_card/debit_card/mercadopago/other
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    creator: Mapped["User"] = relationship("User")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Expense {self.description[:30]}: ${self.amount}>"
