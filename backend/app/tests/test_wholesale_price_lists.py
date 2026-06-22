"""
Tests for wholesale price list functionality.

Covers:
  - list_type discriminator (service + router)
  - column_config JSON storage and retrieval
  - payment_conditions JSON storage, Decimal serialization fix
  - list_type filter in list_all() and GET /price-lists
  - duplicate field preservation for wholesale fields
  - router endpoints returning wholesale-specific fields
"""

from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.price_list import PriceList
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.price_list import PaymentCondition, PriceListCreate, PriceListItemCreate
from app.services.price_list_service import PriceListService
from app.tests.conftest import make_auth_header
from app.utils.acl import default_module_permissions, dump_module_permissions


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _enable_price_lists(db: AsyncSession, membership: TenantMembership) -> None:
    permissions = default_module_permissions(membership.role)
    permissions["price_lists"] = True
    membership.module_permissions = dump_module_permissions(permissions, membership.role)
    await db.commit()


def _wholesale_payload(
    name: str = "Lista Mayorista Test",
    visible_columns: list[str] | None = None,
    payment_conditions: list[dict] | None = None,
) -> dict:
    return {
        "name": name,
        "snapshot_date": str(date.today()),
        "currency": "ARS",
        "includes_tax": True,
        "status": "draft",
        "list_type": "wholesale",
        "items": [],
        "column_config": {"visible_columns": visible_columns or ["product_code", "description", "final_price"]},
        "payment_conditions": payment_conditions or [{"label": "Contado", "surcharge_pct": 0}],
    }


def _snapshot_payload(name: str = "Lista Snapshot Test") -> dict:
    return {
        "name": name,
        "snapshot_date": str(date.today()),
        "currency": "ARS",
        "includes_tax": True,
        "status": "draft",
        "list_type": "snapshot",
        "items": [],
    }


async def _make_wholesale_list(
    db: AsyncSession,
    business: Business,
    name: str = "WS List",
    conditions: list[PaymentCondition] | None = None,
    visible_columns: list[str] | None = None,
) -> PriceList:
    svc = PriceListService(db)
    data = PriceListCreate(
        name=name,
        snapshot_date=date.today(),
        list_type="wholesale",
        column_config={"visible_columns": visible_columns or ["product_code", "final_price"]},
        payment_conditions=conditions,
    )
    pl = await svc.create(data, business.id)
    await db.commit()
    return pl


async def _make_snapshot_list(db: AsyncSession, business: Business, name: str = "Snap List") -> PriceList:
    svc = PriceListService(db)
    data = PriceListCreate(name=name, snapshot_date=date.today(), list_type="snapshot")
    pl = await svc.create(data, business.id)
    await db.commit()
    return pl


# ---------------------------------------------------------------------------
# Service — list_type storage
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_create_wholesale_stores_list_type(db: AsyncSession, business_a: Business):
    pl = await _make_wholesale_list(db, business_a)
    assert pl.list_type == "wholesale"


