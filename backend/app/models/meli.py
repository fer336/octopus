"""
Modelos para la integración con Mercado Libre.
Gestiona credenciales OAuth, publicaciones, cola de sincronización y órdenes.
"""

import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class MeliCredentialStatus(str, enum.Enum):
    CONNECTED = "connected"
    REVOKED = "revoked"
    ERROR = "error"


class MeliSyncKind(str, enum.Enum):
    UPDATE_STOCK = "update_stock"
    UPDATE_PRICE = "update_price"
    PAUSE = "pause"
    ACTIVATE = "activate"
    PROCESS_ORDER = "process_order"


class MeliSyncStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class MeliCredentials(BaseModel):
    """Tokens OAuth de Mercado Libre por negocio. Un registro por business."""

    __tablename__ = "meli_credentials"
    __table_args__ = (
        UniqueConstraint("business_id", name="uq_meli_credentials_business"),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    meli_user_id = Column(BigInteger, nullable=False)
    meli_nickname = Column(String(100), nullable=True)
    access_token_enc = Column(Text, nullable=False)
    refresh_token_enc = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    scopes = Column(String(500), nullable=True)
    status: MeliCredentialStatus = Column(  # type: ignore[assignment]
        Enum(MeliCredentialStatus),
        nullable=False,
        default=MeliCredentialStatus.CONNECTED,
    )

    business = relationship("Business")


class MeliListing(BaseModel):
    """Mapeo entre un producto local y una publicación en Mercado Libre."""

    __tablename__ = "meli_listings"
    __table_args__ = (
        UniqueConstraint(
            "business_id",
            "product_id",
            "meli_item_id",
            name="uq_meli_listing_business_product_item",
        ),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )
    meli_item_id = Column(String(30), nullable=False, unique=True)
    meli_permalink = Column(String(500), nullable=True)
    listing_type_id = Column(String(50), nullable=True)
    status = Column(String(30), nullable=False, default="active")
    sync_price = Column(Boolean, nullable=False, default=True)
    sync_stock = Column(Boolean, nullable=False, default=True)
    price_markup_pct = Column(Numeric(6, 2), nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    business = relationship("Business")
    product = relationship("Product")


class MeliSyncQueue(BaseModel):
    """Outbox de sincronización saliente hacia Mercado Libre."""

    __tablename__ = "meli_sync_queue"
    __table_args__ = (
        Index(
            "ix_meli_sync_queue_pending",
            "status",
            postgresql_where="status = 'pending'",
        ),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    listing_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meli_listings.id"),
        nullable=True,
        index=True,
    )
    kind: MeliSyncKind = Column(Enum(MeliSyncKind), nullable=False)  # type: ignore[assignment]
    payload = Column(JSONB, nullable=False, default=dict)
    status: MeliSyncStatus = Column(  # type: ignore[assignment]
        Enum(MeliSyncStatus),
        nullable=False,
        default=MeliSyncStatus.PENDING,
        index=True,
    )
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    listing = relationship("MeliListing")


class MeliOrder(BaseModel):
    """Registro idempotente de órdenes recibidas desde Mercado Libre."""

    __tablename__ = "meli_orders"
    __table_args__ = (
        UniqueConstraint("meli_order_id", name="uq_meli_orders_order_id"),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    meli_order_id = Column(BigInteger, nullable=False, unique=True)
    status = Column(String(50), nullable=True)
    raw = Column(JSONB, nullable=True)
    stock_applied = Column(Boolean, nullable=False, default=False)
