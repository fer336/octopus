"""add meli integration tables

Revision ID: a7bfac3c55fa
Revises: 674afe90b338
Create Date: 2026-06-11 13:20:12.943000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a7bfac3c55fa"
down_revision: Union[str, Sequence[str], None] = "674afe90b338"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE melicredentialstatus AS ENUM ('CONNECTED', 'REVOKED', 'ERROR')")
    op.execute("CREATE TYPE melisynckind AS ENUM ('UPDATE_STOCK', 'UPDATE_PRICE', 'PAUSE', 'ACTIVATE', 'PROCESS_ORDER')")
    op.execute("CREATE TYPE melisyncstatus AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED')")

    op.execute("""
        CREATE TABLE meli_credentials (
            id          UUID PRIMARY KEY,
            business_id UUID NOT NULL REFERENCES businesses(id),
            meli_user_id BIGINT NOT NULL,
            meli_nickname VARCHAR(100),
            access_token_enc TEXT NOT NULL,
            refresh_token_enc TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            scopes VARCHAR(500),
            status melicredentialstatus NOT NULL DEFAULT 'CONNECTED',
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now(),
            deleted_at TIMESTAMP,
            CONSTRAINT uq_meli_credentials_business UNIQUE (business_id)
        )
    """)
    op.execute("CREATE UNIQUE INDEX ix_meli_credentials_business_id ON meli_credentials (business_id)")

    op.execute("""
        CREATE TABLE meli_listings (
            id             UUID PRIMARY KEY,
            business_id    UUID NOT NULL REFERENCES businesses(id),
            product_id     UUID NOT NULL REFERENCES products(id),
            meli_item_id   VARCHAR(30) NOT NULL,
            meli_permalink VARCHAR(500),
            listing_type_id VARCHAR(50),
            status         VARCHAR(30) NOT NULL DEFAULT 'active',
            sync_price     BOOLEAN NOT NULL DEFAULT true,
            sync_stock     BOOLEAN NOT NULL DEFAULT true,
            price_markup_pct NUMERIC(6,2),
            last_synced_at TIMESTAMPTZ,
            last_sync_error TEXT,
            created_at     TIMESTAMP NOT NULL DEFAULT now(),
            updated_at     TIMESTAMP NOT NULL DEFAULT now(),
            deleted_at     TIMESTAMP,
            CONSTRAINT uq_meli_listing_business_product_item UNIQUE (business_id, product_id, meli_item_id),
            CONSTRAINT uq_meli_listings_item UNIQUE (meli_item_id)
        )
    """)
    op.execute("CREATE INDEX ix_meli_listings_business_id ON meli_listings (business_id)")
    op.execute("CREATE INDEX ix_meli_listings_product_id ON meli_listings (product_id)")

    op.execute("""
        CREATE TABLE meli_sync_queue (
            id          UUID PRIMARY KEY,
            business_id UUID NOT NULL REFERENCES businesses(id),
            listing_id  UUID REFERENCES meli_listings(id),
            kind        melisynckind NOT NULL,
            payload     JSONB NOT NULL DEFAULT '{}',
            status      melisyncstatus NOT NULL DEFAULT 'PENDING',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            processed_at TIMESTAMPTZ,
            created_at  TIMESTAMP NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP NOT NULL DEFAULT now(),
            deleted_at  TIMESTAMP
        )
    """)
    op.execute("CREATE INDEX ix_meli_sync_queue_business_id ON meli_sync_queue (business_id)")
    op.execute("CREATE INDEX ix_meli_sync_queue_listing_id ON meli_sync_queue (listing_id)")
    op.execute("CREATE INDEX ix_meli_sync_queue_status ON meli_sync_queue (status)")
    op.execute("CREATE INDEX ix_meli_sync_queue_pending ON meli_sync_queue (status) WHERE status = 'PENDING'")

    op.execute("""
        CREATE TABLE meli_orders (
            id             UUID PRIMARY KEY,
            business_id    UUID NOT NULL REFERENCES businesses(id),
            meli_order_id  BIGINT NOT NULL,
            status         VARCHAR(50),
            raw            JSONB,
            stock_applied  BOOLEAN NOT NULL DEFAULT false,
            created_at     TIMESTAMP NOT NULL DEFAULT now(),
            updated_at     TIMESTAMP NOT NULL DEFAULT now(),
            deleted_at     TIMESTAMP,
            CONSTRAINT uq_meli_orders_order_id UNIQUE (meli_order_id)
        )
    """)
    op.execute("CREATE INDEX ix_meli_orders_business_id ON meli_orders (business_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS meli_orders")
    op.execute("DROP INDEX IF EXISTS ix_meli_sync_queue_pending")
    op.execute("DROP TABLE IF EXISTS meli_sync_queue")
    op.execute("DROP TABLE IF EXISTS meli_listings")
    op.execute("DROP TABLE IF EXISTS meli_credentials")
    op.execute("DROP TYPE IF EXISTS melisyncstatus")
    op.execute("DROP TYPE IF EXISTS melisynckind")
    op.execute("DROP TYPE IF EXISTS melicredentialstatus")
