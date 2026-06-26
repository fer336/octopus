"""
Price List model.
Stores a named snapshot of product prices at a given date.
B2B extension: currency, status, targeting, versioning, send logs.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PriceList(BaseModel):
    """A named price list capturing product prices at a specific date."""

    __tablename__ = "price_lists"

    __table_args__ = (
        Index("ix_price_lists_business_status", "business_id", "status"),
        CheckConstraint(
            "client_type_id IS NULL OR client_id IS NULL",
            name="ck_price_list_target_exclusive",
        ),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)

    # B2B metadata
    description = Column(Text, nullable=True)
    currency = Column(String(10), nullable=False, server_default="ARS")
    includes_tax = Column(Boolean, nullable=False, server_default="true")
    valid_from = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, server_default="draft")
    terms_and_conditions = Column(Text, nullable=True)
    version = Column(Integer, nullable=False, server_default="1")

    # Version chain
    previous_version_id = Column(
        UUID(as_uuid=True), ForeignKey("price_lists.id"), nullable=True
    )
    created_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Wholesale / type discriminator
    list_type = Column(String(20), nullable=False, server_default="snapshot")
    column_config = Column(JSON, nullable=True)
    payment_conditions = Column(JSON, nullable=True)

    # B2B targeting (mutually exclusive via CheckConstraint above)
    client_type_id = Column(
        UUID(as_uuid=True), ForeignKey("client_types.id"), nullable=True, index=True
    )
    client_id = Column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True, index=True
    )

    # Relationships
    items = relationship(
        "PriceListItem",
        back_populates="price_list",
        cascade="all, delete-orphan",
        lazy="select",
    )
    send_logs = relationship(
        "PriceListSendLog",
        back_populates="price_list",
        cascade="all, delete-orphan",
        lazy="select",
    )
    previous_version = relationship(
        "PriceList",
        primaryjoin="PriceList.previous_version_id == PriceList.id",
        foreign_keys="[PriceList.previous_version_id]",
        uselist=False,
    )

    def __repr__(self) -> str:
        return f"<PriceList {self.name} ({self.snapshot_date})>"


class PriceListItem(BaseModel):
    """A single product entry within a price list."""

    __tablename__ = "price_list_items"

    __table_args__ = (
        UniqueConstraint(
            "price_list_id", "product_code", name="uq_price_list_items_list_code"
        ),
        Index("ix_price_list_items_product_id", "product_id"),
    )

    price_list_id = Column(
        UUID(as_uuid=True),
        ForeignKey("price_lists.id"),
        nullable=False,
        index=True,
    )
    product_code = Column(String(50), nullable=False, index=True)
    unit_price = Column(Numeric(15, 4), nullable=False)

    # Product reference (nullable for backward compat)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)

    # Snapshot fields
    description = Column(String(500), nullable=True)
    supplier_code = Column(String(50), nullable=True)
    brand_name = Column(String(100), nullable=True)
    category_name = Column(String(120), nullable=True)
    unit = Column(String(20), nullable=True)
    quantity_per_package = Column(Numeric(12, 2), nullable=True)
    iva_rate = Column(Numeric(5, 2), nullable=True)

    # Pricing
    base_price = Column(Numeric(12, 2), nullable=True)
    discount_percent = Column(Numeric(7, 2), nullable=False, server_default="0")
    surcharge_percent = Column(Numeric(7, 2), nullable=False, server_default="0")
    net_price = Column(Numeric(12, 2), nullable=True)
    tax_percent = Column(Numeric(5, 2), nullable=True)
    final_price = Column(Numeric(12, 2), nullable=True)

    # Pack / quantity tiers
    min_quantity = Column(Numeric(12, 2), nullable=True)
    pack_quantity = Column(Numeric(12, 2), nullable=True)

    # Notes
    item_notes = Column(Text, nullable=True)

    # Relationships
    price_list = relationship("PriceList", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id], lazy="select")

    def __repr__(self) -> str:
        return f"<PriceListItem {self.product_code} @ {self.unit_price}>"


class PriceListSendLog(BaseModel):
    """Audit log for price list sends via any channel."""

    __tablename__ = "price_list_send_logs"

    price_list_id = Column(
        UUID(as_uuid=True), ForeignKey("price_lists.id"), nullable=False, index=True
    )
    client_id = Column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True, index=True
    )
    channel = Column(String(20), nullable=False)  # manual, whatsapp, email, link, pdf_export, excel_export
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    sent_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    file_url = Column(String(500), nullable=True)
    log_status = Column(String(30), nullable=False, server_default="recorded")
    message_preview = Column(Text, nullable=True)

    price_list = relationship("PriceList", back_populates="send_logs")

    def __repr__(self) -> str:
        return f"<PriceListSendLog {self.channel} @ {self.sent_at}>"
