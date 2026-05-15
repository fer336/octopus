"""
Modelo de Consumo de Lote (Lot Consumption).
Registra qué lotes se consumieron en cada ítem de comprobante,
persistiendo la trazabilidad FIFO post-transacción.
"""

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class LotConsumption(BaseModel):
    """
    Consumo de lote: representa una unidad de consumo FIFO
    de un lote específico para un ítem de comprobante.

    Cada fila vincula un VoucherItem con un ProductLot y la cantidad
    tomada de ese lote. Un VoucherItem puede tener múltiples rows
    (uno por lote consumido). La FK a VoucherItem tiene CASCADE
    para que al eliminar el ítem se eliminen los consumos automáticamente.
    """

    __tablename__ = "lot_consumptions"

    voucher_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("voucher_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("product_lots.id"),
        nullable=False,
    )
    quantity_taken = Column(Integer, nullable=False)

    # Relaciones
    voucher_item = relationship("VoucherItem", back_populates="lot_consumptions")
    lot = relationship("ProductLot")

    def __repr__(self) -> str:
        return (
            f"<LotConsumption item={self.voucher_item_id}: "
            f"lot={self.lot_id}, taken={self.quantity_taken}>"
        )
