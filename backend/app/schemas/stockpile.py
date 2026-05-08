"""
Schemas de Acopio (Stockpile).
"""
from decimal import Decimal
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────
# Schemas de creación
# ──────────────────────────────────────────────────────────


class StockpileItemCreate(BaseModel):
    """Ítem para crear un acopio."""

    product_id: UUID
    quantity: Decimal = Field(..., gt=0, description="Cantidad pagada")


class StockpileCreate(BaseModel):
    """Schema para crear un nuevo acopio."""

    client_id: UUID = Field(..., description="Cliente que paga el acopio")
    billing_client_id: UUID | None = Field(
        None, description="Cliente receptor de la factura (opcional)"
    )
    name: str = Field(..., min_length=1, max_length=255, description="Nombre/Obra")
    currency: str = Field("ARS", description="Moneda: ARS, USD")
    exchange_rate: Decimal | None = Field(
        None, description="Cotización del dólar al momento de crear (si currency=USD)"
    )
    items: list[StockpileItemCreate] = Field(
        ..., min_length=1, description="Productos del acopio"
    )
    # Expiración (opcional)
    expiration_mode: str | None = Field(
        None, description="none o due_date"
    )
    due_date: date | None = Field(
        None, description="Fecha de vencimiento si expiration_mode=due_date"
    )
    # Voucher padre si este acopio nace de un remito parcial
    principal_voucher_id: UUID | None = Field(
        None, description="ID del voucher del que nace este acopio"
    )
    # Notas
    notes: str | None = Field(None, description="Notas del acopio")


class StockpileCreateByAmount(BaseModel):
    """Schema para crear acopio por importe fijo (sin productos específicos)."""

    client_id: UUID = Field(..., description="Cliente que paga el acopio")
    billing_client_id: UUID | None = Field(
        None, description="Cliente receptor de la factura (opcional)"
    )
    name: str = Field(..., min_length=1, max_length=255, description="Nombre/Obra")
    # Descripción editable (para indicar obra específica, trabajo, etc.)
    description: str | None = Field(
        None, max_length=500, description="Descripción detallada del acopio"
    )
    currency: str = Field("ARS", description="Moneda: ARS, USD")
    exchange_rate: Decimal | None = Field(
        None, description="Cotización del dólar al momento de crear (si currency=USD)"
    )
    amount: Decimal = Field(..., gt=0, description="Monto del acopio")
    # Porcentaje de descuento aplicable en retiros (calculado del monto)
    discount_percent: Decimal = Field(
        ..., ge=0, le=100, description="Porcentaje de descuento por acopio"
    )
    # Expiración (opcional)
    expiration_mode: str | None = Field(
        None, description="none o due_date"
    )
    due_date: date | None = Field(
        None, description="Fecha de vencimiento si expiration_mode=due_date"
    )
    # Voucher padre si este acopio nace de un remito parcial
    principal_voucher_id: UUID | None = Field(
        None, description="ID del voucher del que nace este acopio"
    )


class StockpileItemWithdraw(BaseModel):
    """Ítem para retirar del acopio."""

    product_id: UUID
    quantity: Decimal = Field(..., gt=0, description="Cantidad a retirer")


class StockpileWithdrawCreate(BaseModel):
    """Schema para retirar productos del acopio."""

    items: list[StockpileItemWithdraw] = Field(
        ..., min_length=1, description="Productos a retirer"
    )


