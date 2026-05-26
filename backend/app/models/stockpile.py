"""
Modelo de Acopio (Stockpile).
Pago anticipado con retiro escalonado de productos a precios congelados.
"""
from decimal import Decimal
from datetime import date as date_type, datetime

from sqlalchemy import Column, DateTime, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class StockpileExpirationMode(str):
    """Modos de expiración del acopio."""

    NONE = "none"  # Sin vencimiento
    DUE_DATE = "due_date"  # Fecha de vencimiento


class StockpileStatus(str):
    """Estados de un acopio."""

    OPEN = "open"  # Abierto, tiene saldo disponible
    PARTIAL = "partial"  # Con retiros parciales, saldo pendiente
    COMPLETED = "completed"  # Agotado
    CANCELLED = "cancelled"  # Anulado
    ARCHIVED = "archived"  # Archivado (fuera del árbol activo)


class Stockpile(BaseModel):
    """
    Acopio: pago anticipado de productos con precios congelados.
    El cliente paga por adelantado y retira en múltiples entregas.
    """

    __tablename__ = "stockpiles"

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
    billing_client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=True,
        index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # Nombre/Obra
    name = Column(String(255), nullable=False)

    # Número de acopio (generado automáticamente: AC-0001)
    stockpile_number = Column(String(20), nullable=True, index=True)

    # Descripción editable (para acopios por monto, puede indicar obra/especificación)
    description = Column(String(500), nullable=True)

    # Estado
    status = Column(String(20), default=StockpileStatus.OPEN, nullable=False)

    # Moneda
    currency = Column(String(10), default="ARS", nullable=False)  # ARS, USD
    exchange_rate = Column(
        Numeric(12, 2), nullable=True
    )  # Cotización del día (dólar blue) al crear
    discount_percent = Column(
        Numeric(5, 2), nullable=True
    )  # Porcentaje de descuento aplicable en retiros

    # Montos
    initial_amount = Column(Numeric(12, 2), default=0, nullable=False)  # Total pagado
    withdrawn_amount = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Ya retirado
    remaining_amount = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Saldo disponible

    # Fechas
    completed_at = Column(DateTime, nullable=True)  # Cerrado cuando se agota

    # Expiración
    expiration_mode = Column(
        String(20), default=StockpileExpirationMode.NONE, nullable=False
    )
    due_date = Column(Date, nullable=True)  # Fecha de vencimiento si expiration_mode=due_date

    # Voucher padre del que nació este acopio (para retiros parciales)
    principal_voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id"),
        nullable=True,
        index=True,
    )

    # Notas
    notes = Column(Text, nullable=True)

    # Relaciones - usar explicit foreign_keys para evitar ambigüedad
    business = relationship("Business", back_populates="stockpiles")
    client = relationship("Client", foreign_keys=[client_id])
    billing_client = relationship("Client", foreign_keys=[billing_client_id])
    created_by_user = relationship("User")
    principal_voucher = relationship(
        "Voucher",
        foreign_keys=[principal_voucher_id],
        back_populates="child_stockpiles",
    )
    child_vouchers = relationship(
        "Voucher",
        back_populates="principal_stockpile",
        foreign_keys="Voucher.stockpile_id",
    )
    items = relationship(
        "StockpileItem",
        back_populates="stockpile",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Stockpile {self.name}: {self.status}>"


class StockpileItem(BaseModel):
    """
    Ítem de un acopio.
    Contiene snapshot de precios al momento de crear el acopio.
    """

    __tablename__ = "stockpile_items"

    stockpile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stockpiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=True,
    )

    # Cantidades
    quantity_initial = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Cantidad total pagada
    quantity_withdrawn = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Ya retirada
    quantity_remaining = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Saldo en unidades

    # Moneda (debe coincidir con el acopio)
    currency = Column(String(10), default="ARS", nullable=False)

    # Snapshot de precios al momento de crear el acopio (sin IVA)
    frozen_unit_price = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Precio unitario sin IVA
    frozen_iva_rate = Column(
        Numeric(5, 2), default=21, nullable=False
    )  # 21%, 10.5%, etc.
    frozen_iva_amount = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # IVA unitario
    frozen_subtotal = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Subtotal unitario (sin IVA)
    frozen_total = Column(
        Numeric(12, 2), default=0, nullable=False
    )  # Total unitario con IVA

    # Snapshot de metadata del producto
    product_code = Column(String(50), nullable=False)
    product_description = Column(String(500), nullable=False)

    # Relaciones
    stockpile = relationship("Stockpile", back_populates="items")
    product = relationship("Product")

    def __repr__(self) -> str:
        return f"<StockpileItem {self.product_code}: {self.quantity_remaining}/{self.quantity_initial}>"


class StockpilePriceSnapshot(BaseModel):
    """
    Snapshot de precios de productos activos al momento de crear un acopio por monto.

    Se genera en create_by_amount() para preservar los precios del catálogo
    vigentes al momento de la creación del acopio. Los retiros posteriores
    resuelven precios desde esta tabla.
    """

    __tablename__ = "stockpile_price_snapshots"

    stockpile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("stockpiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )

    # Snapshot de metadata del producto
    code = Column(String(50), nullable=False)
    description = Column(String(500), nullable=False)

    # Snapshot de precios (sin IVA)
    price_without_iva = Column(Numeric(12, 2), nullable=False)
    iva_rate = Column(Numeric(5, 2), nullable=False)
    iva_amount = Column(Numeric(12, 2), nullable=False)
    price_with_iva = Column(Numeric(12, 2), nullable=False)

    # Fecha de congelamiento (cuándo se tomó el snapshot)
    frozen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relaciones
    stockpile = relationship("Stockpile")
    product = relationship("Product")

    def __repr__(self) -> str:
        return f"<StockpilePriceSnapshot {self.code}: ${self.price_with_iva}>"
