"""
Cliente HTTP para la API de Mercado Libre.

Responsabilidades:
- Autenticación Bearer con refresh automático (FOR UPDATE para evitar doble-refresh)
- Retries con backoff exponencial para 429 y 5xx
- 401: refresh una vez y reintenta
- Nunca loguea tokens en texto plano
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    RetryError,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings
from app.models.meli import MeliCredentialStatus, MeliCredentials

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Cifrado de tokens ────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    key = settings.MELI_TOKEN_ENCRYPTION_KEY
    if not key:
        raise RuntimeError("MELI_TOKEN_ENCRYPTION_KEY no configurada")
    return Fernet(key.encode() if isinstance(key, str) else key)


def _encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def _decrypt(encrypted: str) -> str:
    return _fernet().decrypt(encrypted.encode()).decode()


# ── Helpers de retry ─────────────────────────────────────────────────────────

def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return isinstance(exc, httpx.TransportError)


def _retry_wait(retry_state):
    """Respeta Retry-After si viene en la respuesta."""
    exc = retry_state.outcome.exception()
    if isinstance(exc, httpx.HTTPStatusError):
        after = exc.response.headers.get("Retry-After")
        if after:
            try:
                return float(after)
            except ValueError:
                pass
    from tenacity import wait_exponential as _wexp
    return _wexp(multiplier=1, min=1, max=30)(retry_state)


# ── Cliente principal ────────────────────────────────────────────────────────

class MeliAuthError(Exception):
    """Credencial inválida o revocada — no reintentar."""


class MeliClient:
    """
    Cliente async para la API de Mercado Libre, con gestión de tokens por negocio.

    Uso:
        client = MeliClient(session, business_id)
        data = await client.get("/items/MLA123")
    """

    def __init__(self, session: AsyncSession, business_id: UUID) -> None:
        self._session = session
        self._business_id = business_id
        self._http: httpx.AsyncClient | None = None

    async def _http_client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=settings.MELI_API_BASE,
                timeout=15.0,
                headers={"Content-Type": "application/json"},
            )
        return self._http

    async def close(self) -> None:
        if self._http and not self._http.is_closed:
            await self._http.aclose()

    # ── Token management ──────────────────────────────────────────────────────

    async def _load_credentials(self, for_update: bool = False):
        q = select(MeliCredentials).where(
            MeliCredentials.business_id == self._business_id,
            MeliCredentials.deleted_at.is_(None),
        )
        if for_update:
            q = q.with_for_update()
        result = await self._session.execute(q)
        cred = result.scalar_one_or_none()
        if not cred:
            raise MeliAuthError(f"No hay credenciales MELI para business {self._business_id}")
        if cred.status == MeliCredentialStatus.REVOKED:
            raise MeliAuthError("Credenciales MELI revocadas")
        return cred

    async def _access_token(self) -> str:
        """Devuelve un access token válido, refrescando si está por vencer."""
        cred = await self._load_credentials()
        expires_soon = cred.expires_at.replace(tzinfo=UTC) < datetime.now(UTC) + timedelta(minutes=5)
        if expires_soon:
            return await self._refresh_tokens()
        return _decrypt(cred.access_token_enc)

    async def _refresh_tokens(self) -> str:
        """
        Refresca el par access/refresh token.
        Usa SELECT FOR UPDATE para evitar dos refreshes concurrentes sobre el mismo negocio.
        El refresh_token de ML es single-use: persistir el nuevo ANTES de usar el access_token.
        """
        async with self._session.begin_nested():
            cred = await self._load_credentials(for_update=True)

            # Doble check: otro proceso puede haber refrescado mientras esperábamos el lock
            if cred.expires_at.replace(tzinfo=UTC) >= datetime.now(UTC) + timedelta(minutes=5):
                return _decrypt(cred.access_token_enc)

            refresh_token = _decrypt(cred.refresh_token_enc)

            async with httpx.AsyncClient(timeout=15.0) as http:
                resp = await http.post(
                    f"{settings.MELI_API_BASE}/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": settings.MELI_CLIENT_ID,
                        "client_secret": settings.MELI_CLIENT_SECRET,
                        "refresh_token": refresh_token,
                    },
                )

            if resp.status_code == 400:
                body = resp.json()
                if body.get("error") == "invalid_grant":
                    cred.status = MeliCredentialStatus.ERROR
                    await self._session.flush()
                    raise MeliAuthError("Refresh token inválido (invalid_grant). Reconectar la cuenta.")

            resp.raise_for_status()
            data = resp.json()

            # Persistir ANTES de usar el nuevo access_token
            cred.access_token_enc = _encrypt(data["access_token"])
            cred.refresh_token_enc = _encrypt(data["refresh_token"])
            cred.expires_at = datetime.now(UTC) + timedelta(seconds=data.get("expires_in", 21600))
            cred.status = MeliCredentialStatus.CONNECTED
            await self._session.flush()

            return data["access_token"]

    # ── HTTP con retry ────────────────────────────────────────────────────────

    async def _request(self, method: str, path: str, *, _refreshed: bool = False, **kwargs) -> dict:
        token = await self._access_token()
        http = await self._http_client()

        @retry(
            retry=retry_if_exception(_is_retryable),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            stop=stop_after_attempt(3),
            reraise=True,
        )
        async def _do() -> httpx.Response:
            resp = await http.request(
                method,
                path,
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
            if _is_retryable_status(resp.status_code):
                resp.raise_for_status()
            return resp

        try:
            resp = await _do()
        except RetryError as e:
            raise e.last_attempt.exception() from e

        if resp.status_code == 401 and not _refreshed:
            # Forzar refresh y reintentar una sola vez
            await self._refresh_tokens()
            return await self._request(method, path, _refreshed=True, **kwargs)

        resp.raise_for_status()
        return resp.json()

    # ── Métodos HTTP públicos ─────────────────────────────────────────────────

    async def get(self, path: str, **kwargs) -> dict:
        return await self._request("GET", path, **kwargs)

    async def post(self, path: str, json: dict) -> dict:
        return await self._request("POST", path, json=json)

    async def put(self, path: str, json: dict) -> dict:
        return await self._request("PUT", path, json=json)

    # ── Helpers de dominio ────────────────────────────────────────────────────

    async def get_me(self) -> dict:
        return await self.get("/users/me")

    async def predict_category(self, title: str) -> dict:
        return await self.get(
            f"/sites/{settings.MELI_SITE_ID}/domain_discovery/search",
            params={"q": title},
        )

    async def get_category_attributes(self, category_id: str) -> list:
        data = await self.get(f"/categories/{category_id}/attributes")
        return data if isinstance(data, list) else []

    async def create_item(self, payload: dict) -> dict:
        return await self.post("/items", json=payload)

    async def update_item(self, item_id: str, payload: dict) -> dict:
        return await self.put(f"/items/{item_id}", json=payload)

    async def get_item(self, item_id: str) -> dict:
        return await self.get(f"/items/{item_id}")

    async def get_order(self, order_id: int) -> dict:
        return await self.get(f"/orders/{order_id}")

    async def has_price_automation(self, item_id: str) -> bool:
        """
        Devuelve True si la publicación tiene automatización de precios activa.
        Desde 18/03/2026, un PUT solo con 'price' sobre ese ítem da 400.
        """
        try:
            item = await self.get_item(item_id)
            strategies = item.get("sale_terms", [])
            for term in strategies:
                if term.get("id") == "PRICE_STRATEGY" and term.get("value_id") != "MANUAL":
                    return True
            # También puede venir en buying_mode o tags
            if "repricing" in item.get("tags", []):
                return True
            return False
        except Exception:
            return False


def _is_retryable_status(status_code: int) -> bool:
    return status_code in (429, 500, 502, 503, 504)