@pytest.mark.asyncio
async def test_service_create_default_list_type_is_snapshot(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    data = PriceListCreate(name="Default Type", snapshot_date=date.today())
    pl = await svc.create(data, business_a.id)
    await db.commit()
    assert pl.list_type == "snapshot"


@pytest.mark.asyncio
async def test_service_create_snapshot_stores_list_type(db: AsyncSession, business_a: Business):
    pl = await _make_snapshot_list(db, business_a)
    assert pl.list_type == "snapshot"


# ---------------------------------------------------------------------------
# Service — column_config
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_create_wholesale_stores_column_config(db: AsyncSession, business_a: Business):
    cols = ["product_code", "description", "brand_name", "final_price"]
    pl = await _make_wholesale_list(db, business_a, visible_columns=cols)

    svc = PriceListService(db)
    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched is not None
    assert fetched.column_config is not None
    assert fetched.column_config["visible_columns"] == cols


@pytest.mark.asyncio
async def test_service_create_wholesale_column_config_none_allowed(db: AsyncSession, business_a: Business):
    svc = PriceListService(db)
    data = PriceListCreate(
        name="No Columns",
        snapshot_date=date.today(),
        list_type="wholesale",
        column_config=None,
    )
    pl = await svc.create(data, business_a.id)
    await db.commit()
    assert pl.column_config is None


# ---------------------------------------------------------------------------
# Service — payment_conditions (Decimal serialization)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_payment_conditions_stored_as_list(db: AsyncSession, business_a: Business):
    conditions = [
        PaymentCondition(label="Contado", surcharge_pct=Decimal("0")),
        PaymentCondition(label="30 días", surcharge_pct=Decimal("5")),
    ]
    pl = await _make_wholesale_list(db, business_a, conditions=conditions)

    svc = PriceListService(db)
    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched is not None
    stored = fetched.payment_conditions
    assert isinstance(stored, list)
    assert len(stored) == 2


@pytest.mark.asyncio
async def test_service_payment_conditions_surcharge_is_json_compatible(db: AsyncSession, business_a: Business):
    """Decimal('5.5') must be stored as a JSON-safe number, not a Decimal object."""
    conditions = [PaymentCondition(label="Contado", surcharge_pct=Decimal("5.5"))]
    pl = await _make_wholesale_list(db, business_a, conditions=conditions)

    svc = PriceListService(db)
    fetched = await svc.get_by_id(pl.id, business_a.id)
    stored = fetched.payment_conditions[0]
    # Value must be serializable (not a Decimal instance from Python)
    import json
    json.dumps(stored)  # must not raise TypeError
    assert str(stored["surcharge_pct"]) == "5.5"


@pytest.mark.asyncio
async def test_service_payment_conditions_labels_preserved(db: AsyncSession, business_a: Business):
    conditions = [
        PaymentCondition(label="Contado", surcharge_pct=Decimal("0")),
        PaymentCondition(label="7 días", surcharge_pct=Decimal("2")),
        PaymentCondition(label="15 días", surcharge_pct=Decimal("3")),
        PaymentCondition(label="30 días", surcharge_pct=Decimal("5")),
    ]
    pl = await _make_wholesale_list(db, business_a, conditions=conditions)

    svc = PriceListService(db)
    fetched = await svc.get_by_id(pl.id, business_a.id)
    labels = [c["label"] for c in fetched.payment_conditions]
    assert labels == ["Contado", "7 días", "15 días", "30 días"]


@pytest.mark.asyncio
async def test_service_payment_conditions_none_allowed(db: AsyncSession, business_a: Business):
    pl = await _make_wholesale_list(db, business_a, conditions=None)

    svc = PriceListService(db)
    fetched = await svc.get_by_id(pl.id, business_a.id)
    assert fetched.payment_conditions is None


# ---------------------------------------------------------------------------
# Service — list_type filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_list_filter_wholesale_only(db: AsyncSession, business_a: Business):
    await _make_wholesale_list(db, business_a, name="WS1")
    await _make_wholesale_list(db, business_a, name="WS2")
    await _make_snapshot_list(db, business_a, name="SNAP1")

    svc = PriceListService(db)
    results = await svc.list_all(business_a.id, list_type="wholesale")
    assert len(results) == 2
    assert all(pl.list_type == "wholesale" for pl in results)


@pytest.mark.asyncio
async def test_service_list_filter_snapshot_only(db: AsyncSession, business_a: Business):
    await _make_wholesale_list(db, business_a, name="WS1")
    await _make_snapshot_list(db, business_a, name="SNAP1")
    await _make_snapshot_list(db, business_a, name="SNAP2")

    svc = PriceListService(db)
    results = await svc.list_all(business_a.id, list_type="snapshot")
    assert len(results) == 2
    assert all(pl.list_type == "snapshot" for pl in results)


@pytest.mark.asyncio
async def test_service_list_no_filter_returns_both_types(db: AsyncSession, business_a: Business):
    await _make_wholesale_list(db, business_a, name="WS1")
    await _make_snapshot_list(db, business_a, name="SNAP1")

    svc = PriceListService(db)
    results = await svc.list_all(business_a.id)
    assert len(results) == 2
    types = {pl.list_type for pl in results}
    assert "wholesale" in types
    assert "snapshot" in types


@pytest.mark.asyncio
async def test_service_list_filter_tenant_isolation(
    db: AsyncSession, business_a: Business, business_b: Business
):
    await _make_wholesale_list(db, business_a, name="A-WS")
    await _make_wholesale_list(db, business_b, name="B-WS")

    svc = PriceListService(db)
    results_a = await svc.list_all(business_a.id, list_type="wholesale")
    assert len(results_a) == 1
    assert results_a[0].business_id == business_a.id


# ---------------------------------------------------------------------------
# Service — duplicate preserves wholesale fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_duplicate_preserves_list_type(db: AsyncSession, business_a: Business):
    pl = await _make_wholesale_list(db, business_a)

    svc = PriceListService(db)
    duped = await svc.duplicate(pl.id, business_a.id, name="WS Copia")
    await db.commit()

    assert duped.list_type == "wholesale"


@pytest.mark.asyncio
async def test_service_duplicate_preserves_column_config(db: AsyncSession, business_a: Business):
    cols = ["product_code", "description", "net_price"]
    pl = await _make_wholesale_list(db, business_a, visible_columns=cols)

    svc = PriceListService(db)
    duped = await svc.duplicate(pl.id, business_a.id, name="Copia columnas")
    await db.commit()

    assert duped.column_config is not None
    assert duped.column_config["visible_columns"] == cols


@pytest.mark.asyncio
async def test_service_duplicate_preserves_payment_conditions(db: AsyncSession, business_a: Business):
    conditions = [
        PaymentCondition(label="Contado", surcharge_pct=Decimal("0")),
        PaymentCondition(label="30 días", surcharge_pct=Decimal("5")),
    ]
    pl = await _make_wholesale_list(db, business_a, conditions=conditions)

    svc = PriceListService(db)
    duped = await svc.duplicate(pl.id, business_a.id, name="Copia condiciones")
    await db.commit()

    assert duped.payment_conditions is not None
    assert len(duped.payment_conditions) == 2
    labels = [c["label"] for c in duped.payment_conditions]
    assert "Contado" in labels
    assert "30 días" in labels


# ---------------------------------------------------------------------------
# Router — list_type query param filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_router_list_filter_returns_only_wholesale(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    headers = make_auth_header(user_a)

    await client.post("/api/tenant/price-lists", json=_wholesale_payload("WS-A"), headers=headers)
    await client.post("/api/tenant/price-lists", json=_snapshot_payload("SNAP-A"), headers=headers)

    resp = await client.get("/api/tenant/price-lists", params={"list_type": "wholesale"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["list_type"] == "wholesale"
    assert data[0]["name"] == "WS-A"


@pytest.mark.asyncio
async def test_router_list_filter_returns_only_snapshots(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    headers = make_auth_header(user_a)

    await client.post("/api/tenant/price-lists", json=_wholesale_payload("WS-B"), headers=headers)
    await client.post("/api/tenant/price-lists", json=_snapshot_payload("SNAP-B"), headers=headers)

    resp = await client.get("/api/tenant/price-lists", params={"list_type": "snapshot"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(pl["list_type"] == "snapshot" for pl in data)
    names = [pl["name"] for pl in data]
    assert "WS-B" not in names


# ---------------------------------------------------------------------------
# Router — create wholesale and inspect response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_router_create_wholesale_list_type_in_response(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    resp = await client.post(
        "/api/tenant/price-lists",
        json=_wholesale_payload("Mayorista Junio"),
        headers=make_auth_header(user_a),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["list_type"] == "wholesale"


@pytest.mark.asyncio
async def test_router_create_wholesale_column_config_in_response(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    cols = ["product_code", "description", "pack_quantity", "final_price"]
    resp = await client.post(
        "/api/tenant/price-lists",
        json=_wholesale_payload(visible_columns=cols),
        headers=make_auth_header(user_a),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["column_config"]["visible_columns"] == cols


@pytest.mark.asyncio
async def test_router_create_wholesale_payment_conditions_in_response(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    conditions = [
        {"label": "Contado", "surcharge_pct": 0},
        {"label": "30 días", "surcharge_pct": 5},
    ]
    resp = await client.post(
        "/api/tenant/price-lists",
        json=_wholesale_payload(payment_conditions=conditions),
        headers=make_auth_header(user_a),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["payment_conditions"] is not None
    assert len(data["payment_conditions"]) == 2
    labels = [c["label"] for c in data["payment_conditions"]]
    assert "Contado" in labels
    assert "30 días" in labels


@pytest.mark.asyncio
async def test_router_payment_conditions_surcharge_pct_is_numeric(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    """surcharge_pct must come back as a number (float/int), not a Decimal string."""
    await _enable_price_lists(db, membership_a)
    conditions = [{"label": "Contado", "surcharge_pct": 7.5}]
    resp = await client.post(
        "/api/tenant/price-lists",
        json=_wholesale_payload(payment_conditions=conditions),
        headers=make_auth_header(user_a),
    )
    assert resp.status_code == 201
    stored = resp.json()["payment_conditions"][0]
    assert isinstance(stored["surcharge_pct"], (int, float))
    assert float(stored["surcharge_pct"]) == 7.5


@pytest.mark.asyncio
async def test_router_get_detail_includes_wholesale_fields(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    headers = make_auth_header(user_a)
    cols = ["product_code", "brand_name", "final_price"]
    conditions = [{"label": "Contado", "surcharge_pct": 0}]
    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_wholesale_payload(visible_columns=cols, payment_conditions=conditions),
        headers=headers,
    )
    pl_id = create_resp.json()["id"]

    resp = await client.get(f"/api/tenant/price-lists/{pl_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["list_type"] == "wholesale"
    assert data["column_config"]["visible_columns"] == cols
    assert data["payment_conditions"][0]["label"] == "Contado"


@pytest.mark.asyncio
async def test_router_create_wholesale_without_conditions_succeeds(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)
    payload = {
        "name": "Sin condiciones",
        "snapshot_date": str(date.today()),
        "list_type": "wholesale",
        "items": [],
    }
    resp = await client.post("/api/tenant/price-lists", json=payload, headers=make_auth_header(user_a))
    assert resp.status_code == 201
    data = resp.json()
    assert data["list_type"] == "wholesale"
    assert data["payment_conditions"] is None
