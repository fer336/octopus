"""Tests para bloqueo/habilitación del Agente IA por feature flag."""

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header
from app.utils.security import get_current_business_with_ai_enabled


@pytest.mark.asyncio
async def test_ai_history_is_blocked_when_feature_disabled(
    client: AsyncClient,
    user_a: User,
    membership_a: TenantMembership,
):
    headers = make_auth_header(user_a)

    response = await client.get("/api/tenant/ai/history", headers=headers)

    assert response.status_code == 403
    payload = response.json()
    assert payload["detail"] == "El Agente IA no está habilitado para este tenant"


@pytest.mark.asyncio
async def test_ai_history_works_when_feature_enabled(
    business_a: Business,
    db: AsyncSession,
):
    # Verificación directa de dependency para no depender de servicios externos de IA
    business_a.ai_agent_enabled = True
    await db.commit()

    business_id = await get_current_business_with_ai_enabled(
        current_business=business_a.id,
        db=db,
    )

    assert str(business_id) == str(business_a.id)


@pytest.mark.asyncio
async def test_ai_dependency_blocks_when_feature_disabled(
    business_a: Business,
    db: AsyncSession,
):
    business_a.ai_agent_enabled = False
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await get_current_business_with_ai_enabled(
            current_business=business_a.id,
            db=db,
        )

    assert exc.value.status_code == 403
