"""
Router de Mercado Libre — OAuth + gestión de conexión.

Endpoints:
  GET  /oauth/authorize-url  → URL de autorización ML con state JWT firmado
  GET  /oauth/callback       → Intercambia code por tokens, upsert en meli_credentials
  GET  /status               → Estado de la conexión del negocio
  DELETE /connection         → Desconecta (marca revoked)
"""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.meli import MeliCredentialStatus, MeliCredentials
from app.services.meli.client import _decrypt, _encrypt
from app.utils.security import get_current_business, get_current_user

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meli", tags=["Mercado Libre"])

_STATE_ALGORITHM = "HS256"
_STATE_EXP_MINUTES = 10


# ── Helpers ───────────────────────────────────────────────────────────────────


def _create_state(business_id: UUID) -> str:
    """JWT corto: business_id + nonce + exp 10 min, firmado con JWT_SECRET."""
    payload = {
        "business_id": str(business_id),
        "nonce": secrets.token_hex(16),
        "exp": datetime.now(UTC) + timedelta(minutes=_STATE_EXP_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_STATE_ALGORITHM)


def _decode_state(state: str) -> dict:
    """Valida y decodifica el JWT de state. Lanza HTTPException 400 si inválido."""
    try:
        return jwt.decode(state, settings.JWT_SECRET, algorithms=[_STATE_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth state inválido o expirado: {exc}",
        )


async def _exchange_code(code: str) -> dict:
    """POST a ML para intercambiar code por tokens."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(
            f"{settings.MELI_AUTH_BASE}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.MELI_CLIENT_ID,
                "client_secret": settings.MELI_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.MELI_REDIRECT_URI,
            },
        )
    if resp.status_code != 200:
        logger.error(f"ML token exchange failed: {resp.status_code} {resp.text}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error al obtener tokens de Mercado Libre",
        )
    return resp.json()


async def _get_me(access_token: str) -> dict:
    """GET /users/me para obtener meli_user_id y nickname."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.get(
            f"{settings.MELI_API_BASE}/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


# ── Schemas ───────────────────────────────────────────────────────────────────


class AuthorizeUrlResponse(BaseModel):
    url: str


class ConnectionStatusResponse(BaseModel):
    connected: bool
    status: str | None = None
    meli_user_id: int | None = None
    meli_nickname: str | None = None
    expires_at: datetime | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/oauth/authorize-url", response_model=AuthorizeUrlResponse)
async def get_authorize_url(
    business_id: UUID = Depends(get_current_business),
    _=Depends(get_current_user),
):
    """Devuelve la URL de autorización de ML con state JWT firmado."""
    state = _create_state(business_id)
    url = (
        f"{settings.MELI_AUTH_BASE}/authorization"
        f"?response_type=code"
        f"&client_id={settings.MELI_CLIENT_ID}"
        f"&redirect_uri={settings.MELI_REDIRECT_URI}"
        f"&state={state}"
    )
    return AuthorizeUrlResponse(url=url)


@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Callback de ML: sin auth de OctopusTrack — la identidad sale del state firmado.
    Intercambia code por tokens, upsert en meli_credentials, redirige al frontend.
    """
    state_data = _decode_state(state)
    business_id = UUID(state_data["business_id"])

    token_data = await _exchange_code(code)
    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]
    expires_in = token_data.get("expires_in", 21600)

    me = await _get_me(access_token)
    meli_user_id: int = me["id"]
    meli_nickname: str = me.get("nickname", "")

    # Verificar que otro negocio no tenga el mismo meli_user_id conectado
    existing_other = await db.execute(
        select(MeliCredentials).where(
            MeliCredentials.meli_user_id == meli_user_id,
            MeliCredentials.business_id != business_id,
            MeliCredentials.status == MeliCredentialStatus.CONNECTED,
            MeliCredentials.deleted_at.is_(None),
        )
    )
    if existing_other.scalar_one_or_none():
        logger.warning(
            f"meli_user_id {meli_user_id} ya está conectado a otro negocio"
        )
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/settings/integrations?meli=already_connected",
            status_code=status.HTTP_302_FOUND,
        )

    # Upsert meli_credentials
    result = await db.execute(
        select(MeliCredentials).where(
            MeliCredentials.business_id == business_id,
            MeliCredentials.deleted_at.is_(None),
        )
    )
    cred = result.scalar_one_or_none()

    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=expires_in)

    if cred is None:
        cred = MeliCredentials(
            business_id=business_id,
            meli_user_id=meli_user_id,
            meli_nickname=meli_nickname,
            access_token_enc=_encrypt(access_token),
            refresh_token_enc=_encrypt(refresh_token),
            expires_at=expires_at,
            status=MeliCredentialStatus.CONNECTED,
        )
        db.add(cred)
    else:
        cred.meli_user_id = meli_user_id
        cred.meli_nickname = meli_nickname
        cred.access_token_enc = _encrypt(access_token)
        cred.refresh_token_enc = _encrypt(refresh_token)
        cred.expires_at = expires_at
        cred.status = MeliCredentialStatus.CONNECTED

    await db.commit()

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/settings/integrations?meli=connected",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/status", response_model=ConnectionStatusResponse)
async def get_connection_status(
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Estado de la conexión ML del negocio."""
    result = await db.execute(
        select(MeliCredentials).where(
            MeliCredentials.business_id == business_id,
            MeliCredentials.deleted_at.is_(None),
        )
    )
    cred = result.scalar_one_or_none()

    if not cred:
        return ConnectionStatusResponse(connected=False, status="disconnected")

    return ConnectionStatusResponse(
        connected=cred.status == MeliCredentialStatus.CONNECTED,
        status=cred.status.value,
        meli_user_id=cred.meli_user_id,
        meli_nickname=cred.meli_nickname,
        expires_at=cred.expires_at,
    )


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """Desconecta la cuenta ML: marca la credencial como revoked."""
    result = await db.execute(
        select(MeliCredentials).where(
            MeliCredentials.business_id == business_id,
            MeliCredentials.deleted_at.is_(None),
        )
    )
    cred = result.scalar_one_or_none()

    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay conexión activa con Mercado Libre",
        )

    cred.status = MeliCredentialStatus.REVOKED
    await db.commit()
