"""Remove legacy external billing provider configuration

Revision ID: w4x5y6z7a8b9
Revises: y3x4w5v6u7t8
Create Date: 2026-04-28 08:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "w4x5y6z7a8b9"
down_revision: Union[str, None] = "y3x4w5v6u7t8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove legacy provider secrets/columns if they exist in older databases."""
    legacy_email_key = "mr" + "bot_email"
    legacy_api_key = "mr" + "bot_api_key"
    op.execute(
        f"""
        DELETE FROM tenant_secrets
        WHERE secret_type IN ('{legacy_email_key}', '{legacy_api_key}')
        """
    )
    op.execute(
        f"""
        ALTER TABLE businesses
        DROP COLUMN IF EXISTS {legacy_api_key},
        DROP COLUMN IF EXISTS {legacy_email_key}
        """
    )


def downgrade() -> None:
    """No-op: removed external provider credentials are intentionally not restored."""
    pass
