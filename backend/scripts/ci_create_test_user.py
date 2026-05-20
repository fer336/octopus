"""
CI utility: creates a test user + business + membership in the DB,
then prints a valid JWT to stdout.

Usage:
  python backend/scripts/ci_create_test_user.py

Output (stdout):
  <jwt_token>

Used by the E2E GitHub Actions job to set TEST_AUTH_TOKEN.
"""

import asyncio
import sys
import os

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.utils.security import create_access_token

settings = get_settings()

TEST_EMAIL = "ci-e2e@octopustrack.test"
TEST_GOOGLE_ID = "ci_e2e_google_id_12345"


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with session_maker() as db:
        # Reuse existing test user if present (idempotent)
        from sqlalchemy import select

        result = await db.execute(select(User).where(User.email == TEST_EMAIL))
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                email=TEST_EMAIL,
                name="CI E2E User",
                google_id=TEST_GOOGLE_ID,
                platform_role="tenant_user",
            )
            db.add(user)
            await db.flush()

        result = await db.execute(
            select(Business).where(Business.owner_id == user.id)
        )
        business = result.scalar_one_or_none()

        if not business:
            business = Business(
                owner_id=user.id,
                name="CI Test Business",
                cuit="30-99999999-9",
                tax_condition="Monotributista",
                sale_point="0001",
                electronic_sale_point="0012",
                alternative_sale_point="5001",
                invoicing_enabled=True,
            )
            db.add(business)
            await db.flush()

        result = await db.execute(
            select(TenantMembership).where(
                TenantMembership.user_id == user.id,
                TenantMembership.business_id == business.id,
            )
        )
        membership = result.scalar_one_or_none()

        if not membership:
            membership = TenantMembership(
                user_id=user.id,
                business_id=business.id,
                role="owner",
            )
            db.add(membership)

        await db.commit()

        token = create_access_token(
            user_id=user.id,
            email=user.email,
            platform_role=user.platform_role,
        )

        # Write token to GitHub Actions output if available, otherwise stdout
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write(f"token={token}\n")
        else:
            print(token)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
