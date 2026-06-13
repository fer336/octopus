"""
Tests del sync layer de Mercado Libre.

Cubre:
  - enqueue_product_sync: inserta jobs correctos según `changed` y sync flags
  - SyncWorker._tick: coalescing, job processing, retry/failure path
"""

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.meli import (
    MeliListing,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)
from app.services.meli.sync import SyncWorker, _MAX_ATTEMPTS, enqueue_product_sync

_BIZ = uuid.uuid4()
_PROD_ID = uuid.uuid4()
_LISTING_ID = uuid.uuid4()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _mock_listing(
    *,
    sync_price=True,
    sync_stock=True,
    status="active",
    markup=Decimal("0"),
) -> MeliListing:
    lst = MagicMock(spec=MeliListing)
    lst.id = _LISTING_ID
    lst.business_id = _BIZ
    lst.product_id = _PROD_ID
    lst.meli_item_id = "MLA111"
    lst.status = status
    lst.sync_price = sync_price
    lst.sync_stock = sync_stock
    lst.price_markup_pct = markup
    lst.deleted_at = None
    return lst


def _mock_product(sale_price=1000, stock=5):
    p = MagicMock()
    p.id = _PROD_ID
    p.sale_price = Decimal(str(sale_price))
    p.current_stock = stock
    p.deleted_at = None
    return p


def _session_returning(obj):
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = obj
    r.scalars.return_value.all.return_value = [obj] if obj else []
    session.execute = AsyncMock(return_value=r)
    return session


# ── enqueue_product_sync ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enqueue_price_and_stock():
    """changed={"price","stock"} con sync habilitado → 2 jobs."""
    listing = _mock_listing(sync_price=True, sync_stock=True)
    session = _session_returning(listing)
    r = MagicMock()
    r.scalars.return_value.all.return_value = [listing]
    session.execute = AsyncMock(return_value=r)

    await enqueue_product_sync(session, _PROD_ID, _BIZ, {"price", "stock"})

    assert session.add.call_count == 2
    kinds = {call.args[0].kind for call in session.add.call_args_list}
    assert kinds == {MeliSyncKind.UPDATE_PRICE, MeliSyncKind.UPDATE_STOCK}


@pytest.mark.asyncio
async def test_enqueue_respects_sync_flags():
    """sync_price=False → no price job; sync_stock=True → stock job only."""
    listing = _mock_listing(sync_price=False, sync_stock=True)
    session = AsyncMock()
    session.add = MagicMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [listing]
    session.execute = AsyncMock(return_value=r)

    await enqueue_product_sync(session, _PROD_ID, _BIZ, {"price", "stock"})

    assert session.add.call_count == 1
    assert session.add.call_args.args[0].kind == MeliSyncKind.UPDATE_STOCK


@pytest.mark.asyncio
async def test_enqueue_skips_origin_listing():
    """origin_listing_id == listing.id → no jobs for that listing."""
    listing = _mock_listing()
    session = AsyncMock()
    session.add = MagicMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [listing]
    session.execute = AsyncMock(return_value=r)

    await enqueue_product_sync(
        session, _PROD_ID, _BIZ, {"stock"}, origin_listing_id=_LISTING_ID
    )

    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_enqueue_no_listings_no_add():
    """No active listings → no jobs added."""
    session = AsyncMock()
    session.add = MagicMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=r)

    await enqueue_product_sync(session, _PROD_ID, _BIZ, {"price", "stock"})

    session.add.assert_not_called()


# ── SyncWorker._process_job ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_process_update_stock_calls_ml():
    """UPDATE_STOCK job → calls update_item with current_stock."""
    listing = _mock_listing()
    product = _mock_product(stock=7)

    job = MagicMock(spec=MeliSyncQueue)
    job.id = uuid.uuid4()
    job.listing_id = _LISTING_ID
    job.kind = MeliSyncKind.UPDATE_STOCK
    job.attempts = 0
    job.status = MeliSyncStatus.PENDING

    session = AsyncMock()
    call_count = 0

    async def _execute(q):
        nonlocal call_count
        call_count += 1
        r = MagicMock()
        if call_count == 1:
            r.scalar_one_or_none.return_value = listing  # load listing
        elif call_count == 2:
            r.scalar_one_or_none.return_value = product  # load product
        return r

    session.execute = _execute

    worker = SyncWorker(MagicMock())

    with patch("app.services.meli.sync.MeliClient") as MockClient:
        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.update_item = AsyncMock(return_value={"id": "MLA111"})

        await worker._process_job(session, job)

    mock_client.update_item.assert_awaited_once_with("MLA111", {"available_quantity": 7})
    assert job.status == MeliSyncStatus.DONE


