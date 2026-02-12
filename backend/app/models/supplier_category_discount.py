"""
Modelo de Descuentos por Categoría de Proveedor.
Permite definir descuentos específicos para cada combinación proveedor-categoría.
"""
from decimal import Decimal

from sqlalchemy import Column, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class SupplierCategoryDiscount(BaseModel):
    """
    Descuentos específicos de un proveedor para una categoría.
    Si existe, tiene prioridad sobre los descuentos generales del proveedor.
    """

    __tablename__ = "supplier_category_discounts"

    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("categories.id"),
        nullable=False,
        index=True,
    )

    # Descuentos en cadena específicos para esta categoría
    discount_1 = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    discount_2 = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    discount_3 = Column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)

    # Relaciones (usar strings para evitar circular imports)
    supplier = relationship("Supplier", back_populates="category_discounts", overlaps="supplier")
    category = relationship("Category")

    def __repr__(self) -> str:
        return f"<SupplierCategoryDiscount supplier={self.supplier_id} category={self.category_id}>"
