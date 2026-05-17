"""
Schemas para Historial de Precios (PriceHistory).
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.schemas.base import BaseResponse, BaseSchema


class PriceHistoryResponse(BaseResponse):
    """Respuesta de un registro de historial de precio."""

    product_id: UUID
    changed_by: UUID | None = None
    old_list_price: Decimal
    old_net_price: Decimal
    old_sale_price: Decimal
    new_list_price: Decimal
    new_net_price: Decimal
    new_sale_price: Decimal
    change_reason: str | None = None

    # Información del usuario (opcional, para vistas enrichidas)
    changed_by_name: str | None = None


class PriceRestoreRequest(BaseSchema):
    """Solicitud para restaurar un precio desde el historial."""

    reason: str | None = None


class PriceRestoreResponse(BaseSchema):
    """Respuesta después de restaurar un precio."""

    product_id: UUID
    restored_list_price: Decimal
    restored_net_price: Decimal
    restored_sale_price: Decimal
    new_history_entry_id: UUID
    message: str
