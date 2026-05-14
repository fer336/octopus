"""
Modelo de Lote de Producto (Product Lot).
Representa una entrada de stock con seguimiento por lote, incluyendo
cantidad, fecha de vencimiento, precio de costo y fecha de recepción.
"""

from datetime import date, datetime

from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class ProductLot(BaseModel):
    """
    Lote de producto: representa una entrada de stock con trazabilidad.
    Cada lote tiene cantidad, fecha de recepción y opcionalmente
    fecha de vencimiento, código propio y precio de costo.
    """

    __tablename__ = "product_lots"

    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )
    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )

    # Identificación del lote
    code = Column(String(50), nullable=True)  # Código interno del lote

    # Cantidades
    quantity = Column(Integer, default=0, nullable=False)  # Stock actual del lote
    initial_quantity = Column(
        Integer, nullable=False
    )  # Stock original al crear el lote

    # Fechas
    expiration_date = Column(Date, nullable=True)  # Fecha de vencimiento
    received_date = Column(Date, default=date.today, nullable=False)  # Fecha de ingreso

    # Costo
    cost_price = Column(Numeric(12, 2), nullable=True)  # Precio de costo del lote

    # Relaciones
    product = relationship("Product", back_populates="lots")
    business = relationship("Business", back_populates="product_lots")

    def __repr__(self) -> str:
        return (
            f"<ProductLot {self.code or 'N/A'}: "
            f"product={self.product_id}, qty={self.quantity}>"
        )
