"""
Schemas para sincronización de precio desde lote.
"""
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


class SyncPriceFromLotRequest(BaseSchema):
    """Request para sincronizar precio de producto desde un lote."""

    lot_id: UUID = Field(..., description="ID del lote de referencia")
    reference_price: Decimal | None = Field(
        None, ge=0, description="Precio de referencia (usa cost_price del lote si no se envía)"
    )
    confirm: bool = Field(
        False, description="Si es True, persiste el cambio; si es False, solo preview"
    )


class SyncPriceFromLotResponse(BaseSchema):
    """Respuesta de la sincronización de precio desde lote."""

    lot_id: UUID
    reference_price: Decimal
    preview_list_price: Decimal
    preview_net_price: Decimal
    preview_sale_price: Decimal
    confirmed: bool = False
    price_history_id: UUID | None = None
    message: str
