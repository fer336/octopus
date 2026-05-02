"""add_feedback_tickets_table

Revision ID: f1a2b3c4d5e6
Revises: e9a1b2c3d4f5
Create Date: 2026-04-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e9a1b2c3d4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "feedback_tickets",
        sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("feedback_type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column(
            "source",
            sa.String(length=30),
            nullable=False,
            server_default="tenant_app",
        ),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_feedback_tickets_business_id"),
        "feedback_tickets",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_tickets_created_at"),
        "feedback_tickets",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_tickets_deleted_at"),
        "feedback_tickets",
        ["deleted_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_tickets_feedback_type"),
        "feedback_tickets",
        ["feedback_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_tickets_id"), "feedback_tickets", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_feedback_tickets_status"), "feedback_tickets", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_feedback_tickets_updated_at"),
        "feedback_tickets",
        ["updated_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_tickets_user_id"),
        "feedback_tickets",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_tickets_business_type_status",
        "feedback_tickets",
        ["business_id", "feedback_type", "status"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_feedback_tickets_business_type_status", table_name="feedback_tickets"
    )
    op.drop_index(op.f("ix_feedback_tickets_user_id"), table_name="feedback_tickets")
    op.drop_index(op.f("ix_feedback_tickets_updated_at"), table_name="feedback_tickets")
    op.drop_index(op.f("ix_feedback_tickets_status"), table_name="feedback_tickets")
    op.drop_index(op.f("ix_feedback_tickets_id"), table_name="feedback_tickets")
    op.drop_index(
        op.f("ix_feedback_tickets_feedback_type"), table_name="feedback_tickets"
    )
    op.drop_index(op.f("ix_feedback_tickets_deleted_at"), table_name="feedback_tickets")
    op.drop_index(op.f("ix_feedback_tickets_created_at"), table_name="feedback_tickets")
    op.drop_index(
        op.f("ix_feedback_tickets_business_id"), table_name="feedback_tickets"
    )
    op.drop_table("feedback_tickets")
