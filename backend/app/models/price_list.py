"""
Price List model.
Stores a named snapshot of product prices at a given date.
"""

from sqlalchemy import Column, Date, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PriceList(BaseModel):
    """A named price list capturing product prices at a specific date."""

    __tablename__ = "price_lists"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)

    # Relationships
    items = relationship(
        "PriceListItem",
        back_populates="price_list",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<PriceList {self.name} ({self.snapshot_date})>"


class PriceListItem(BaseModel):
    """A single product entry within a price list."""

    __tablename__ = "price_list_items"

    __table_args__ = (
        UniqueConstraint("price_list_id", "product_code", name="uq_price_list_items_list_code"),
    )

    price_list_id = Column(
        UUID(as_uuid=True),
        ForeignKey("price_lists.id"),
        nullable=False,
        index=True,
    )
    product_code = Column(String(50), nullable=False, index=True)
    unit_price = Column(Numeric(15, 4), nullable=False)

    # Relationships
    price_list = relationship("PriceList", back_populates="items")

    def __repr__(self) -> str:
        return f"<PriceListItem {self.product_code} @ {self.unit_price}>"
