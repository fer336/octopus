"""
Tests de enforcement ACL backend por módulo.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header
from app.utils.acl import default_module_permissions, dump_module_permissions


@pytest.mark.asyncio
async def test_products_endpoint_returns_403_when_module_permission_disabled(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    permissions = default_module_permissions(membership_a.role)
    permissions["products"] = False
    membership_a.module_permissions = dump_module_permissions(
        permissions, membership_a.role
    )
    await db.commit()

    response = await client.get(
        "/api/tenant/products",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 403
    assert "módulo 'products'" in response.json()["detail"]


@pytest.mark.asyncio
async def test_products_endpoint_returns_200_when_module_permission_enabled(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    permissions = default_module_permissions(membership_a.role)
    permissions["products"] = True
    membership_a.module_permissions = dump_module_permissions(
        permissions, membership_a.role
    )
    await db.commit()

    response = await client.get(
        "/api/tenant/products",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
