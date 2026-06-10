"""
Schemas for CC Drafts (current-account closure drafts).
"""

from datetime import datetime
from uuid import UUID

from app.schemas.base import BaseResponse, BaseSchema


class CCDraftSave(BaseSchema):
    titular_id: UUID
    closure_notes: str | None = None
    special_list_items: list[str] | None = None
    selected_receipt_ids: list[str] | None = None
    item_overrides: dict | None = None
    applied_price_lists: dict | None = None


class CCDraftResponse(BaseResponse):
    titular_id: UUID
    closure_notes: str | None = None
    special_list_items: list[str] | None = None
    selected_receipt_ids: list[str] | None = None
    item_overrides: dict | None = None
    applied_price_lists: dict | None = None
    updated_at: datetime
