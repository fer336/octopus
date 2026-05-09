"""
Tests mínimos del módulo de usuarios en CMS admin.
"""

from datetime import timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.services.auth_service import AuthService
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_superadmin_can_list_users(
    client: AsyncClient,
    superadmin_user: User,
    user_a: User,
    membership_a: TenantMembership,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)
    response = await client.get("/api/admin/users", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert "users" in payload
    assert payload["total"] >= 2
    emails = [item["email"] for item in payload["users"]]
    assert user_a.email in emails
    listed_user_a = next(
        item for item in payload["users"] if item["email"] == user_a.email
    )
    assert listed_user_a["businesses"] == [
        {
            "id": str(business_a.id),
            "name": business_a.name,
        }
    ]


@pytest.mark.asyncio
async def test_superadmin_can_create_user_and_handle_duplicate_email(
    client: AsyncClient,
    superadmin_user: User,
):
    headers = make_auth_header(superadmin_user)

    create_response = await client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "email": "nuevo_usuario@test.com",
            "name": "Nuevo Usuario",
            "password": "claveSegura123",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["email"] == "nuevo_usuario@test.com"
    assert created["platform_role"] == "tenant_user"
    assert created["is_active"] is True

    duplicate_response = await client.post(
        "/api/admin/users",
        headers=headers,
        json={"email": "nuevo_usuario@test.com", "password": "claveSegura123"},
    )
    assert duplicate_response.status_code == 409


@pytest.mark.asyncio
async def test_google_user_registration_does_not_create_business(
    db: AsyncSession,
):
    service = AuthService(db)

    user = await service.get_or_create_user(
        {
            "google_id": "google_new_without_business",
            "email": "sin_comercio@test.com",
            "name": "Sin Comercio",
            "picture": "",
        }
    )

    assert user.email == "sin_comercio@test.com"

    businesses_result = await db.execute(
        select(Business).where(Business.owner_id == user.id)
    )
    assert businesses_result.scalars().all() == []

    memberships_result = await db.execute(
        select(TenantMembership).where(TenantMembership.user_id == user.id)
    )
    assert memberships_result.scalars().all() == []


@pytest.mark.asyncio
async def test_superadmin_can_create_tenant_without_owner_and_assign_later(
    client: AsyncClient,
    superadmin_user: User,
    user_b: User,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    create_response = await client.post(
        "/api/admin/tenants",
        headers=headers,
        json={
            "name": "Comercio Manual",
            "cuit": "30-33333333-3",
            "tax_condition": "Monotributista",
        },
    )
    assert create_response.status_code == 201
    tenant_payload = create_response.json()
    assert tenant_payload["owner_email"] == "Sin usuario asignado"

    tenant_id = tenant_payload["id"]
    business_result = await db.execute(select(Business).where(Business.id == UUID(tenant_id)))
    business = business_result.scalar_one()
    assert business.owner_id is None
    assert business.ai_agent_enabled is False
    assert business.linear_sync_enabled is False
    assert business.current_account_mode == "disabled"
    assert business.invoicing_enabled is False
    assert business.receipts_enabled is False
    assert business.quotation_enabled is True
    assert business.inventory_enabled is False
    assert business.stockpile_enabled is False
    assert business.price_update_enabled is False
    assert business.reports_enabled is False
    assert business.sql_backup_enabled is False

    assign_response = await client.post(
        f"/api/admin/tenants/{tenant_id}/users",
        headers=headers,
        json={"email": user_b.email, "role": "owner"},
    )
    assert assign_response.status_code == 201
    assert assign_response.json()["user"]["membership_role"] == "owner"

    await db.refresh(business)
    assert business.owner_id == user_b.id

    delete_response = await client.delete(
        f"/api/admin/tenants/{tenant_id}",
        headers=headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    await db.refresh(business)
    assert business.deleted_at is not None

    memberships_result = await db.execute(
        select(TenantMembership).where(TenantMembership.business_id == UUID(tenant_id))
    )
    assert memberships_result.scalars().all() == []


@pytest.mark.asyncio
async def test_superadmin_can_assign_user_to_tenant_by_email(
    client: AsyncClient,
    superadmin_user: User,
    user_b: User,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)

    response = await client.post(
        f"/api/admin/tenants/{business_a.id}/users",
        headers=headers,
        json={"email": user_b.email},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] is True
    assert payload["user"]["email"] == user_b.email
    assert payload["user"]["membership_role"] == "manager"
    assert isinstance(payload["user"]["module_permissions"], dict)
    assert payload["user"]["module_permissions"].get("sales") is True


@pytest.mark.asyncio
async def test_assign_user_to_tenant_is_idempotent(
    client: AsyncClient,
    superadmin_user: User,
    user_b: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)
    url = f"/api/admin/tenants/{business_a.id}/users"

    first = await client.post(url, headers=headers, json={"email": user_b.email})
    assert first.status_code == 201
    assert first.json()["created"] is True

    second = await client.post(url, headers=headers, json={"email": user_b.email})
    assert second.status_code == 200
    assert second.json()["created"] is False

    result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user_b.id,
            TenantMembership.business_id == business_a.id,
        )
    )
    memberships = result.scalars().all()
    assert len(memberships) == 1


@pytest.mark.asyncio
async def test_superadmin_can_update_user_status(
    client: AsyncClient,
    superadmin_user: User,
    user_a: User,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.patch(
        f"/api/admin/users/{user_a.id}/status",
        headers=headers,
        json={"is_active": False},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(user_a.id)
    assert payload["is_active"] is False

    await db.refresh(user_a)
    assert user_a.is_active is False


@pytest.mark.asyncio
async def test_superadmin_can_activate_trial_for_tenant_user(
    client: AsyncClient,
    superadmin_user: User,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.post(
        f"/api/admin/tenants/{business_a.id}/users/{user_a.id}/trial",
        headers=headers,
        json={"days": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_status"] == "trial"
    assert payload["blocked_reason"] is None
    assert payload["access_starts_at"] is not None
    assert payload["access_ends_at"] is not None
    assert payload["days_remaining"] == 30

    result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user_a.id,
            TenantMembership.business_id == business_a.id,
        )
    )
    membership = result.scalar_one()
    await db.refresh(membership)

    assert membership.access_status == "trial"
    assert membership.access_starts_at is not None
    assert membership.access_ends_at is not None

    delta = membership.access_ends_at - membership.access_starts_at
    assert timedelta(days=29, hours=23) <= delta <= timedelta(days=30, minutes=1)


@pytest.mark.asyncio
async def test_superadmin_can_get_feature_flags(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)

    response = await client.get(
        f"/api/admin/tenants/{business_a.id}/features", headers=headers
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["business_id"] == str(business_a.id)
    assert payload["ai_agent_enabled"] is False
    assert payload["current_account_mode"] == "disabled"
    assert payload["invoicing_enabled"] is True
    assert payload["receipts_enabled"] is True
    assert payload["price_update_enabled"] is True
    assert payload["reports_enabled"] is True


@pytest.mark.asyncio
async def test_superadmin_can_update_feature_flags(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.patch(
        f"/api/admin/tenants/{business_a.id}/features",
        headers=headers,
        json={"ai_agent_enabled": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ai_agent_enabled"] is True
    assert payload["current_account_mode"] == "disabled"
    assert payload["invoicing_enabled"] is True
    assert payload["receipts_enabled"] is True
    assert payload["price_update_enabled"] is True
    assert payload["reports_enabled"] is True

    await db.refresh(business_a)
    assert business_a.ai_agent_enabled is True


@pytest.mark.asyncio
async def test_superadmin_can_update_current_account_mode_feature_flag(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.patch(
        f"/api/admin/tenants/{business_a.id}/features",
        headers=headers,
        json={"current_account_mode": "manual"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["current_account_mode"] == "manual"
    assert payload["invoicing_enabled"] is True
    assert payload["receipts_enabled"] is True

    await db.refresh(business_a)
    assert business_a.current_account_mode == "manual"


@pytest.mark.asyncio
async def test_superadmin_can_update_new_module_feature_flags(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.patch(
        f"/api/admin/tenants/{business_a.id}/features",
        headers=headers,
        json={
            "invoicing_enabled": False,
            "receipts_enabled": False,
            "price_update_enabled": False,
            "reports_enabled": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["invoicing_enabled"] is False
    assert payload["receipts_enabled"] is False
    assert payload["price_update_enabled"] is False
    assert payload["reports_enabled"] is False

    await db.refresh(business_a)
    assert business_a.invoicing_enabled is False
    assert business_a.receipts_enabled is False
    assert business_a.price_update_enabled is False
    assert business_a.reports_enabled is False


@pytest.mark.asyncio
async def test_superadmin_can_update_tenant_user_permissions(
    client: AsyncClient,
    superadmin_user: User,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    headers = make_auth_header(superadmin_user)

    update_response = await client.patch(
        f"/api/admin/tenants/{business_a.id}/users/{user_a.id}/permissions",
        headers=headers,
        json={
            "module_permissions": {
                "dashboard": True,
                "sales": True,
                "reports": False,
                "inventory": False,
            }
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["id"] == str(user_a.id)
    assert payload["module_permissions"]["dashboard"] is True
    assert payload["module_permissions"]["sales"] is True
    assert payload["module_permissions"]["reports"] is False
    assert payload["module_permissions"]["inventory"] is False
