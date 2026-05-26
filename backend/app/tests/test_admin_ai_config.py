"""Tests de configuración IA desde CMS admin."""

import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_provider_config import AIProviderConfig
from app.models.business import Business
from app.models.user import User
from app.services.llm_factory import LLMFactory
from app.tests.conftest import make_auth_header
from app.utils.crypto import decrypt_api_key


@pytest.fixture(autouse=True)
def set_encryption_key(monkeypatch):
    """Configura una clave de cifrado estable para estos tests."""
    monkeypatch.setenv("APP_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.mark.asyncio
async def test_superadmin_can_upsert_tenant_ai_config_without_exposing_key(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    response = await client.put(
        f"/api/admin/tenants/{business_a.id}/ai-config/openai",
        headers=headers,
        json={
            "api_key": "sk-test-secret-1234",
            "display_name": "Cuenta OpenAI",
            "default_model": "gpt-4o-mini",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "openai"
    assert payload["api_key_configured"] is True
    assert payload["api_key_last4"] == "1234"
    assert "api_key" not in payload
    assert "api_key_encrypted" not in payload
    assert payload["is_valid"] is False

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_a.id,
            AIProviderConfig.provider == "openai",
        )
    )
    config = result.scalar_one()
    assert decrypt_api_key(config.api_key_encrypted) == "sk-test-secret-1234"


@pytest.mark.asyncio
async def test_superadmin_can_activate_tenant_ai_provider(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
):
    headers = make_auth_header(superadmin_user)

    create_response = await client.put(
        f"/api/admin/tenants/{business_a.id}/ai-config/gemini",
        headers=headers,
        json={"api_key": "gemini-secret-5678", "default_model": "gemini-2.5-flash"},
    )
    assert create_response.status_code == 200

    activate_response = await client.patch(
        f"/api/admin/tenants/{business_a.id}/ai-config/gemini/activate",
        headers=headers,
    )

    assert activate_response.status_code == 200
    payload = activate_response.json()
    assert payload["provider"] == "gemini"
    assert payload["is_active"] is True

    summary_response = await client.get(
        f"/api/admin/tenants/{business_a.id}/ai-config",
        headers=headers,
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["active_provider"] == "gemini"
    assert summary["active_model"] == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_superadmin_can_validate_tenant_ai_provider_with_saved_key(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = make_auth_header(superadmin_user)

    async def fake_validate_key(
        provider: str,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
    ) -> tuple[bool, str]:
        assert provider == "anthropic"
        assert api_key == "anthropic-secret-9999"
        assert model == "claude-sonnet-4-5"
        return True, "Conexión exitosa"

    monkeypatch.setattr(LLMFactory, "validate_key", fake_validate_key)

    create_response = await client.put(
        f"/api/admin/tenants/{business_a.id}/ai-config/anthropic",
        headers=headers,
        json={
            "api_key": "anthropic-secret-9999",
            "default_model": "claude-sonnet-4-5",
        },
    )
    assert create_response.status_code == 200

    validate_response = await client.post(
        f"/api/admin/tenants/{business_a.id}/ai-config/anthropic/validate",
        headers=headers,
    )

    assert validate_response.status_code == 200
    payload = validate_response.json()
    assert payload["provider"] == "anthropic"
    assert payload["is_valid"] is True
    assert payload["suggested_models"]


@pytest.mark.asyncio
async def test_superadmin_can_soft_delete_tenant_ai_provider(
    client: AsyncClient,
    superadmin_user: User,
    business_a: Business,
    db: AsyncSession,
):
    headers = make_auth_header(superadmin_user)

    create_response = await client.put(
        f"/api/admin/tenants/{business_a.id}/ai-config/openrouter",
        headers=headers,
        json={"api_key": "openrouter-secret-0000"},
    )
    assert create_response.status_code == 200

    delete_response = await client.delete(
        f"/api/admin/tenants/{business_a.id}/ai-config/openrouter",
        headers=headers,
    )
    assert delete_response.status_code == 204

    result = await db.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_a.id,
            AIProviderConfig.provider == "openrouter",
        )
    )
    config = result.scalar_one()
    assert config.deleted_at is not None
    assert config.is_active is False
