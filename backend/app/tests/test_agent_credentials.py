"""Tests for external-agent credential lifecycle."""

from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_credential import AgentCredential
from app.models.audit_log import AuditLog
from app.models.business import Business
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_create_tenant_credential_shows_secret_once_and_persists_hash_only(
    client: AsyncClient,
    db: AsyncSession,
    superadmin_user: User,
    business_a: Business,
):
    response = await client.post(
        "/api/admin/agent-credentials",
        headers=make_auth_header(superadmin_user),
        json={
            "name": "Stock agent",
            "surface": "tenant",
            "business_id": str(business_a.id),
            "scopes": ["products:read"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    raw_secret = payload["secret"]
    assert raw_secret.startswith("otag_v1_")
    assert payload["credential"]["secret_last4"] == raw_secret[-4:]

    list_response = await client.get(
        "/api/admin/agent-credentials",
        headers=make_auth_header(superadmin_user),
    )
    assert list_response.status_code == 200
    listed = list_response.json()["items"][0]
    assert listed["id"] == payload["credential"]["id"]
    assert "secret" not in listed

    result = await db.execute(select(AgentCredential))
    credential = result.scalar_one()
    assert credential.secret_hash != raw_secret
    assert credential.key_id in raw_secret
    assert credential.secret_last4 == raw_secret[-4:]


@pytest.mark.asyncio
async def test_rotate_invalidates_old_secret_and_revoke_blocks_credential(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)
    create_response = await client.post(
        "/api/admin/agent-credentials",
        headers=headers,
        json={
            "name": "Catalog agent",
            "surface": "tenant",
            "business_id": str(business_a.id),
            "scopes": ["products:read"],
        },
    )
    credential_id = create_response.json()["credential"]["id"]
    old_secret = create_response.json()["secret"]

    rotate_response = await client.post(
        f"/api/admin/agent-credentials/{credential_id}/rotate",
        headers=headers,
    )
    assert rotate_response.status_code == 200
    new_secret = rotate_response.json()["secret"]
    assert new_secret != old_secret

    assert (await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {old_secret}"},
    )).status_code == 401
    assert (await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {new_secret}"},
    )).status_code == 200

    revoke_response = await client.post(
        f"/api/admin/agent-credentials/{credential_id}/revoke",
        headers=headers,
    )
    assert revoke_response.status_code == 200
    assert (await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {new_secret}"},
    )).status_code == 401


@pytest.mark.asyncio
async def test_expired_credential_fails_closed(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
):
    response = await client.post(
        "/api/admin/agent-credentials",
        headers=make_auth_header(superadmin_user),
        json={
            "name": "Expired agent",
            "surface": "tenant",
            "business_id": str(business_a.id),
            "scopes": ["products:read"],
            "expires_at": (datetime.utcnow() - timedelta(minutes=1)).isoformat(),
        },
    )
    secret = response.json()["secret"]

    auth_response = await client.get(
        "/api/agent/tenant/health",
        headers={"Authorization": f"Bearer {secret}"},
    )

    assert auth_response.status_code == 401
    assert auth_response.json()["error"]["code"] == "agent_token_expired"


@pytest.mark.asyncio
async def test_create_credential_applies_default_ttl_and_audits_without_secret_material(
    client: AsyncClient,
    db: AsyncSession,
    superadmin_user: User,
    business_a: Business,
):
    before = datetime.utcnow()

    response = await client.post(
        "/api/admin/agent-credentials",
        headers=make_auth_header(superadmin_user),
        json={
            "name": "Default TTL agent",
            "surface": "tenant",
            "business_id": str(business_a.id),
            "scopes": ["products:read"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    raw_secret = payload["secret"]
    expires_at = datetime.fromisoformat(payload["credential"]["expires_at"])
    assert timedelta(days=364, hours=23) < expires_at - before < timedelta(days=365, minutes=1)

    audit = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.user_id == superadmin_user.id,
                AuditLog.action == "create",
                AuditLog.resource_type == "agent_credential",
            )
        )
    ).scalar_one()
    assert raw_secret not in str(audit.details)
    assert "secret_hash" not in str(audit.details)


@pytest.mark.asyncio
async def test_rotate_and_revoke_credentials_are_audited_and_revoked_cannot_rotate(
    client: AsyncClient,
    db: AsyncSession,
    superadmin_user: User,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)
    create_response = await client.post(
        "/api/admin/agent-credentials",
        headers=headers,
        json={
            "name": "Audited agent",
            "surface": "tenant",
            "business_id": str(business_a.id),
            "scopes": ["products:read"],
        },
    )
    credential_id = create_response.json()["credential"]["id"]

    rotate_response = await client.post(
        f"/api/admin/agent-credentials/{credential_id}/rotate",
        headers=headers,
    )
    assert rotate_response.status_code == 200
    rotated_secret = rotate_response.json()["secret"]

    revoke_response = await client.post(
        f"/api/admin/agent-credentials/{credential_id}/revoke",
        headers=headers,
    )
    assert revoke_response.status_code == 200

    rotate_revoked = await client.post(
        f"/api/admin/agent-credentials/{credential_id}/rotate",
        headers=headers,
    )
    assert rotate_revoked.status_code == 409

    audits = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.user_id == superadmin_user.id,
                AuditLog.resource_type == "agent_credential",
            )
            .order_by(AuditLog.created_at.asc())
        )
    ).scalars().all()
    actions = [audit.action for audit in audits]
    assert actions == ["create", "rotate", "revoke"]
    assert rotated_secret not in str([audit.details for audit in audits])
    assert "secret_hash" not in str([audit.details for audit in audits])
