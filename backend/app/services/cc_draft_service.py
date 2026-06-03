"""
Service for CC Drafts (current-account closure drafts).
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cc_draft import CCDraft
from app.schemas.cc_draft import CCDraftSave


class CCDraftService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_titular(self, titular_id: UUID, business_id: UUID) -> CCDraft | None:
        """Return the draft for a given titular, or None if not found."""
        result = await self.db.execute(
            select(CCDraft).where(
                CCDraft.titular_id == titular_id,
                CCDraft.business_id == business_id,
                CCDraft.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def upsert(self, data: CCDraftSave, business_id: UUID) -> CCDraft:
        """Create or update a draft for the given titular."""
        draft = await self.get_by_titular(data.titular_id, business_id)

        if draft is None:
            draft = CCDraft(
                business_id=business_id,
                titular_id=data.titular_id,
            )
            self.db.add(draft)

        draft.closure_notes = data.closure_notes
        draft.special_list_items = data.special_list_items
        draft.selected_receipt_ids = data.selected_receipt_ids
        draft.item_overrides = data.item_overrides
        draft.applied_price_lists = data.applied_price_lists
        draft.updated_at = datetime.utcnow()

        await self.db.flush()
        return draft

    async def delete(self, titular_id: UUID, business_id: UUID) -> bool:
        """Soft-delete a draft. Returns False if not found."""
        draft = await self.get_by_titular(titular_id, business_id)
        if not draft:
            return False
        draft.deleted_at = datetime.utcnow()
        await self.db.flush()
        return True
