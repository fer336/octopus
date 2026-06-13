"""
Tests de webhooks y procesamiento de órdenes de Mercado Libre.

Cubre:
  - POST /api/v1/meli/notifications: topics ignorados, user_id desconocido,
    orden válida encola job, recurso sin order_id
  - process_order: orden paga descuenta stock, idempotencia, cancelación revierte,
    item no trackeado se ignora
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.meli import (
    MeliCredentialStatus,
    MeliCredentials,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)
from app.services.meli.order_processor import process_order

_BUSINESS_ID = uuid.uuid4()
_MELI_USER_ID = 555444333
_LISTING_ID = uuid.uuid4()
_PRODUCT_ID = uuid.uuid4()
_ORDER_ID = 9876543210


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_cred(business_id=_BUSINESS_ID):
    cred = MagicMock(spec=MeliCredentials)
    cred.business_id = business_id
    cred.meli_user_id = _MELI_USER_ID
    cred.status = MeliCredentialStatus.CONNECTED
    cred.deleted_at = None
    return cred


def _make_listing(meli_item_id="MLA999"):
    lst = MagicMock()
    lst.id = _LISTING_ID
    lst.business_id = _BUSINESS_ID
    lst.product_id = _PRODUCT_ID
    lst.meli_item_id = meli_item_id
    lst.deleted_at = None
    return lst


def _make_order_data(status="paid", *, item_id="MLA999", qty=2):
    return {
        "id": _ORDER_ID,
        "status": status,
        "payments": [{"status": "approved"}] if status == "paid" else [],
        "order_items": [
            {"item": {"id": item_id}, "quantity": qty}
        ],
    }


def _make_db_mock(cred=None):
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = cred

    db = AsyncMock()
    db.execute = AsyncMock(return_value=scalar_result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    return db


# ── Webhook endpoint tests ────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_notifications_unknown_user_returns_200():
    """user_id no encontrado en DB → 200, no se encola job."""
    db = _make_db_mock(cred=None)
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/meli/notifications",
            json={"resource": f"/orders/{_ORDER_ID}", "user_id": 999, "topic": "orders_v2"},
        )

    assert resp.status_code == 200
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_notifications_non_orders_topic_returns_200():
    """topic != orders_v2 → 200 inmediato, sin tocar DB."""
    db = _make_db_mock()
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/meli/notifications",
            json={"resource": "/questions/123", "user_id": _MELI_USER_ID, "topic": "questions"},
        )

    assert resp.status_code == 200
    db.execute.assert_not_called()


def test_notifications_invalid_resource_returns_200():
    """resource sin order_id parseable → 200, sin encolar."""
    db = _make_db_mock(cred=_make_cred())
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/meli/notifications",
            json={"resource": "/items/MLA123", "user_id": _MELI_USER_ID, "topic": "orders_v2"},
        )

    assert resp.status_code == 200
    db.add.assert_not_called()


def test_notifications_valid_order_enqueues_job():
    """Notificación válida → encola MeliSyncQueue PROCESS_ORDER y hace commit."""
    cred = _make_cred()
    db = _make_db_mock(cred=cred)
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/meli/notifications",
            json={
                "resource": f"/orders/{_ORDER_ID}",
                "user_id": _MELI_USER_ID,
                "topic": "orders_v2",
            },
        )

    assert resp.status_code == 200
    db.add.assert_called_once()
    job: MeliSyncQueue = db.add.call_args.args[0]
    assert job.kind == MeliSyncKind.PROCESS_ORDER
    assert job.payload["order_id"] == _ORDER_ID
    assert job.business_id == _BUSINESS_ID
    db.commit.assert_called_once()


def test_notifications_v2_resource_path():
    """resource con ruta /orders/v2/{id} también parsea correctamente."""
    cred = _make_cred()
    db = _make_db_mock(cred=cred)
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/meli/notifications",
            json={
                "resource": f"/orders/v2/{_ORDER_ID}",
                "user_id": _MELI_USER_ID,
                "topic": "orders_v2",
            },
        )

    assert resp.status_code == 200
    db.add.assert_called_once()
    job = db.add.call_args.args[0]
    assert job.payload["order_id"] == _ORDER_ID


# ── process_order unit tests ──────────────────────────────────────────────────


def _session_with_sequence(*return_values):
    """Session que devuelve objetos distintos en cada llamada a execute()."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    call_count = 0
    results = list(return_values)

    async def _execute(q):
        nonlocal call_count
        r = MagicMock()
        val = results[call_count] if call_count < len(results) else None
        r.scalar_one_or_none.return_value = val
        r.scalars.return_value.all.return_value = [val] if val else []
        call_count += 1
        return r

    session.execute = _execute
    return session


