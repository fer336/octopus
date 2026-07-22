"""Tests for external-agent authentication and authorization."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_credential import AgentSurface
from app.models.business import Business
from app.models.user import User
from app.services.agent_credential_service import AgentCredentialService
from app.utils.agent_security import _agent_token_pepper, validate_agent_security_settings


def test_agent_token_pepper_has_no_implicit_test_fallback(monkeypatch):
    monkeypatch.delenv("AGENT_TOKEN_PEPPER", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "test")

    with pytest.raises(RuntimeError, match="AGENT_TOKEN_PEPPER"):
        _agent_token_pepper()


def test_agent_security_settings_fail_fast_outside_tests(monkeypatch):
    monkeypatch.delenv("AGENT_TOKEN_PEPPER", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(RuntimeError, match="AGENT_TOKEN_PEPPER"):
        validate_agent_security_settings()


def test_agent_security_settings_accept_explicit_test_pepper(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("AGENT_TOKEN_PEPPER", "explicit-test-pepper")

    validate_agent_security_settings()


@pytest.mark.asyncio
async def test_token_parse_hash_and_tenant_principal_identity(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
):
    created = await AgentCredentialService(db).create_credential(
        name="Tenant agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    await db.commit()

    response = await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {created.secret}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["actor"]["type"] == "agent"
    assert payload["actor"]["agent_id"] == str(created.credential.id)
    assert payload["business_id"] == str(business_a.id)
    assert "user_id" not in payload["actor"]


@pytest.mark.asyncio
async def test_wrong_surface_and_missing_scope_use_standard_error_body(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    service = AgentCredentialService(db)
    tenant = await service.create_credential(
        name="Tenant agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    no_scope = await service.create_credential(
        name="No product scope",
        surface=AgentSurface.TENANT,
        scopes=["clients:read"],
        business_id=business_b.id,
    )
    await db.commit()

    wrong_surface = await client.get(
        "/api/agent/admin/health",
        headers={"Authorization": f"Bearer {tenant.secret}"},
    )
    assert wrong_surface.status_code == 403
    assert wrong_surface.json()["error"]["code"] == "agent_wrong_surface"
    assert wrong_surface.json()["error"]["correlation_id"]

    missing_scope = await client.get(
        "/api/agent/tenant/products",
        headers={"Authorization": f"Bearer {no_scope.secret}"},
    )
    assert missing_scope.status_code == 403
    assert missing_scope.json()["error"]["code"] == "agent_missing_scope"
    assert missing_scope.json()["error"]["correlation_id"]


@pytest.mark.asyncio
async def test_platform_credential_cannot_call_tenant_surface(
    client: AsyncClient,
    db: AsyncSession,
):
    created = await AgentCredentialService(db).create_credential(
        name="Platform agent",
        surface=AgentSurface.PLATFORM,
        scopes=["admin:businesses:read"],
        business_id=None,
    )
    await db.commit()

    response = await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {created.secret}"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "agent_wrong_surface"


@pytest.mark.asyncio
async def test_agent_error_responses_include_sanitized_correlation_header(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    valid = await AgentCredentialService(db).create_credential(
        name="Valid agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    missing_scope = await AgentCredentialService(db).create_credential(
        name="Missing scope agent",
        surface=AgentSurface.TENANT,
        scopes=["clients:read"],
        business_id=business_b.id,
    )
    await db.commit()

    invalid = await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": "Bearer not-a-token", "X-Correlation-ID": "invalid token/corr!"},
    )
    assert invalid.status_code == 401
    assert invalid.headers["X-Correlation-ID"] == "invalid-token-corr-"
    assert invalid.json()["error"]["correlation_id"] == "invalid-token-corr-"

    wrong_surface = await client.get(
        "/api/agent/admin/health",
        headers={"Authorization": f"Bearer {valid.secret}", "X-Correlation-ID": "wrong_surface"},
    )
    assert wrong_surface.status_code == 403
    assert wrong_surface.headers["X-Correlation-ID"] == "wrong_surface"

    too_long = "x" * 200
    denied = await client.get(
        "/api/agent/tenant/products",
        headers={"Authorization": f"Bearer {missing_scope.secret}", "X-Correlation-ID": too_long},
    )
    assert denied.status_code == 403
    assert len(denied.headers["X-Correlation-ID"]) == 80
    assert denied.json()["error"]["correlation_id"] == denied.headers["X-Correlation-ID"]


@pytest.mark.asyncio
async def test_non_agent_http_errors_keep_existing_detail_shape_and_no_agent_header(
    client: AsyncClient,
    user_a: User,
):
    response = await client.get("/api/admin/tenants", headers={"Authorization": "Bearer invalid-user-token"})

    assert response.status_code == 401
    assert set(response.json()) == {"detail"}
    assert "X-Correlation-ID" not in response.headers
