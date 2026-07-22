"""Tests for Unit 1 tenant agent facade endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.agent_credential import AgentSurface
from app.models.business import Business
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.services.agent_credential_service import AgentCredentialService


@pytest.mark.asyncio
async def test_agent_products_are_bound_to_credential_business_and_ignore_request_business_id(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    product_a = Product(code="A-001", description="Tenant A product", business_id=business_a.id)
    product_b = Product(code="B-001", description="Tenant B product", business_id=business_b.id)
    db.add_all([product_a, product_b])
    await db.flush()
    db.add(ProductLot(product_id=product_a.id, business_id=business_a.id, quantity=3, initial_quantity=3))
    db.add(ProductLot(product_id=product_b.id, business_id=business_b.id, quantity=5, initial_quantity=5))
    created = await AgentCredentialService(db).create_credential(
        name="Tenant A agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    await db.commit()

    response = await client.get(
        f"/api/agent/tenant/products?business_id={business_b.id}",
        headers={"Authorization": f"Bearer {created.secret}", "X-Correlation-ID": "corr-products"},
    )

    assert response.status_code == 200
    payload = response.json()
    codes = [item["code"] for item in payload["items"]]
    assert codes == ["A-001"]
    assert response.headers["X-Correlation-ID"] == "corr-products"


@pytest.mark.asyncio
async def test_agent_product_detail_uses_cross_tenant_not_found_behavior(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    product_b = Product(code="B-001", description="Tenant B product", business_id=business_b.id)
    db.add(product_b)
    await db.flush()
    created = await AgentCredentialService(db).create_credential(
        name="Tenant A agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    await db.commit()

    response = await client.get(
        f"/api/agent/tenant/products/{product_b.id}",
        headers={"Authorization": f"Bearer {created.secret}"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "agent_resource_not_found"


@pytest.mark.asyncio
async def test_agent_requests_record_allowed_and_denied_audit_with_correlation(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    allowed = await AgentCredentialService(db).create_credential(
        name="Allowed agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    denied = await AgentCredentialService(db).create_credential(
        name="Denied agent",
        surface=AgentSurface.TENANT,
        scopes=["clients:read"],
        business_id=business_b.id,
    )
    await db.commit()

    await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {allowed.secret}", "X-Correlation-ID": "corr-ok"},
    )
    await client.get(
        "/api/agent/tenant/products",
        headers={"Authorization": f"Bearer {denied.secret}", "X-Correlation-ID": "corr-denied"},
    )

    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.asc()))
    audits = result.scalars().all()
    outcomes = {audit.correlation_id: audit.outcome for audit in audits}
    assert outcomes["corr-ok"] == "allowed"
    assert outcomes["corr-denied"] == "denied"
    denied_audit = next(audit for audit in audits if audit.correlation_id == "corr-denied")
    assert denied_audit.actor_type == "agent"
    assert denied_audit.agent_id == denied.credential.id
    assert denied_audit.scopes_evaluated == ["products:read"]


@pytest.mark.asyncio
async def test_successful_read_survives_best_effort_audit_failure(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    monkeypatch: pytest.MonkeyPatch,
):
    created = await AgentCredentialService(db).create_credential(
        name="Audit failure allowed agent",
        surface=AgentSurface.TENANT,
        scopes=["products:read"],
        business_id=business_a.id,
    )
    await db.commit()

    async def broken_audit(*args, **kwargs):
        raise RuntimeError("simulated audit outage")

    monkeypatch.setattr("app.routers.agent_tenant.log_agent_audit", broken_audit)

    response = await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {created.secret}", "X-Correlation-ID": "audit-ok"},
    )

    assert response.status_code == 200
    assert response.headers["X-Correlation-ID"] == "audit-ok"


@pytest.mark.asyncio
async def test_expected_scope_denial_survives_best_effort_audit_failure(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    monkeypatch: pytest.MonkeyPatch,
):
    created = await AgentCredentialService(db).create_credential(
        name="Audit failure denied agent",
        surface=AgentSurface.TENANT,
        scopes=["clients:read"],
        business_id=business_a.id,
    )
    await db.commit()

    async def broken_audit(*args, **kwargs):
        raise RuntimeError("simulated audit outage")

    monkeypatch.setattr("app.utils.agent_acl.log_agent_audit", broken_audit)

    response = await client.get(
        "/api/agent/tenant/products",
        headers={"Authorization": f"Bearer {created.secret}", "X-Correlation-ID": "audit-denied"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "agent_missing_scope"
    assert response.headers["X-Correlation-ID"] == "audit-denied"
