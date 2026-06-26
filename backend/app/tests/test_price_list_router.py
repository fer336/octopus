"""
Router tests for Price Lists — B2B batch.
Uses SQLite in-memory via the shared test engine (conftest.py).
"""

from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.price_list import PriceList
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header
from app.utils.acl import default_module_permissions, dump_module_permissions


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _enable_price_lists(db: AsyncSession, membership: TenantMembership) -> None:
    """Grant price_lists permission on a membership and flush to DB."""
    permissions = default_module_permissions(membership.role)
    permissions["price_lists"] = True
    membership.module_permissions = dump_module_permissions(permissions, membership.role)
    await db.commit()


def _create_payload(name: str = "Test List B2B") -> dict:
    return {
        "name": name,
        "snapshot_date": str(date.today()),
        "currency": "ARS",
        "includes_tax": True,
        "status": "draft",
        "items": [],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_price_list(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    response = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("Summer B2B List"),
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Summer B2B List"
    assert data["currency"] == "ARS"
    assert data["status"] == "draft"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_price_lists(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    # Create two lists
    await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("List One"),
        headers=make_auth_header(user_a),
    )
    await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("List Two"),
        headers=make_auth_header(user_a),
    )

    response = await client.get(
        "/api/tenant/price-lists",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    names = [pl["name"] for pl in response.json()]
    assert "List One" in names
    assert "List Two" in names


@pytest.mark.asyncio
async def test_get_price_list_detail(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("Detail List"),
        headers=make_auth_header(user_a),
    )
    pl_id = create_resp.json()["id"]

    response = await client.get(
        f"/api/tenant/price-lists/{pl_id}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["id"] == pl_id
    assert response.json()["name"] == "Detail List"


@pytest.mark.asyncio
async def test_update_price_list(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("Original Name"),
        headers=make_auth_header(user_a),
    )
    pl_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/api/tenant/price-lists/{pl_id}",
        json={"name": "Updated Name"},
        headers=make_auth_header(user_a),
    )

    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_archive_price_list(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("To Archive"),
        headers=make_auth_header(user_a),
    )
    pl_id = create_resp.json()["id"]

    archive_resp = await client.post(
        f"/api/tenant/price-lists/{pl_id}/archive",
        headers=make_auth_header(user_a),
    )

    assert archive_resp.status_code == 204

    # Verify it is archived
    detail_resp = await client.get(
        f"/api/tenant/price-lists/{pl_id}",
        headers=make_auth_header(user_a),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_duplicate_price_list(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("Original for Dup"),
        headers=make_auth_header(user_a),
    )
    pl_id = create_resp.json()["id"]

    dup_resp = await client.post(
        f"/api/tenant/price-lists/{pl_id}/duplicate",
        json={"name": "Duplicated List"},
        headers=make_auth_header(user_a),
    )

    assert dup_resp.status_code == 201
    dup_data = dup_resp.json()
    assert dup_data["name"] == "Duplicated List"
    assert dup_data["id"] != pl_id


@pytest.mark.asyncio
async def test_get_nonexistent_price_list_returns_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    await _enable_price_lists(db, membership_a)

    response = await client.get(
        f"/api/tenant/price-lists/{uuid4()}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_business_b_cannot_see_business_a_list(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    user_b: User,
    membership_a: TenantMembership,
    membership_b: TenantMembership,
):
    """business_b user cannot access business_a price lists — expects 404."""
    await _enable_price_lists(db, membership_a)
    await _enable_price_lists(db, membership_b)

    create_resp = await client.post(
        "/api/tenant/price-lists",
        json=_create_payload("Tenant A List"),
        headers=make_auth_header(user_a),
    )
    pl_id = create_resp.json()["id"]

    # user_b requests business_a's list — should not find it
    response = await client.get(
        f"/api/tenant/price-lists/{pl_id}",
        headers=make_auth_header(user_b),
    )

    assert response.status_code == 404
