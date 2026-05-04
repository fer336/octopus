"""
Modelo de Borrador (Draft) para guardar estados incompletos de ventas.

Los borradores son compartidos entre todos los usuarios del mismo negocio.
Se guardan en la base de datos para persistencia entre sesiones.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.client import Client
    from app.models.user import User


class Draft(Base):
    """
    Borrador guardado de una pantalla de ventas.
    
    Almacena el estado completo del carrito de ventas para poder
    ser recuperado posteriormente por cualquier usuario del negocio.
    """

    __tablename__ = "drafts"

    # UUID como primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Negocio al que pertenece el borrador
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Usuario que creó el borrador (nullable por si se elimina)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Cliente asociado al borrador
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Cache del nombre del cliente para mostrar en el listado
    client_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Tipo de voucher que se estaba creando
    voucher_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="quotation, receipt, current_account, invoice",
    )

    # Cliente operativo (solo para cuenta corriente)
    operating_client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Items del borrador en formato JSON
    items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Array de items: {product_id, code, description, net_price, sale_price, quantity, discount}",
    )

    # Descuento general aplicado
    general_discount: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=0,
        comment="Porcentaje de descuento general (0-100)",
    )

    # Si el voucher muestra precios o no
    show_prices: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Cantidad de items en el borrador
    item_count: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relaciones
    business: Mapped["Business"] = relationship(
        "Business",
        back_populates="drafts",
    )

    user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="drafts",
    )

    client: Mapped[Optional["Client"]] = relationship(
        "Client",
        foreign_keys=[client_id],
    )

    operating_client: Mapped[Optional["Client"]] = relationship(
        "Client",
        foreign_keys=[operating_client_id],
    )

    def __repr__(self) -> str:
        return f"<Draft(id={self.id}, voucher_type={self.voucher_type}, client={self.client_name})>"
