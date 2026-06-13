"""
Tests del OAuth router de Mercado Libre.

Cubre:
  - GET /api/v1/meli/oauth/authorize-url → URL bien formada con state válido
  - GET /api/v1/meli/oauth/callback → upsert de credenciales, redirect a frontend
  - GET /api/v1/meli/status → connected / disconnected / error
  - DELETE /api/v1/meli/connection → marca revoked

Sin DB real ni credenciales de ML.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response as HttpxResponse
from jose import jwt

from app.config import get_settings
from app.main import app
from app.models.meli import MeliCredentialStatus, MeliCredentials
from app.utils.security import get_current_business, get_current_user

settings = get_settings()

_BUSINESS_ID = uuid.uuid4()
_USER_ID = uuid.uuid4()
_MELI_USER_ID = 987654321
_MELI_NICKNAME = "SELLER_TEST"


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _fake_user():
    u = MagicMock()
    u.id = _USER_ID
    return u


def _override_auth():
    """Sobreescribe las deps de auth para todos los tests."""
    app.dependency_overrides[get_current_user] = lambda: _fake_user()
    app.dependency_overrides[get_current_business] = lambda: _BUSINESS_ID


def _clear_overrides():
    app.dependency_overrides.clear()


def _make_db_mock(cred=None):
    """AsyncSession mock que devuelve `cred` en scalar_one_or_none."""
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = cred

    db = AsyncMock()
    db.execute = AsyncMock(return_value=scalar_result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _make_cred(
    status: MeliCredentialStatus = MeliCredentialStatus.CONNECTED,
) -> MeliCredentials:
    from cryptography.fernet import Fernet

    f = Fernet(Fernet.generate_key())
    cred = MeliCredentials()
    cred.id = uuid.uuid4()
    cred.business_id = _BUSINESS_ID
    cred.meli_user_id = _MELI_USER_ID
    cred.meli_nickname = _MELI_NICKNAME
    cred.access_token_enc = f.encrypt(b"AT-test").decode()
    cred.refresh_token_enc = f.encrypt(b"RT-test").decode()
    cred.expires_at = datetime.now(UTC) + timedelta(hours=6)
    cred.status = status
    return cred


# ── Helpers ───────────────────────────────────────────────────────────────────


def _valid_state(business_id=_BUSINESS_ID) -> str:
    from app.routers.meli import _create_state

    return _create_state(business_id)


# ── Tests: authorize-url ──────────────────────────────────────────────────────


def test_authorize_url_returns_meli_url():
    _override_auth()
    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/oauth/authorize-url")
        assert resp.status_code == 200
        url = resp.json()["url"]
        assert "mercadolibre" in url or "mercadopago" in url or "auth" in url.lower()
        assert "response_type=code" in url
        assert "state=" in url
    finally:
        _clear_overrides()


def test_authorize_url_state_contains_business_id():
    _override_auth()
    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/oauth/authorize-url")
        url = resp.json()["url"]
        state = next(p.split("=", 1)[1] for p in url.split("&") if p.startswith("state="))
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=["HS256"])
        assert payload["business_id"] == str(_BUSINESS_ID)
    finally:
        _clear_overrides()


# ── Tests: callback ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_callback_creates_credential_and_redirects():
    """Callback con code válido → upsert cred, redirige a /settings/integrations?meli=connected."""
    from app.database import get_db
    from app.routers.meli import _exchange_code, _get_me

    db = _make_db_mock(cred=None)  # no existe cred previa

    token_data = {
        "access_token": "AT-new",
        "refresh_token": "RT-new",
        "expires_in": 21600,
    }
    me_data = {"id": _MELI_USER_ID, "nickname": _MELI_NICKNAME}

    state = _valid_state()

    app.dependency_overrides[get_db] = lambda: db

    # Segunda llamada a execute → no hay otro negocio con ese meli_user_id
    other_result = MagicMock()
    other_result.scalar_one_or_none.return_value = None
    self_result = MagicMock()
    self_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[other_result, self_result])

    try:
        with (
            patch("app.routers.meli._exchange_code", AsyncMock(return_value=token_data)),
            patch("app.routers.meli._get_me", AsyncMock(return_value=me_data)),
            patch("app.routers.meli._encrypt", return_value="ENC"),
            TestClient(app, raise_server_exceptions=True, follow_redirects=False) as client,
        ):
            resp = client.get(f"/api/v1/meli/oauth/callback?code=CODE&state={state}")

        assert resp.status_code in (302, 307)
        assert "meli=connected" in resp.headers["location"]
        db.add.assert_called_once()
        db.commit.assert_awaited_once()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_invalid_state_returns_400():
    from app.database import get_db

    app.dependency_overrides[get_db] = lambda: _make_db_mock()

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/oauth/callback?code=CODE&state=INVALID_STATE")
        assert resp.status_code == 400
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_callback_already_connected_to_other_business_redirects():
    """meli_user_id ya conectado a otro negocio → redirect con already_connected."""
    from app.database import get_db

    other_cred = _make_cred()
    other_cred.business_id = uuid.uuid4()  # otro negocio

    db = AsyncMock()
    other_result = MagicMock()
    other_result.scalar_one_or_none.return_value = other_cred
    db.execute = AsyncMock(return_value=other_result)

    state = _valid_state()
    token_data = {"access_token": "AT", "refresh_token": "RT", "expires_in": 21600}
    me_data = {"id": _MELI_USER_ID, "nickname": _MELI_NICKNAME}

    app.dependency_overrides[get_db] = lambda: db

    try:
        with (
            patch("app.routers.meli._exchange_code", AsyncMock(return_value=token_data)),
            patch("app.routers.meli._get_me", AsyncMock(return_value=me_data)),
            TestClient(app, raise_server_exceptions=True, follow_redirects=False) as client,
        ):
            resp = client.get(f"/api/v1/meli/oauth/callback?code=CODE&state={state}")

        assert resp.status_code in (302, 307)
        assert "already_connected" in resp.headers["location"]
    finally:
        _clear_overrides()


# ── Tests: status ─────────────────────────────────────────────────────────────


def test_status_connected():
    from app.database import get_db

    _override_auth()
    app.dependency_overrides[get_db] = lambda: _make_db_mock(cred=_make_cred())

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is True
        assert data["meli_user_id"] == _MELI_USER_ID
        assert data["meli_nickname"] == _MELI_NICKNAME
    finally:
        _clear_overrides()


def test_status_disconnected():
    from app.database import get_db

    _override_auth()
    app.dependency_overrides[get_db] = lambda: _make_db_mock(cred=None)

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is False
        assert data["status"] == "disconnected"
    finally:
        _clear_overrides()


def test_status_error_cred():
    from app.database import get_db

    _override_auth()
    app.dependency_overrides[get_db] = lambda: _make_db_mock(
        cred=_make_cred(status=MeliCredentialStatus.ERROR)
    )

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/api/v1/meli/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is False
        assert data["status"] == "error"
    finally:
        _clear_overrides()


# ── Tests: disconnect ─────────────────────────────────────────────────────────


def test_disconnect_marks_revoked():
    from app.database import get_db

    _override_auth()
    cred = _make_cred()
    app.dependency_overrides[get_db] = lambda: _make_db_mock(cred=cred)

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.delete("/api/v1/meli/connection")
        assert resp.status_code == 204
        assert cred.status == MeliCredentialStatus.REVOKED
    finally:
        _clear_overrides()


def test_disconnect_no_connection_returns_404():
    from app.database import get_db

    _override_auth()
    app.dependency_overrides[get_db] = lambda: _make_db_mock(cred=None)

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.delete("/api/v1/meli/connection")
        assert resp.status_code == 404
    finally:
        _clear_overrides()
