"""
Modelo para borradores de actualización masiva de precios.

Permite al usuario guardar el estado intermedio del modal de edición masiva
(lista de productos con cambios pendientes) y retomarlo después.
"""
from sqlalchemy import Column, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import BaseModel


class PriceUpdateDraft(BaseModel):
    """
    Borrador de actualización masiva de precios.

    Almacena el estado de una sesión de edición masiva de productos
    para poder retomarlo en otro momento.
    """

    __tablename__ = "price_update_drafts"

    # Negocio al que pertenece
    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Usuario que creó el borrador
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Nombre descriptivo del borrador (ej: "Griferias FV - Febrero 2026")
    name = Column(String(255), nullable=False)

    # Filtros que se usaron para generar la lista
    filter_category_id = Column(UUID(as_uuid=True), nullable=True)
    filter_category_name = Column(String(255), nullable=True)
    filter_supplier_id = Column(UUID(as_uuid=True), nullable=True)
    filter_supplier_name = Column(String(255), nullable=True)
    filter_search = Column(String(255), nullable=True)

    # Estado serializado de los productos editados (JSON string)
    # Contiene array de EditableProduct con todos los campos modificados
    products_data = Column(Text, nullable=False)

    # Cantidad de productos en el borrador (para mostrar sin deserializar)
    product_count = Column(String(10), nullable=False, default="0")
