"""
ML order processor — handles PROCESS_ORDER jobs from the sync queue.

Processes ML orders idempotently: fetches via API, deducts stock (FIFO),
and re-syncs sibling listings (excluding the ML origin to avoid loops).
"""

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meli import MeliListing, MeliOrder
from app.models.product_lot import ProductLot
from app.services.meli.client import MeliClient
from app.services.meli.sync import enqueue_product_sync
from app.services.product_lot_service import ProductLotService

logger = logging.getLogger(__name__)


def _is_paid(order_data: dict) -> bool:
    if order_data.get("status") == "paid":
        return True
    return any(p.get("status") == "approved" for p in order_data.get("payments", []))


async def process_order(
    session: AsyncSession,
    business_id: UUID,
    order_id: int,
) -> None:
    """
    Process a single ML order idempotently.

    - Fetches the order from the ML API.
    - Upserts meli_orders by meli_order_id (FOR UPDATE row lock).
    - For paid orders: FIFO-consumes stock per order_items; enqueues sync
      for sibling listings (origin listing excluded to avoid a loop).
    - For cancelled+already-applied orders: reverses stock.
    """
    client = MeliClient(session, business_id)
    order_data = await client.get_order(order_id)

    meli_order_id: int = order_data["id"]

    result = await session.execute(
        select(MeliOrder)
        .where(MeliOrder.meli_order_id == meli_order_id)
        .with_for_update()
    )
    order = result.scalar_one_or_none()

    if order is None:
        order = MeliOrder(
            business_id=business_id,
            meli_order_id=meli_order_id,
            status=order_data.get("status"),
            raw=order_data,
            stock_applied=False,
        )
        session.add(order)
        await session.flush()
    else:
        order.raw = order_data
        order.status = order_data.get("status")

    # Cancelled after stock was applied → reverse
    if order_data.get("status") == "cancelled" and order.stock_applied:
        await _reverse_stock(session, business_id, order, order_data)
        return

    # Idempotency guard for paid path
    if order.stock_applied:
        return

    if _is_paid(order_data):
        await _apply_stock(session, business_id, order, order_data)


async def _apply_stock(
    session: AsyncSession,
    business_id: UUID,
    order: MeliOrder,
    order_data: dict,
) -> None:
    lot_service = ProductLotService(session)

    for item in order_data.get("order_items", []):
        meli_item_id: str = item["item"]["id"]
        quantity: int = item.get("quantity", 0)
        if quantity <= 0:
            continue

        listing = await _find_listing(session, business_id, meli_item_id)
        if listing is None:
            logger.debug("ML item %s not tracked in business %s — skipping", meli_item_id, business_id)
            continue

        try:
            await lot_service.fifo_consume(
                product_id=listing.product_id,
                business_id=business_id,
                quantity=quantity,
                reason=f"Venta ML #{order.meli_order_id}",
            )
        except ValueError:
            logger.warning(
                "Insufficient stock for ML order %s, item %s — skipping stock deduction",
                order.meli_order_id,
                meli_item_id,
            )
            continue

        # Sync other listings of the same product. Skip the origin listing —
        # ML already decremented stock there, a PUT would be redundant.
        await enqueue_product_sync(
            session,
            listing.product_id,
            business_id,
            {"stock"},
            origin_listing_id=listing.id,
        )

    order.stock_applied = True
    await session.flush()


async def _reverse_stock(
    session: AsyncSession,
    business_id: UUID,
    order: MeliOrder,
    order_data: dict,
) -> None:
    for item in order_data.get("order_items", []):
        meli_item_id: str = item["item"]["id"]
        quantity: int = item.get("quantity", 0)
        if quantity <= 0:
            continue

        listing = await _find_listing(session, business_id, meli_item_id)
        if listing is None:
            continue

        lot = ProductLot(
            product_id=listing.product_id,
            business_id=business_id,
            quantity=quantity,
            initial_quantity=quantity,
            received_date=date.today(),
        )
        session.add(lot)

        # Origin listing excluded: ML already reverted its stock on cancellation.
        await enqueue_product_sync(
            session,
            listing.product_id,
            business_id,
            {"stock"},
            origin_listing_id=listing.id,
        )

    order.stock_applied = False
    order.status = "cancelled"
    await session.flush()


async def _find_listing(
    session: AsyncSession,
    business_id: UUID,
    meli_item_id: str,
) -> MeliListing | None:
    result = await session.execute(
        select(MeliListing).where(
            MeliListing.meli_item_id == meli_item_id,
            MeliListing.business_id == business_id,
            MeliListing.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
