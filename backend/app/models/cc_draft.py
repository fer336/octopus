"""
CC Draft model.
Stores an in-progress current-account closure draft per titular (client).
"""

from sqlalchemy import Column, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID

from app.models.base import BaseModel


class CCDraft(BaseModel):
    """Draft state for a current-account closure, keyed by (business_id, titular_id)."""

    __tablename__ = "cc_drafts"

    __table_args__ = (
        UniqueConstraint("business_id", "titular_id", name="uq_cc_drafts_business_titular"),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    titular_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    closure_notes = Column(Text, nullable=True)
    special_list_items = Column(JSON, nullable=True)       # list[str]
    selected_receipt_ids = Column(JSON, nullable=True)     # list[str]
    item_overrides = Column(JSON, nullable=True)           # dict[itemId, {quantity, unit_price, discount_percent}]
    applied_price_lists = Column(JSON, nullable=True)      # dict[voucherId, {list_id, list_name, item_prices}]

    def __repr__(self) -> str:
        return f"<CCDraft business={self.business_id} titular={self.titular_id}>"