class StockpileUpdate(BaseModel):
    """Schema para actualizar un acopio."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500, description="Descripción del acopio")
    notes: str | None = None
    status: str | None = None
    expiration_mode: str | None = Field(None, description="none o due_date")
    due_date: date | None = Field(None, description="Fecha de vencimiento")


# ──────────────────────────────────────────────────────────
# Schemas de respuesta
# ──────────────────────────────────────────────────────────


class StockpileItemResponse(BaseModel):
    """Response de un ítem del acopio."""

    id: UUID
    product_id: UUID | None
    product_code: str
    product_description: str
    quantity_initial: Decimal
    quantity_withdrawn: Decimal
    quantity_remaining: Decimal
    currency: str
    frozen_unit_price: Decimal
    frozen_iva_rate: Decimal
    frozen_iva_amount: Decimal
    frozen_subtotal: Decimal
    frozen_total: Decimal

    model_config = {"from_attributes": True}


class StockpileResponse(BaseModel):
    """Response de un acopio."""

    id: UUID
    business_id: UUID
    client_id: UUID
    client_name: str
    billing_client_id: UUID | None
    billing_client_name: str | None
    created_by: UUID | None
    created_by_name: str | None
    name: str
    stockpile_number: str | None  # Número de acopio (ACOPIO-0001)
    description: str | None  # Descripción editable
    status: str
    currency: str
    exchange_rate: Decimal | None
    discount_percent: Decimal | None
    initial_amount: Decimal
    withdrawn_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime
    completed_at: datetime | None
    # Expiración
    expiration_mode: str
    due_date: date | None
    # Voucher padre
    principal_voucher_id: UUID | None
    principal_voucher_number: str | None
    # Notas
    notes: str | None
    items: list[StockpileItemResponse]

    model_config = {"from_attributes": True}


class StockpileListItem(BaseModel):
    """Item simplificado para listados."""

    id: UUID
    client_name: str
    billing_client_name: str | None
    name: str
    stockpile_number: str | None
    description: str | None
    status: str
    initial_amount: Decimal
    withdrawn_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class StockpileListResponse(BaseModel):
    """Response paginado de acopios."""

    items: list[StockpileListItem]
    total: int
    page: int
    per_page: int


# ──────────────────────────────────────────────────────────
# Schemas para Remito UI
# ──────────────────────────────────────────────────────────


class StockpileOpenItem(BaseModel):
    """Item simplificado para listados de acopios abiertos."""

    id: UUID
    name: str
    status: str
    created_at: datetime
    expiration_mode: str
    due_date: date | None
    principal_voucher_id: UUID | None
    principal_voucher_number: str | None
    initial_amount: Decimal
    withdrawn_amount: Decimal
    remaining_amount: Decimal
    currency: str
    discount_percent: Decimal | None

    model_config = {"from_attributes": True}


class StockpileOpenResponse(BaseModel):
    """Response de listados de acopios abiertos por cliente."""

    items: list[StockpileOpenItem]
    total: int


class StockpileSummaryItem(BaseModel):
    """Ítem simplificado para summary."""

    stockpile_item_id: UUID
    product_id: UUID | None
    product_code: str
    product_description: str
    quantity_initial: Decimal
    quantity_withdrawn: Decimal
    quantity_remaining: Decimal
    frozen_unit_price: Decimal
    frozen_iva_rate: Decimal
    frozen_iva_amount: Decimal
    frozen_subtotal: Decimal
    frozen_total: Decimal
    currency: str

    model_config = {"from_attributes": True}


class StockpileSummary(BaseModel):
    """Summary de un acopio para Remito UI."""

    stockpile_id: UUID
    name: str
    status: str
    created_at: datetime
    snapshot_date: datetime
    prices_valid_at: datetime
    initial_amount: Decimal
    withdrawn_amount: Decimal
    remaining_amount: Decimal
    child_remitos_count: int
    # Principal voucher info
    principal_voucher_id: UUID | None
    principal_voucher_number: str | None
    # Items congelados
    items: list[StockpileSummaryItem]

    model_config = {"from_attributes": True}


class ValidateWithdrawalRequest(BaseModel):
    """Request para validar retiro."""

    withdrawal_amount: Decimal = Field(
        ..., gt=0, description="Monto a retirar"
    )


class ValidateWithdrawalResponse(BaseModel):
    """Response de validación de retiro."""

    allowed: bool
    withdrawal_amount: Decimal
    remaining_amount: Decimal
    exceeded_amount: Decimal | None
    message: str

    model_config = {"from_attributes": True}


class StockpileTreeChildVoucher(BaseModel):
    """Remito parcial hijo dentro del árbol de acopios."""

    id: UUID
    number: str
    date: date
    total: Decimal
    status: str


class StockpileTreeItem(BaseModel):
    """Nodo principal del árbol de acopios."""

    id: UUID
    name: str
    stockpile_number: str | None
    description: str | None
    client_name: str
    status: str
    created_at: datetime
    principal_voucher_id: UUID | None
    principal_voucher_number: str | None
    initial_amount: Decimal
    withdrawn_amount: Decimal
    remaining_amount: Decimal
    child_vouchers: list[StockpileTreeChildVoucher]


class StockpileTreeResponse(BaseModel):
    """Response del árbol acopio → remitos parciales."""

    items: list[StockpileTreeItem]
    total: int
