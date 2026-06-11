"""
Tests del MeliClient — usa httpx.MockTransport + mocks de AsyncSession.
No requiere DB real ni credenciales de ML.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from cryptography.fernet import Fernet

from app.models.meli import MeliCredentialStatus, MeliCredentials
from app.services.meli.client import MeliAuthError, MeliClient

# Clave Fernet fija para todos los tests
_TEST_FERNET = Fernet(Fernet.generate_key())


def _enc(plain: str) -> str:
    return _TEST_FERNET.encrypt(plain.encode()).decode()


def _dec(encrypted: str) -> str:
    return _TEST_FERNET.decrypt(encrypted.encode()).decode()


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_cred(
    *,
    access_token: str = "AT-valid",
    refresh_token: str = "RT-valid",
    expired: bool = False,
    status: MeliCredentialStatus = MeliCredentialStatus.CONNECTED,
) -> MeliCredentials:
    cred = MeliCredentials()
    cred.id = uuid.uuid4()
    cred.business_id = uuid.uuid4()
    cred.meli_user_id = 123456789
    cred.status = status
    cred.access_token_enc = _enc(access_token)
    cred.refresh_token_enc = _enc(refresh_token)
    cred.expires_at = (
        datetime.now(UTC) - timedelta(hours=1)
        if expired
        else datetime.now(UTC) + timedelta(hours=5)
    )
    return cred


def mock_session(cred: MeliCredentials) -> AsyncMock:
    scalar = MagicMock()
    scalar.scalar_one_or_none.return_value = cred

    session = AsyncMock()
    session.execute = AsyncMock(return_value=scalar)
    session.flush = AsyncMock()

    nested_cm = AsyncMock()
    nested_cm.__aenter__ = AsyncMock(return_value=None)
    nested_cm.__aexit__ = AsyncMock(return_value=False)
    session.begin_nested = MagicMock(return_value=nested_cm)

    return session


def json_response(data: dict, status: int = 200) -> httpx.Response:
    import json
    resp = httpx.Response(
        status,
        content=json.dumps(data).encode(),
        headers={"content-type": "application/json"},
    )
    # raise_for_status() necesita que _request esté seteado
    resp._request = httpx.Request("POST", "https://auth.mercadolibre.com.ar/oauth/token")
    return resp


def _mock_refresh_http(payload: dict, status: int = 200):
    """Crea el mock del httpx.AsyncClient usado internamente para refresh."""
    mock_http = AsyncMock()
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)
    mock_http.post = AsyncMock(return_value=json_response(payload, status))
    return mock_http


# Patch que usamos en casi todos los tests: reemplaza _fernet() con la clave de test
patch_fernet = patch("app.services.meli.client._fernet", return_value=_TEST_FERNET)


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_uses_access_token():
    """Un GET normal incluye el Bearer token correcto."""
    cred = make_cred(access_token="AT-abc")
    session = mock_session(cred)

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization", "")
        return json_response({"id": "MLA123"})

    client = MeliClient(session, cred.business_id)
    client._http = httpx.AsyncClient(
        base_url="https://api.mercadolibre.com",
        transport=httpx.MockTransport(handler),
    )

    with patch_fernet:
        result = await client.get("/items/MLA123")

    assert result == {"id": "MLA123"}
    assert "AT-abc" in captured["auth"]


@pytest.mark.asyncio
async def test_refresh_on_expired_token():
    """Token expirado → refresca automáticamente, persiste el nuevo par de tokens."""
    cred = make_cred(access_token="AT-old", refresh_token="RT-old", expired=True)
    session = mock_session(cred)

    api_responses = iter([json_response({"id": "MLA999"})])

    def api_handler(request: httpx.Request) -> httpx.Response:
        return next(api_responses)

    refresh_payload = {"access_token": "AT-new", "refresh_token": "RT-new", "expires_in": 21600}

    client = MeliClient(session, cred.business_id)
    client._http = httpx.AsyncClient(
        base_url="https://api.mercadolibre.com",
        transport=httpx.MockTransport(api_handler),
    )

    with (
        patch_fernet,
        patch("app.services.meli.client.settings.MELI_CLIENT_ID", "ci"),
        patch("app.services.meli.client.settings.MELI_CLIENT_SECRET", "cs"),
        patch("app.services.meli.client.settings.MELI_AUTH_BASE", "https://auth.mercadolibre.com.ar"),
        patch("httpx.AsyncClient", return_value=_mock_refresh_http(refresh_payload)),
    ):
        await client.get("/items/MLA999")

    assert _dec(cred.access_token_enc) == "AT-new"
    assert _dec(cred.refresh_token_enc) == "RT-new"
    session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_refresh_invalid_grant_marks_error():
    """invalid_grant → credencial queda en ERROR, no reintenta."""
    cred = make_cred(access_token="AT-exp", refresh_token="RT-bad", expired=True)
    session = mock_session(cred)

    error_body = {"error": "invalid_grant", "message": "Refresh token expired"}

    client = MeliClient(session, cred.business_id)

    with (
        patch_fernet,
        patch("app.services.meli.client.settings.MELI_CLIENT_ID", "ci"),
        patch("app.services.meli.client.settings.MELI_CLIENT_SECRET", "cs"),
        patch("app.services.meli.client.settings.MELI_AUTH_BASE", "https://auth.mercadolibre.com.ar"),
        patch("httpx.AsyncClient", return_value=_mock_refresh_http(error_body, status=400)),
        pytest.raises(MeliAuthError, match="invalid_grant"),
    ):
        await client.get("/items/MLA1")

    assert cred.status == MeliCredentialStatus.ERROR


@pytest.mark.asyncio
async def test_retry_on_429():
    """429 → reintenta hasta éxito (dentro de los 3 intentos)."""
    cred = make_cred()
    session = mock_session(cred)

    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return json_response({"ok": True})

    client = MeliClient(session, cred.business_id)
    client._http = httpx.AsyncClient(
        base_url="https://api.mercadolibre.com",
        transport=httpx.MockTransport(handler),
    )

    with patch_fernet:
        result = await client.get("/test")

    assert result == {"ok": True}
    assert call_count == 3


@pytest.mark.asyncio
async def test_refresh_on_401():
    """401 en request → refresca token una vez y reintenta."""
    cred = make_cred(access_token="AT-stale")
    session = mock_session(cred)

    call_count = 0

    def api_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(401)
        return json_response({"id": "MLA1"})

    refresh_payload = {"access_token": "AT-fresh", "refresh_token": "RT-fresh", "expires_in": 21600}

    client = MeliClient(session, cred.business_id)
    client._http = httpx.AsyncClient(
        base_url="https://api.mercadolibre.com",
        transport=httpx.MockTransport(api_handler),
    )

    with (
        patch_fernet,
        patch("app.services.meli.client.settings.MELI_CLIENT_ID", "ci"),
        patch("app.services.meli.client.settings.MELI_CLIENT_SECRET", "cs"),
        patch("app.services.meli.client.settings.MELI_AUTH_BASE", "https://auth.mercadolibre.com.ar"),
        patch("httpx.AsyncClient", return_value=_mock_refresh_http(refresh_payload)),
    ):
        result = await client.get("/items/MLA1")

    assert result == {"id": "MLA1"}
    assert call_count == 2


@pytest.mark.asyncio
async def test_tokens_never_in_logs(caplog):
    """El token en texto plano no aparece en ningún log."""
    import logging

    cred = make_cred(access_token="SUPERSECRETTOKEN-XYZ")
    session = mock_session(cred)

    def handler(request: httpx.Request) -> httpx.Response:
        return json_response({"id": "ok"})

    client = MeliClient(session, cred.business_id)
    client._http = httpx.AsyncClient(
        base_url="https://api.mercadolibre.com",
        transport=httpx.MockTransport(handler),
    )

    with (
        patch_fernet,
        caplog.at_level(logging.DEBUG, logger="app.services.meli.client"),
    ):
        await client.get("/items/test")

    for record in caplog.records:
        assert "SUPERSECRETTOKEN-XYZ" not in record.getMessage()
