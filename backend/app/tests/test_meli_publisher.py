"""
Tests del MeliPublisher — sin DB real ni credenciales de ML.
Patchea _load_product/_load_credentials para evitar instanciar modelos SQLAlchemy.
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
from app.services.meli.publisher import MeliPublisher

_BIZ = uuid.uuid4()
_PROD_ID = uuid.uuid4()
_LISTING_ID = uuid.uuid4()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _mock_product(sale_price=1000, stock=5):
    p = MagicMock()
    p.id = _PROD_ID
    p.business_id = _BIZ
    p.description = "Test product"
    p.sale_price = Decimal(str(sale_price))
    p.current_stock = stock
    p.deleted_at = None
    return p


def _mock_cred(meli_user_id=111):
    c = MagicMock()
    c.meli_user_id = meli_user_id
    return c


def _mock_listing(status="active"):
    lst = MagicMock(spec=MeliListing)
    lst.id = _LISTING_ID
    lst.business_id = _BIZ
    lst.meli_item_id = "MLA999"
    lst.status = status
    lst.sync_price = True
    lst.sync_stock = True
    lst.price_markup_pct = Decimal("0")
    lst.deleted_at = None
    return lst


def _bare_session():
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    return session


def _publisher(session=None):
    s = session or _bare_session()
    pub = MeliPublisher(s, _BIZ)
    return pub, s


# ── publish() ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_publish_creates_listing():
    """Happy path: publish crea MeliListing y hace flush."""
    product = _mock_product()
    pub, session = _publisher()

    ml_response = {"id": "MLA123", "permalink": "https://mla123", "status": "under_review"}

    with (
        patch.object(pub, "_load_product", AsyncMock(return_value=product)),
        patch.object(pub._client, "create_item", AsyncMock(return_value=ml_response)),
    ):
        # execute for existing-listing check
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=r)

        listing = await pub.publish(
            product_id=_PROD_ID,
            category_id="MLA1000",
            listing_type_id="gold_special",
        )

    assert listing.meli_item_id == "MLA123"
    assert listing.status == "under_review"
    session.add.assert_called_once_with(listing)
    session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_publish_raises_if_no_price():
    product = _mock_product(sale_price=0)
    pub, session = _publisher()

    with patch.object(pub, "_load_product", AsyncMock(return_value=product)), pytest.raises(ValueError, match="sale_price"):
        await pub.publish(product_id=_PROD_ID, category_id="MLA1000", listing_type_id="gold_special")


@pytest.mark.asyncio
async def test_publish_raises_if_no_stock():
    product = _mock_product(sale_price=1000, stock=0)
    pub, session = _publisher()

    with patch.object(pub, "_load_product", AsyncMock(return_value=product)), pytest.raises(ValueError, match="stock"):
        await pub.publish(product_id=_PROD_ID, category_id="MLA1000", listing_type_id="gold_special")


@pytest.mark.asyncio
async def test_publish_raises_if_active_listing_exists():
    product = _mock_product()
    pub, session = _publisher()

    r = MagicMock()
    r.scalar_one_or_none.return_value = _mock_listing(status="active")
    session.execute = AsyncMock(return_value=r)

    with patch.object(pub, "_load_product", AsyncMock(return_value=product)), pytest.raises(ValueError, match="activa"):
        await pub.publish(product_id=_PROD_ID, category_id="MLA1000", listing_type_id="gold_special")


@pytest.mark.asyncio
async def test_publish_applies_markup():
    """price_markup_pct=10 → effective_price = 1000 * 1.10 = 1100."""
    product = _mock_product(sale_price=1000)
    pub, session = _publisher()
    captured = {}

    async def _fake_create(payload):
        captured["price"] = payload["price"]
        return {"id": "MLA1", "permalink": None, "status": "active"}

    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=r)

    with (
        patch.object(pub, "_load_product", AsyncMock(return_value=product)),
        patch.object(pub._client, "create_item", side_effect=_fake_create),
    ):
        await pub.publish(
            product_id=_PROD_ID,
            category_id="MLA1000",
            listing_type_id="gold_special",
            price_markup_pct=Decimal("10"),
        )

    assert captured["price"] == pytest.approx(1100.0, rel=1e-3)


@pytest.mark.asyncio
async def test_publish_ml_error_body_raises():
    """ML devuelve 200 pero con campo 'error' → ValueError."""
    product = _mock_product()
    pub, session = _publisher()

    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=r)

    with (
        patch.object(pub, "_load_product", AsyncMock(return_value=product)),
        patch.object(
            pub._client,
            "create_item",
            AsyncMock(return_value={"error": "invalid_category", "message": "Bad cat"}),
        ),
        pytest.raises(ValueError, match="Bad cat"),
    ):
        await pub.publish(product_id=_PROD_ID, category_id="MLA9999", listing_type_id="gold_special")


# ── link() ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_link_creates_listing():
    product = _mock_product()
    cred = _mock_cred(meli_user_id=555)
    ml_item = {"id": "MLA777", "seller_id": 555, "permalink": "https://mla777", "status": "active"}

    pub, session = _publisher()

    # execute calls: existing link check (None)
    r_none = MagicMock()
    r_none.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=r_none)

    with (
        patch.object(pub, "_load_product", AsyncMock(return_value=product)),
        patch.object(pub, "_load_credentials", AsyncMock(return_value=cred)),
        patch.object(pub._client, "get_item", AsyncMock(return_value=ml_item)),
    ):
        listing = await pub.link(product_id=_PROD_ID, meli_item_id="MLA777")

    assert listing.meli_item_id == "MLA777"
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_link_raises_if_wrong_seller():
    product = _mock_product()
    cred = _mock_cred(meli_user_id=555)
    ml_item = {"id": "MLA777", "seller_id": 999}

    pub, session = _publisher()

    with (
        patch.object(pub, "_load_product", AsyncMock(return_value=product)),
        patch.object(pub, "_load_credentials", AsyncMock(return_value=cred)),
        patch.object(pub._client, "get_item", AsyncMock(return_value=ml_item)),
        pytest.raises(ValueError, match="different seller"),
    ):
        await pub.link(product_id=_PROD_ID, meli_item_id="MLA777")


# ── patch_listing() ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_listing_updates_fields():
    listing = _mock_listing()
    pub, session = _publisher()

    r = MagicMock()
    r.scalar_one_or_none.return_value = listing
    session.execute = AsyncMock(return_value=r)

    updated = await pub.patch_listing(
        _LISTING_ID,
        sync_price=False,
        price_markup_pct=Decimal("5"),
    )

    assert updated.sync_price is False
    assert updated.price_markup_pct == Decimal("5")
    session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_patch_listing_not_found_raises():
    pub, session = _publisher()
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=r)

    with pytest.raises(ValueError, match="not found"):
        await pub.patch_listing(_LISTING_ID, sync_stock=False)


# ── enqueue_action() ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enqueue_pause_updates_status():
    listing = _mock_listing(status="active")
    pub, session = _publisher()

    r = MagicMock()
    r.scalar_one_or_none.return_value = listing
    session.execute = AsyncMock(return_value=r)

    await pub.enqueue_action(_LISTING_ID, MeliSyncKind.PAUSE)

    assert listing.status == "paused"
    added = session.add.call_args[0][0]
    assert isinstance(added, MeliSyncQueue)
    assert added.kind == MeliSyncKind.PAUSE
    assert added.status == MeliSyncStatus.PENDING


@pytest.mark.asyncio
async def test_enqueue_activate_updates_status():
    listing = _mock_listing(status="paused")
    pub, session = _publisher()

    r = MagicMock()
    r.scalar_one_or_none.return_value = listing
    session.execute = AsyncMock(return_value=r)

    await pub.enqueue_action(_LISTING_ID, MeliSyncKind.ACTIVATE)

    assert listing.status == "active"
