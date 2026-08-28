"""
Modelo de Categoría de productos.
Soporta categorías jerárquicas (padre-hijo).
"""
from sqlalchemy import Column, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Category(BaseModel):
    """
    Categoría de productos con soporte jerárquico.
    Una categoría puede tener subcategorías.
    """

    __tablename__ = "categories"
    __table_args__ = (
        Index(
            "uq_category_name_business",
            "name",
            "business_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    parent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("categories.id"),
        nullable=True,
        index=True,
    )

    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business", back_populates="categories")
    parent = relationship(
        "Category",
        remote_side="Category.id",
        backref="subcategories",
    )
    products = relationship("Product", back_populates="category", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Category {self.name}>"
