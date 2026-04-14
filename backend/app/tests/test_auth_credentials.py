"""Tests de login por credenciales y vinculación OAuth por email."""

import pytest
from httpx import AsyncClient

from app.models.user import User
from app.services.auth_service import AuthService
from app.utils.security import hash_password


@pytest.mark.asyncio
async def test_login_with_credentials_success(client: AsyncClient, db):
    user = User(
        email="cred_user@test.com",
        name="Cred User",
        password_hash=hash_password("claveSegura123"),
        google_id=None,
        platform_role="tenant_user",
    )
    db.add(user)
    await db.commit()

    response = await client.post(
        "/auth/login",
        json={"email": "cred_user@test.com", "password": "claveSegura123"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["refresh_token"]
    assert payload["user"]["email"] == "cred_user@test.com"


@pytest.mark.asyncio
async def test_login_with_credentials_invalid_password(client: AsyncClient, db):
    user = User(
        email="cred_fail@test.com",
        name="Cred Fail",
        password_hash=hash_password("claveSegura123"),
        google_id=None,
        platform_role="tenant_user",
    )
    db.add(user)
    await db.commit()

    response = await client.post(
        "/auth/login",
        json={"email": "cred_fail@test.com", "password": "otraClave"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_google_login_links_existing_user_by_email(db):
    user = User(
        email="link@test.com",
        name="Usuario Local",
        password_hash=hash_password("claveSegura123"),
        google_id=None,
        platform_role="tenant_user",
    )
    db.add(user)
    await db.commit()

    service = AuthService(db)
    linked = await service.get_or_create_user(
        {
            "google_id": "google-linked-123",
            "email": "link@test.com",
            "name": "Usuario Google",
            "picture": "",
        }
    )

    assert linked.id == user.id
    assert linked.google_id == "google-linked-123"
