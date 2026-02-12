"""
Modelo de Historial de Precios.
Registra todos los cambios de precio de los productos.
"""
from sqlalchemy import Column, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PriceHistory(BaseModel):
    """
    Historial de cambios de precio de un producto.
    Se crea automáticamente al actualizar precios.
    """

    __tablename__ = "price_history"

    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )
    changed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # Precios anteriores
    old_list_price = Column(Numeric(12, 2), nullable=False)
    old_net_price = Column(Numeric(12, 2), nullable=False)
    old_sale_price = Column(Numeric(12, 2), nullable=False)

    # Precios nuevos
    new_list_price = Column(Numeric(12, 2), nullable=False)
    new_net_price = Column(Numeric(12, 2), nullable=False)
    new_sale_price = Column(Numeric(12, 2), nullable=False)

    # Razón del cambio
    change_reason = Column(String(255), nullable=True)  # Manual, Excel import, etc.
    import_file = Column(String(255), nullable=True)  # Nombre del archivo si fue importación

    # Relaciones
    product = relationship("Product", back_populates="price_history")

    def __repr__(self) -> str:
        return f"<PriceHistory {self.product_id}: {self.old_sale_price} -> {self.new_sale_price}>"
