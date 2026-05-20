"""
Integration tests for ARCA configuration endpoints.
Covers GET /arca/config/{id} and PUT /arca/config/{id} access control.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_get_arca_config_returns_config_structure(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """GET /arca/config returns all expected fields."""
    headers = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/arca/config/{business_a.id}",
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert "afipsdk_access_token_configured" in data
    assert "afip_cert_configured" in data
    assert "afip_key_configured" in data
    assert "arca_environment" in data
    assert "sale_point" in data


@pytest.mark.asyncio
async def test_get_arca_config_no_token_configured(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """When no token is set, afipsdk_access_token_configured is False."""
    business_a.afipsdk_access_token = None
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/arca/config/{business_a.id}",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["afipsdk_access_token_configured"] is False


@pytest.mark.asyncio
async def test_get_arca_config_with_token_configured(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """When token is set, afipsdk_access_token_configured is True."""
    business_a.afipsdk_access_token = "test_token_abc123"
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/arca/config/{business_a.id}",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["afipsdk_access_token_configured"] is True


@pytest.mark.asyncio
async def test_get_arca_config_cross_tenant_forbidden(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    business_b: Business,
    membership_a: TenantMembership,
    membership_b: TenantMembership,
):
    """User A cannot read config of business B."""
    headers = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/arca/config/{business_b.id}",
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_put_arca_config_always_403_for_tenant(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """PUT /arca/config is blocked for tenants — must be managed from CMS."""
    headers = make_auth_header(user_a)
    response = await client.put(
        f"/api/tenant/arca/config/{business_a.id}",
        headers=headers,
        json={"afipsdk_access_token": "new_token"},
    )

    assert response.status_code == 403
    assert "superadmin" in response.json()["detail"].lower() or "cms" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_arca_config_default_environment_is_testing(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """Default ARCA environment is 'testing'."""
    headers = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/arca/config/{business_a.id}",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["arca_environment"] == "testing"
