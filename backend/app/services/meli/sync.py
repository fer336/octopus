"""
MELI sync layer — outbox enqueuing + background worker.

Public API:
  enqueue_product_sync(session, product_id, business_id, changed, *, origin_listing_id)
  SyncWorker — asyncio background task, launched from FastAPI lifespan
"""

import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.meli import (
    MeliListing,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)
from app.models.product import Product
from app.services.meli.client import MeliClient

logger = logging.getLogger(__name__)

_ACTIVE_LISTING_STATUSES = {"active", "paused"}
_MAX_ATTEMPTS = 5
_WORKER_INTERVAL = 5   # seconds between ticks
_BATCH_SIZE = 20       # jobs per tick


# ── Outbox enqueue ────────────────────────────────────────────────────────────


async def enqueue_product_sync(
    session: AsyncSession,
    product_id: UUID,
    business_id: UUID,
    changed: set[str],
    *,
    origin_listing_id: UUID | None = None,
) -> None:
    """
    Insert MeliSyncQueue entries for all active listings of `product_id`.

    `changed` should contain "price" and/or "stock".
    `origin_listing_id` is excluded — used when ML already applied the change
    (e.g. a webhook order) to avoid a round-trip loop.

    Caller is responsible for commit/flush. This function only calls session.add().
    """
    result = await session.execute(
        select(MeliListing).where(
            MeliListing.business_id == business_id,
            MeliListing.product_id == product_id,
            MeliListing.status.in_(_ACTIVE_LISTING_STATUSES),
            MeliListing.deleted_at.is_(None),
        )
    )
    listings = result.scalars().all()

    for listing in listings:
        if listing.id == origin_listing_id:
            continue

        if "price" in changed and listing.sync_price:
            session.add(MeliSyncQueue(
                business_id=business_id,
                listing_id=listing.id,
                kind=MeliSyncKind.UPDATE_PRICE,
                payload={"product_id": str(product_id)},
                status=MeliSyncStatus.PENDING,
            ))

        if "stock" in changed and listing.sync_stock:
            session.add(MeliSyncQueue(
                business_id=business_id,
                listing_id=listing.id,
                kind=MeliSyncKind.UPDATE_STOCK,
                payload={"product_id": str(product_id)},
                status=MeliSyncStatus.PENDING,
            ))


# ── Background worker ─────────────────────────────────────────────────────────


class SyncWorker:
    """Asyncio background task that drains `meli_sync_queue`."""

    def __init__(self, session_factory) -> None:
        self._session_factory = session_factory
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="meli-sync-worker")
        logger.info("MeliSyncWorker started")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("MeliSyncWorker stopped")

    async def _run(self) -> None:
        while True:
            try:
                await self._tick()
            except Exception:
                logger.exception("MeliSyncWorker tick error")
            await asyncio.sleep(_WORKER_INTERVAL)

    async def _tick(self) -> None:
        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(MeliSyncQueue)
                    .where(MeliSyncQueue.status == MeliSyncStatus.PENDING)
                    .order_by(MeliSyncQueue.created_at)
                    .limit(_BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
                jobs = result.scalars().all()

                if not jobs:
                    return

                # Coalescing: for the same (listing_id, kind), keep only the newest.
                latest: dict[tuple, MeliSyncQueue] = {}
                for job in jobs:
                    key = (job.listing_id, job.kind)
                    if key in latest:
                        # Mark the older one as done (superseded)
                        older = latest[key] if latest[key].created_at < job.created_at else job
                        newer = job if latest[key].created_at < job.created_at else latest[key]
                        older.status = MeliSyncStatus.DONE
                        latest[key] = newer
                    else:
                        latest[key] = job

                await session.flush()

                for job in latest.values():
                    await self._process_job(session, job)
                # Session.begin() commits on exit

    async def _process_job(self, session: AsyncSession, job: MeliSyncQueue) -> None:
        job.status = MeliSyncStatus.PROCESSING
        job.attempts += 1

        # Load listing
        listing_result = await session.execute(
            select(MeliListing).where(
                MeliListing.id == job.listing_id,
                MeliListing.deleted_at.is_(None),
            )
        )
        listing = listing_result.scalar_one_or_none()
        if not listing:
            job.status = MeliSyncStatus.DONE
            return

        client = MeliClient(session, listing.business_id)

        try:
            if job.kind == MeliSyncKind.UPDATE_STOCK:
                await self._sync_stock(session, client, listing, job)

            elif job.kind == MeliSyncKind.UPDATE_PRICE:
                await self._sync_price(session, client, listing, job)

            elif job.kind == MeliSyncKind.PAUSE:
                await client.put(f"/items/{listing.meli_item_id}", json={"status": "paused"})
                listing.status = "paused"
                job.status = MeliSyncStatus.DONE
                listing.last_synced_at = datetime.now(UTC)
                listing.last_sync_error = None

            elif job.kind == MeliSyncKind.ACTIVATE:
                await client.put(f"/items/{listing.meli_item_id}", json={"status": "active"})
                listing.status = "active"
                job.status = MeliSyncStatus.DONE
                listing.last_synced_at = datetime.now(UTC)
                listing.last_sync_error = None

        except Exception as exc:
            logger.error(
                "MeliSyncWorker job %s kind=%s attempt=%d failed: %s",
                job.id, job.kind, job.attempts, exc,
            )
            if job.attempts >= _MAX_ATTEMPTS:
                job.status = MeliSyncStatus.FAILED
                listing.last_sync_error = str(exc)[:500]
            else:
                job.status = MeliSyncStatus.PENDING  # retry next tick

    async def _sync_stock(
        self, session: AsyncSession, client: MeliClient, listing: MeliListing, job: MeliSyncQueue
    ) -> None:
        product_result = await session.execute(
            select(Product)
            .options(selectinload(Product.lots))
            .where(Product.id == listing.product_id, Product.deleted_at.is_(None))
        )
        product = product_result.scalar_one_or_none()
        if not product:
            job.status = MeliSyncStatus.DONE
            return

        stock = product.current_stock
        await client.update_item(listing.meli_item_id, {"available_quantity": stock})

        # ML auto-pauses condition=new items with stock=0; reflect locally
        if stock == 0:
            listing.status = "paused"

        job.status = MeliSyncStatus.DONE
        listing.last_synced_at = datetime.now(UTC)
        listing.last_sync_error = None

    async def _sync_price(
        self, session: AsyncSession, client: MeliClient, listing: MeliListing, job: MeliSyncQueue
    ) -> None:
        product_result = await session.execute(
            select(Product).where(Product.id == listing.product_id, Product.deleted_at.is_(None))
        )
        product = product_result.scalar_one_or_none()
        if not product:
            job.status = MeliSyncStatus.DONE
            return

        # Since 18/03/2026: PUT price on repriced items gives 400
        if await client.has_price_automation(listing.meli_item_id):
            logger.info(
                "Skipping price sync for %s: price automation active", listing.meli_item_id
            )
            job.status = MeliSyncStatus.DONE
            listing.last_synced_at = datetime.now(UTC)
            return

        markup = Decimal(str(listing.price_markup_pct or 0))
        price = float(round(Decimal(str(product.sale_price)) * (1 + markup / 100), 2))
        await client.update_item(listing.meli_item_id, {"price": price})

        job.status = MeliSyncStatus.DONE
        listing.last_synced_at = datetime.now(UTC)
        listing.last_sync_error = None
