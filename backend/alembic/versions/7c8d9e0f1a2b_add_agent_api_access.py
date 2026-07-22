"""add agent api access

Revision ID: 7c8d9e0f1a2b
Revises: e6f7a8b9c0d1
Create Date: 2026-07-15 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7c8d9e0f1a2b"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_credentials",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("surface", sa.String(length=20), nullable=False),
        sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key_id", sa.String(length=32), nullable=False),
        sa.Column("secret_hash", sa.String(length=128), nullable=False),
        sa.Column("secret_last4", sa.String(length=4), nullable=False),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.CheckConstraint("surface IN ('tenant', 'platform')", name="ck_agent_credentials_surface"),
        sa.CheckConstraint("status IN ('active', 'revoked')", name="ck_agent_credentials_status"),
        sa.CheckConstraint(
            "(surface = 'tenant' AND business_id IS NOT NULL) OR (surface = 'platform' AND business_id IS NULL)",
            name="ck_agent_credentials_business_binding",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_credentials_business_id"), "agent_credentials", ["business_id"])
    op.create_index(op.f("ix_agent_credentials_key_id"), "agent_credentials", ["key_id"], unique=True)
    op.create_index(op.f("ix_agent_credentials_surface"), "agent_credentials", ["surface"])
    op.create_index(op.f("ix_agent_credentials_status"), "agent_credentials", ["status"])
    op.create_index(
        "uq_active_tenant_agent_per_business",
        "agent_credentials",
        ["business_id"],
        unique=True,
        postgresql_where=sa.text("surface = 'tenant' AND status = 'active' AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_active_platform_agent",
        "agent_credentials",
        ["surface"],
        unique=True,
        postgresql_where=sa.text("surface = 'platform' AND status = 'active' AND deleted_at IS NULL"),
    )
    op.add_column("audit_logs", sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_type", sa.String(length=20), nullable=True))
    op.add_column("audit_logs", sa.Column("correlation_id", sa.String(length=80), nullable=True))
    op.add_column("audit_logs", sa.Column("outcome", sa.String(length=20), nullable=True))
    op.add_column("audit_logs", sa.Column("scopes_evaluated", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_foreign_key("fk_audit_logs_agent_id", "audit_logs", "agent_credentials", ["agent_id"], ["id"], ondelete="SET NULL")
    op.create_index(op.f("ix_audit_logs_agent_id"), "audit_logs", ["agent_id"])
    op.create_index(op.f("ix_audit_logs_actor_type"), "audit_logs", ["actor_type"])
    op.create_index(op.f("ix_audit_logs_correlation_id"), "audit_logs", ["correlation_id"])
    op.create_index(op.f("ix_audit_logs_outcome"), "audit_logs", ["outcome"])


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_outcome"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_correlation_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_type"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_agent_id"), table_name="audit_logs")
    op.drop_constraint("fk_audit_logs_agent_id", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "scopes_evaluated")
    op.drop_column("audit_logs", "outcome")
    op.drop_column("audit_logs", "correlation_id")
    op.drop_column("audit_logs", "actor_type")
    op.drop_column("audit_logs", "agent_id")
    op.drop_index("uq_active_platform_agent", table_name="agent_credentials")
    op.drop_index("uq_active_tenant_agent_per_business", table_name="agent_credentials")
    op.drop_table("agent_credentials")
