"""
Modelo de Ítem de Comprobante.
Representa cada línea/producto de un comprobante.
"""
from sqlalchemy import Column, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class VoucherItem(BaseModel):
    """
    Ítem de un comprobante.
    Contiene snapshot del producto al momento de la venta.
    """

    __tablename__ = "voucher_items"

    voucher_id = Column(
        UUID(as_uuid=True),
        ForeignKey("vouchers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
    )

    # Snapshot del producto al momento de la venta
    code = Column(String(50), nullable=False)
    description = Column(String(500), nullable=False)

    # Cantidades y precios
    quantity = Column(Numeric(12, 2), nullable=False)
    unit = Column(String(20), default="unidad", nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)  # Precio unitario sin IVA

    # Descuento adicional por línea
    discount_percent = Column(Numeric(5, 2), default=0, nullable=False)

    # IVA
    iva_rate = Column(Numeric(5, 2), nullable=False)
    iva_amount = Column(Numeric(12, 2), nullable=False)

    # Totales de la línea
    subtotal = Column(Numeric(12, 2), nullable=False)  # Precio × Cantidad - Descuento
    total = Column(Numeric(12, 2), nullable=False)  # Subtotal + IVA

    # Orden en el comprobante
    line_number = Column(Integer, default=1, nullable=False)

    # Relaciones
    voucher = relationship("Voucher", back_populates="items")
    product = relationship("Product")

    def __repr__(self) -> str:
        return f"<VoucherItem {self.code}: {self.quantity} x {self.unit_price}>"