@pytest.mark.asyncio
async def test_process_order_paid_deducts_stock():
    """Orden paid → fifo_consume llamado, stock_applied=True."""
    listing = _make_listing()
    order_data = _make_order_data(status="paid", item_id="MLA999", qty=2)

    # execute calls: 1=upsert meli_orders (None→create), 2=find listing, 3=find listings for enqueue
    session = _session_with_sequence(None, listing)
    # enqueue_product_sync does one more execute — return empty list
    original_execute = session.execute

    call_count = 0

    async def _execute(q):
        nonlocal call_count
        r = MagicMock()
        if call_count == 0:
            r.scalar_one_or_none.return_value = None   # no existing MeliOrder
            r.scalars.return_value.all.return_value = []
        elif call_count == 1:
            r.scalar_one_or_none.return_value = listing  # find_listing
            r.scalars.return_value.all.return_value = [listing]
        else:
            r.scalar_one_or_none.return_value = None
            r.scalars.return_value.all.return_value = []  # enqueue_product_sync: no listings
        call_count += 1
        return r

    session.execute = _execute

    with patch("app.services.meli.order_processor.MeliClient") as MockClient, \
         patch("app.services.meli.order_processor.ProductLotService") as MockLotSvc:

        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.get_order = AsyncMock(return_value=order_data)

        mock_lot = AsyncMock()
        MockLotSvc.return_value = mock_lot
        mock_lot.fifo_consume = AsyncMock(return_value=(uuid.uuid4(), []))

        await process_order(session, _BUSINESS_ID, _ORDER_ID)

    mock_lot.fifo_consume.assert_awaited_once()
    call_kw = mock_lot.fifo_consume.call_args
    assert call_kw.kwargs["quantity"] == 2
    assert str(_ORDER_ID) in call_kw.kwargs["reason"]


@pytest.mark.asyncio
async def test_process_order_idempotent_already_applied():
    """Segunda llamada con stock_applied=True → no descuenta stock."""
    existing_order = MagicMock()
    existing_order.meli_order_id = _ORDER_ID
    existing_order.stock_applied = True
    existing_order.status = "paid"

    call_count = 0

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    async def _execute(q):
        nonlocal call_count
        r = MagicMock()
        r.scalar_one_or_none.return_value = existing_order
        r.scalars.return_value.all.return_value = [existing_order]
        call_count += 1
        return r

    session.execute = _execute

    with patch("app.services.meli.order_processor.MeliClient") as MockClient, \
         patch("app.services.meli.order_processor.ProductLotService") as MockLotSvc:

        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.get_order = AsyncMock(return_value=_make_order_data(status="paid"))

        mock_lot = AsyncMock()
        MockLotSvc.return_value = mock_lot

        await process_order(session, _BUSINESS_ID, _ORDER_ID)

    mock_lot.fifo_consume.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_order_cancelled_reverses_stock():
    """Orden cancelada con stock_applied=True → crea lote de devolución, stock_applied=False."""
    listing = _make_listing()

    existing_order = MagicMock()
    existing_order.meli_order_id = _ORDER_ID
    existing_order.stock_applied = True
    existing_order.status = "paid"

    call_count = 0

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    async def _execute(q):
        nonlocal call_count
        r = MagicMock()
        if call_count == 0:
            r.scalar_one_or_none.return_value = existing_order
        elif call_count == 1:
            r.scalar_one_or_none.return_value = listing
        else:
            r.scalar_one_or_none.return_value = None
            r.scalars.return_value.all.return_value = []
        call_count += 1
        return r

    session.execute = _execute

    with patch("app.services.meli.order_processor.MeliClient") as MockClient:
        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.get_order = AsyncMock(
            return_value=_make_order_data(status="cancelled", item_id="MLA999", qty=3)
        )

        await process_order(session, _BUSINESS_ID, _ORDER_ID)

    # A ProductLot should have been added (reversal lot)
    assert session.add.call_count >= 1
    from app.models.product_lot import ProductLot
    added_lots = [c.args[0] for c in session.add.call_args_list if isinstance(c.args[0], ProductLot)]
    assert len(added_lots) == 1
    assert added_lots[0].quantity == 3

    assert existing_order.stock_applied is False
    assert existing_order.status == "cancelled"


@pytest.mark.asyncio
async def test_process_order_item_not_tracked_is_skipped():
    """Ítem ML sin listing local → se ignora silenciosamente, no hay error."""
    call_count = 0

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    async def _execute(q):
        nonlocal call_count
        r = MagicMock()
        if call_count == 0:
            r.scalar_one_or_none.return_value = None  # no existing order
        else:
            r.scalar_one_or_none.return_value = None  # listing not found
        r.scalars.return_value.all.return_value = []
        call_count += 1
        return r

    session.execute = _execute

    with patch("app.services.meli.order_processor.MeliClient") as MockClient, \
         patch("app.services.meli.order_processor.ProductLotService") as MockLotSvc:

        mock_client = AsyncMock()
        MockClient.return_value = mock_client
        mock_client.get_order = AsyncMock(
            return_value=_make_order_data(status="paid", item_id="MLA_UNKNOWN", qty=1)
        )

        mock_lot = AsyncMock()
        MockLotSvc.return_value = mock_lot

        await process_order(session, _BUSINESS_ID, _ORDER_ID)

    mock_lot.fifo_consume.assert_not_awaited()
