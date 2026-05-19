"""add whatsapp_auth_requests table

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_auth_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("business_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("businesses.id"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_phone", sa.String(50), nullable=False),
        sa.Column("requester_name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default="retiro de materiales"),
        sa.Column("token", sa.String(20), unique=True, nullable=False),
        sa.Column("jwt_token", sa.String(1000), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("whatsapp_instance", sa.String(100), nullable=True),
        sa.Column("evolution_message_id", sa.String(255), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_whatsapp_auth_requests_id", "whatsapp_auth_requests", ["id"])
    op.create_index("ix_whatsapp_auth_requests_business_id", "whatsapp_auth_requests", ["business_id"])
    op.create_index("ix_whatsapp_auth_requests_token", "whatsapp_auth_requests", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_whatsapp_auth_requests_token", table_name="whatsapp_auth_requests")
    op.drop_index("ix_whatsapp_auth_requests_business_id", table_name="whatsapp_auth_requests")
    op.drop_index("ix_whatsapp_auth_requests_id", table_name="whatsapp_auth_requests")
    op.drop_table("whatsapp_auth_requests")
