"""
Schemas for Price Lists — B2B extension.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import field_validator, model_validator

from app.schemas.base import BaseResponse, BaseSchema

PriceListStatus = Literal["draft", "active", "expired", "archived"]
PriceListType = Literal["snapshot", "wholesale"]


class PaymentCondition(BaseSchema):
    label: str
    surcharge_pct: float = 0.0


# ---------------------------------------------------------------------------
# Item schemas
# ---------------------------------------------------------------------------


class PriceListItemCreate(BaseSchema):
    product_code: str
    unit_price: Decimal
    product_id: UUID | None = None
    discount_percent: Decimal = Decimal("0")
    surcharge_percent: Decimal = Decimal("0")
    min_quantity: Decimal | None = None
    pack_quantity: Decimal | None = None
    item_notes: str | None = None


class PriceListItemUpdate(BaseSchema):
    discount_percent: Decimal | None = None
    surcharge_percent: Decimal | None = None
    min_quantity: Decimal | None = None
    pack_quantity: Decimal | None = None
    item_notes: str | None = None


class PriceListItemResponse(BaseResponse):
    product_code: str
    unit_price: Decimal
    product_id: UUID | None = None
    description: str | None = None
    supplier_code: str | None = None
    brand_name: str | None = None
    category_name: str | None = None
    unit: str | None = None
    quantity_per_package: Decimal | None = None
    iva_rate: Decimal | None = None
    base_price: Decimal | None = None
    discount_percent: Decimal = Decimal("0")
    surcharge_percent: Decimal = Decimal("0")
    net_price: Decimal | None = None
    tax_percent: Decimal | None = None
    final_price: Decimal | None = None
    min_quantity: Decimal | None = None
    pack_quantity: Decimal | None = None
    item_notes: str | None = None


# ---------------------------------------------------------------------------
# Price list schemas
# ---------------------------------------------------------------------------


class PriceListCreate(BaseSchema):
    name: str
    snapshot_date: date
    notes: str | None = None
    items: list[PriceListItemCreate] = []

    # B2B fields
    description: str | None = None
    currency: str = "ARS"
    includes_tax: bool = True
    valid_from: date | None = None
    valid_until: date | None = None
    status: PriceListStatus = "draft"
    terms_and_conditions: str | None = None
    client_type_id: UUID | None = None
    client_id: UUID | None = None

    # Wholesale fields
    list_type: PriceListType = "snapshot"
    column_config: dict[str, Any] | None = None
    payment_conditions: list[PaymentCondition] | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v

    @model_validator(mode="after")
    def check_target_exclusion(self) -> PriceListCreate:
        if self.client_type_id is not None and self.client_id is not None:
            raise ValueError("cannot set both client_type_id and client_id")
        return self


class PriceListUpdate(BaseSchema):
    name: str | None = None
    snapshot_date: date | None = None
    notes: str | None = None
    description: str | None = None
    currency: str | None = None
    includes_tax: bool | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    status: PriceListStatus | None = None
    terms_and_conditions: str | None = None
    client_type_id: UUID | None = None
    client_id: UUID | None = None
    column_config: dict[str, Any] | None = None
    payment_conditions: list[PaymentCondition] | None = None

    @model_validator(mode="after")
    def check_target_exclusion(self) -> PriceListUpdate:
        if self.client_type_id is not None and self.client_id is not None:
            raise ValueError("cannot set both client_type_id and client_id")
        return self


class PriceListResponse(BaseResponse):
    """List view — includes item count but not the items themselves."""

    name: str
    snapshot_date: date
    notes: str | None = None
    item_count: int = 0

    # B2B fields
    description: str | None = None
    currency: str = "ARS"
    includes_tax: bool = True
    valid_from: date | None = None
    valid_until: date | None = None
    status: str = "draft"
    version: int = 1
    client_type_id: UUID | None = None
    client_id: UUID | None = None

    # Wholesale fields
    list_type: str = "snapshot"
    column_config: dict[str, Any] | None = None
    payment_conditions: list[dict[str, Any]] | None = None


class PriceListDetailResponse(BaseResponse):
    """Detail view — includes the full item list."""

    name: str
    snapshot_date: date
    notes: str | None = None
    items: list[PriceListItemResponse] = []

    # B2B fields
    description: str | None = None
    currency: str = "ARS"
    includes_tax: bool = True
    valid_from: date | None = None
    valid_until: date | None = None
    status: str = "draft"
    version: int = 1
    client_type_id: UUID | None = None
    client_id: UUID | None = None

    # Wholesale fields
    list_type: str = "snapshot"
    column_config: dict[str, Any] | None = None
    payment_conditions: list[dict[str, Any]] | None = None


# ---------------------------------------------------------------------------
# Bulk / action schemas
# ---------------------------------------------------------------------------


class AddProductsToPriceListRequest(BaseSchema):
    product_ids: list[UUID]
    default_discount_percent: Decimal = Decimal("0")


class BulkAdjustPriceListRequest(BaseSchema):
    percent: Decimal
    category_id: UUID | None = None
    brand_id: UUID | None = None
    supplier_id: UUID | None = None


class DuplicatePriceListRequest(BaseSchema):
    name: str
    valid_from: date | None = None
    valid_until: date | None = None


# ---------------------------------------------------------------------------
# Send log schemas
# ---------------------------------------------------------------------------


class PriceListSendLogCreate(BaseSchema):
    client_id: UUID | None = None
    channel: str
    message_preview: str | None = None
    file_url: str | None = None


class PriceListSendLogResponse(BaseResponse):
    price_list_id: UUID
    client_id: UUID | None = None
    channel: str
    sent_at: datetime
    sent_by_user_id: UUID | None = None
    file_url: str | None = None
    log_status: str
    message_preview: str | None = None
