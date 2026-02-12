"""
Modelo de relación entre Proveedores y Categorías.
Permite que un proveedor esté asociado con múltiples categorías (familias).
"""
from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base

# Tabla de asociación many-to-many entre Supplier y Category
supplier_category = Table(
    "supplier_categories",
    Base.metadata,
    Column(
        "supplier_id",
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