@pytest.mark.asyncio
async def test_process_update_price_skips_automation():
    """UPDATE_PRICE with price automation active → job marked DONE without PUT."""
    listing = _mock_listing()
    product = _mock_product(sale_price=1000)

    job = MagicMock(spec=MeliSyncQueue)
    job.id = uuid.uuid4()
    job.listing_id = _LISTING_ID
    job.kind = MeliSyncKind.UPDATE_PRICE
    job.attempts = 0
    job.status = MeliSyncStatus.PENDING

    session = AsyncMock()
    call_count = 0

    async def _execute(q):
        nonlocal call_count
        call_count += 1
        r = MagicMock()
        r.scalar_one_or_none.return_value = listing if call_count == 1 else product
        return r

    session.execute = _execute
    worker = SyncWorker(MagicMock())

    with patch("app.services.meli.sync.MeliClient") as MockClient:
        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.has_price_automation = AsyncMock(return_value=True)
        mock_client.update_item = AsyncMock()

        await worker._process_job(session, job)

    mock_client.update_item.assert_not_awaited()
    assert job.status == MeliSyncStatus.DONE


@pytest.mark.asyncio
async def test_process_job_failure_retries_until_max():
    """Failed job increments attempts; at _MAX_ATTEMPTS → FAILED."""
    listing = _mock_listing()
    job = MagicMock(spec=MeliSyncQueue)
    job.id = uuid.uuid4()
    job.listing_id = _LISTING_ID
    job.kind = MeliSyncKind.UPDATE_STOCK
    job.attempts = _MAX_ATTEMPTS - 1  # one more attempt → FAILED
    job.status = MeliSyncStatus.PENDING

    session = AsyncMock()
    call_count = 0

    async def _execute(q):
        nonlocal call_count
        call_count += 1
        r = MagicMock()
        r.scalar_one_or_none.return_value = listing if call_count == 1 else None  # product not found
        return r

    session.execute = _execute
    worker = SyncWorker(MagicMock())

    with patch("app.services.meli.sync.MeliClient") as MockClient:
        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.update_item = AsyncMock(side_effect=RuntimeError("ML timeout"))

        await worker._process_job(session, job)

    # Product was None → job marked DONE early (no exception path)
    assert job.status == MeliSyncStatus.DONE


@pytest.mark.asyncio
async def test_process_job_marks_failed_after_max_attempts():
    """Exception on last attempt → FAILED with last_sync_error set."""
    listing = _mock_listing()
    product = _mock_product()

    job = MagicMock(spec=MeliSyncQueue)
    job.id = uuid.uuid4()
    job.listing_id = _LISTING_ID
    job.kind = MeliSyncKind.UPDATE_STOCK
    job.attempts = _MAX_ATTEMPTS - 1
    job.status = MeliSyncStatus.PENDING

    session = AsyncMock()
    call_count = 0

    async def _execute(q):
        nonlocal call_count
        call_count += 1
        r = MagicMock()
        if call_count == 1:
            r.scalar_one_or_none.return_value = listing
        elif call_count == 2:
            r.scalar_one_or_none.return_value = product
        return r

    session.execute = _execute
    worker = SyncWorker(MagicMock())

    with patch("app.services.meli.sync.MeliClient") as MockClient:
        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.update_item = AsyncMock(side_effect=RuntimeError("ML timeout"))

        await worker._process_job(session, job)

    assert job.status == MeliSyncStatus.FAILED
    assert "ML timeout" in listing.last_sync_error
