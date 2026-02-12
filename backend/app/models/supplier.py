"""
Modelo de Proveedor.
Almacena información de proveedores y condiciones comerciales.
"""
from sqlalchemy import Column, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel
from app.models.supplier_category import supplier_category


class Supplier(BaseModel):
    """
    Proveedor del negocio.
    Incluye bonificaciones habituales.
    """

    __tablename__ = "suppliers"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )

    # Datos del proveedor
    name = Column(String(255), nullable=False, index=True)
    cuit = Column(String(13), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(100), nullable=True)
    contact_name = Column(String(255), nullable=True)  # Nombre del contacto
    notes = Column(Text, nullable=True)  # Condiciones comerciales, observaciones

    # Bonificaciones habituales del proveedor
    default_discount_1 = Column(Numeric(5, 2), default=0, nullable=False)
    default_discount_2 = Column(Numeric(5, 2), default=0, nullable=False)
    default_discount_3 = Column(Numeric(5, 2), default=0, nullable=False)

    # Relaciones
    business = relationship("Business", back_populates="suppliers")
    products = relationship("Product", back_populates="supplier", lazy="dynamic")
    categories = relationship(
        "Category",
        secondary=supplier_category,
        backref="suppliers",
    )

    def __repr__(self) -> str:
        return f"<Supplier {self.name}>"
