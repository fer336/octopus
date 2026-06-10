"""
Schemas for Price Lists.
"""

from datetime import date
from decimal import Decimal

from pydantic import field_validator

from app.schemas.base import BaseResponse, BaseSchema


class PriceListItemCreate(BaseSchema):
    product_code: str
    unit_price: Decimal


class PriceListItemResponse(BaseResponse):
    product_code: str
    unit_price: Decimal


class PriceListCreate(BaseSchema):
    name: str
    snapshot_date: date
    notes: str | None = None
    items: list[PriceListItemCreate] = []

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class PriceListResponse(BaseResponse):
    """List view — includes item count but not the items themselves."""
    name: str
    snapshot_date: date
    notes: str | None = None
    item_count: int = 0


class PriceListDetailResponse(BaseResponse):
    """Detail view — includes the full item list."""
    name: str
    snapshot_date: date
    notes: str | None = None
    items: list[PriceListItemResponse] = []
