"""
Tests for PriceListService — B2B batch.
Uses SQLite in-memory via the shared test engine (conftest.py).
"""

from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.price_list import PriceList, PriceListItem
from app.models.product import Product
from app.models.user import User
from app.schemas.price_list import PriceListCreate, PriceListItemCreate
from app.services.price_list_service import PriceListService


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


async def make_price_list(
    db: AsyncSession,
    business: Business,
    name: str = "Test List",
    status: str = "draft",
) -> PriceList:
    pl = PriceList(
        business_id=business.id,
        name=name,
        snapshot_date=date.today(),
        status=status,
        currency="ARS",
        includes_tax=True,
    )
    db.add(pl)
    await db.commit()
    await db.refresh(pl)
    return pl


async def make_product(
    db: AsyncSession,
    business: Business,
    code: str = "PROD001",
    sale_price: Decimal = Decimal("121.00"),
    net_price: Decimal = Decimal("100.00"),
    iva_rate: Decimal = Decimal("21.00"),
) -> Product:
    p = Product(
        business_id=business.id,
        code=code,
        description=f"Product {code}",
        sale_price=sale_price,
        net_price=net_price,
        iva_rate=iva_rate,
        unit="unidad",
        cost_price=Decimal("50"),
        list_price=Decimal("100"),
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


# ---------------------------------------------------------------------------
# CRUD tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_price_list(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    data = PriceListCreate(
        name="Lista B2B",
        snapshot_date=date.today(),
        notes="Test",
        status="draft",
        currency="ARS",
        includes_tax=True,
        items=[PriceListItemCreate(product_code="COD01", unit_price=Decimal("100"))],
    )
    pl = await svc.create(data, business_a.id)
    await db.commit()

    assert pl.id is not None
    assert pl.name == "Lista B2B"
    assert pl.status == "draft"
    assert pl.currency == "ARS"

    count = await svc.get_item_count(pl.id)
    assert count == 1


@pytest.mark.asyncio
async def test_list_all_returns_business_lists(
    db: AsyncSession, business_a: Business, business_b: Business
):
    svc = PriceListService(db)
    await make_price_list(db, business_a, name="A1")
    await make_price_list(db, business_a, name="A2")
    await make_price_list(db, business_b, name="B1")

    lists_a = await svc.list_all(business_a.id)
    assert len(lists_a) == 2
    assert all(pl.business_id == business_a.id for pl in lists_a)


@pytest.mark.asyncio
async def test_list_all_status_filter(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    await make_price_list(db, business_a, name="Draft", status="draft")
    await make_price_list(db, business_a, name="Active", status="active")

    drafts = await svc.list_all(business_a.id, status="draft")
    assert len(drafts) == 1
    assert drafts[0].name == "Draft"


@pytest.mark.asyncio
async def test_get_by_id_returns_correct(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a, name="Specific")

    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched is not None
    assert fetched.id == pl.id


@pytest.mark.asyncio
async def test_delete_soft_deletes(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)

    result = await svc.delete(pl.id, business_a.id)
    await db.commit()

    assert result is True
    # Should not be visible after soft delete
    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched is None


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tenant_isolation_get(
    db: AsyncSession, business_a: Business, business_b: Business
):
    svc = PriceListService(db)
    pl_a = await make_price_list(db, business_a)

    # business_b should not be able to fetch business_a's list
    fetched = await svc.get_by_id(pl_a.id, business_b.id)
    assert fetched is None


@pytest.mark.asyncio
async def test_tenant_isolation_delete(
    db: AsyncSession, business_a: Business, business_b: Business
):
    svc = PriceListService(db)
    pl_a = await make_price_list(db, business_a)

    result = await svc.delete(pl_a.id, business_b.id)
    await db.commit()
    assert result is False

    # original should still exist
    fetched = await svc.get_by_id(pl_a.id, business_a.id)
    assert fetched is not None


# ---------------------------------------------------------------------------
# add_products
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_products_creates_items(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)
    product = await make_product(
        db,
        business_a,
        sale_price=Decimal("121.00"),
        iva_rate=Decimal("21.00"),
    )

    added = await svc.add_products(
        price_list_id=pl.id,
        business_id=business_a.id,
        product_ids=[product.id],
        default_discount_percent=Decimal("0"),
    )
    await db.commit()

    assert len(added) == 1
    item = added[0]
    assert item.product_id == product.id
    assert item.product_code == product.code
    assert item.base_price is not None
    assert item.final_price is not None
    assert item.net_price is not None


@pytest.mark.asyncio
async def test_add_products_no_duplicates(db: AsyncSession, business_a: Business):
    """Calling add_products twice with the same product should not duplicate."""
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)
    product = await make_product(db, business_a)

    await svc.add_products(pl.id, business_a.id, [product.id])
    await db.commit()
    added_second = await svc.add_products(pl.id, business_a.id, [product.id])
    await db.commit()

    assert len(added_second) == 0
    count = await svc.get_item_count(pl.id)
    assert count == 1


@pytest.mark.asyncio
async def test_add_products_rejects_non_draft(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a, status="active")
    product = await make_product(db, business_a)

    with pytest.raises(ValueError, match="draft"):
        await svc.add_products(pl.id, business_a.id, [product.id])


# ---------------------------------------------------------------------------
# bulk_adjust
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_adjust_increases_prices(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)
    product = await make_product(db, business_a, sale_price=Decimal("121.00"))

    await svc.add_products(pl.id, business_a.id, [product.id])
    await db.commit()

    count = await svc.bulk_adjust(pl.id, business_a.id, percent=Decimal("10"))
    await db.commit()

    assert count == 1

    refreshed = await svc.get_by_id(pl.id, business_a.id)
    assert refreshed is not None
    item = refreshed.items[0]
    # base_price was 121.00; +10% = 133.10
    assert item.base_price == Decimal("133.10")


@pytest.mark.asyncio
async def test_bulk_adjust_rejects_non_draft(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a, status="active")

    with pytest.raises(ValueError, match="draft"):
        await svc.bulk_adjust(pl.id, business_a.id, percent=Decimal("5"))


# ---------------------------------------------------------------------------
# duplicate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_increments_version(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)
    product = await make_product(db, business_a)
    await svc.add_products(pl.id, business_a.id, [product.id])
    await db.commit()

    duped = await svc.duplicate(pl.id, business_a.id, name="v2")
    await db.commit()

    assert duped.status == "draft"
    assert (duped.version or 1) == (pl.version or 1) + 1
    assert duped.previous_version_id == pl.id

    # same item count
    original_count = await svc.get_item_count(pl.id)
    duped_count = await svc.get_item_count(duped.id)
    assert duped_count == original_count


@pytest.mark.asyncio
async def test_duplicate_raises_if_not_found(db: AsyncSession, business_a: Business):
    import uuid

    svc = PriceListService(db)
    with pytest.raises(ValueError, match="not found"):
        await svc.duplicate(uuid.uuid4(), business_a.id, name="ghost")


# ---------------------------------------------------------------------------
# archive
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_archive_sets_status(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    pl = await make_price_list(db, business_a)

    result = await svc.archive(pl.id, business_a.id)
    await db.commit()

    assert result is True
    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched is not None
    assert fetched.status == "archived"
