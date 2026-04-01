"""
Tests para fallback de get_current_business en esquemas legacy.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.exc import ProgrammingError

from app.utils.security import get_current_business
from app.tests.conftest import make_auth_header


class _ScalarsResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class _ScalarOneResult:
    def __init__(self, item):
        self._item = item

    def scalar_one_or_none(self):
        return self._item


@pytest.mark.asyncio
async def test_get_current_business_falls_back_when_memberships_table_missing():
    user_id = uuid4()
    business_id = uuid4()

    current_user = SimpleNamespace(id=user_id)
    business = SimpleNamespace(id=business_id)

    missing_table_error = ProgrammingError(
        "SELECT * FROM tenant_memberships",
        {},
        Exception('relation "tenant_memberships" does not exist'),
    )

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                missing_table_error,
                _ScalarOneResult(business),
            ]
        )
    )

    resolved_business_id = await get_current_business(db=db, current_user=current_user)

    assert resolved_business_id == business_id
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_tenant_list_endpoints_smoke_ok(client, user_a, membership_a):
    headers = make_auth_header(user_a)

    categories_response = await client.get("/api/tenant/categories", headers=headers)
    suppliers_response = await client.get(
        "/api/tenant/suppliers?per_page=100", headers=headers
    )
    products_response = await client.get(
        "/api/tenant/products?page=1&per_page=20&search=", headers=headers
    )

    assert categories_response.status_code == 200
    assert suppliers_response.status_code == 200
    assert products_response.status_code == 200
