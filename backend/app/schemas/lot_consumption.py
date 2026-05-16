"""
Schemas para Consumo de Lotes (LotConsumption).
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.schemas.base import BaseResponse


class LotConsumptionResponse(BaseResponse):
    """Respuesta de un consumo de lote."""

    voucher_item_id: UUID
    lot_id: UUID
    quantity_taken: int

    # Campos del lote (opcional, para vistas enrichidas)
    lot_code: str | None = None
    lot_expiration_date: datetime | None = None
    lot_cost_price: Decimal | None = None
