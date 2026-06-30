"""
Backfill cost_price for all products where cost_price = 0.
Formula: list_price * (1 - d1/100) * (1 - d2/100) * (1 - d3/100)
"""
import asyncio
import os
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var is required")


async def backfill():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(
            text("""
                UPDATE products
                SET cost_price = ROUND(
                    list_price
                    * (1 - COALESCE(discount_1, 0) / 100)
                    * (1 - COALESCE(discount_2, 0) / 100)
                    * (1 - COALESCE(discount_3, 0) / 100),
                    2
                )
                WHERE cost_price = 0 AND list_price > 0
                AND deleted_at IS NULL
            """)
        )
        await session.commit()
        print(f"Updated {result.rowcount} products with cost_price.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill())
