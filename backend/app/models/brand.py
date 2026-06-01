"""Modelo de Marca de productos."""

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Brand(BaseModel):
    """Marca normalizada dentro de un negocio."""

    __tablename__ = "brands"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    name = Column(String(100), nullable=False, index=True)
    normalized_name = Column(String(100), nullable=False, index=True)

    business = relationship("Business", back_populates="brands")
    products = relationship("Product", back_populates="brand_ref", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Brand {self.name}>"
