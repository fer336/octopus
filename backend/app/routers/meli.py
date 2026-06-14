"""
Router de Mercado Libre — OAuth + gestión de conexión + publicaciones.

Endpoints:
  GET  /oauth/authorize-url  → URL de autorización ML con state JWT firmado
  GET  /oauth/callback       → Intercambia code por tokens, upsert en meli_credentials
  GET  /status               → Estado de la conexión del negocio
  DELETE /connection         → Desconecta (marca revoked)

  GET  /categories/predict              → Predice categoría por título
  GET  /categories/{id}/attributes      → Atributos de una categoría

  POST  /listings                       → Publica producto en ML
  GET   /listings                       → Lista publicaciones del negocio
  POST  /listings/link                  → Vincula item ML existente a producto local
  PATCH /listings/{listing_id}          → Edita configuración de sincronización
  POST  /listings/{listing_id}/pause    → Encola acción PAUSE
  POST  /listings/{listing_id}/activate → Encola acción ACTIVATE
"""

import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.meli import (
    MeliCredentialStatus,
    MeliCredentials,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)
from app.services.meli.client import MeliClient, _decrypt, _encrypt
from app.services.meli.publisher import MeliPublisher
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


class MeliTokenExchangeError(Exception):
    """Token exchange falló — redirigir al frontend con error."""
    def __init__(self, ml_status: int, ml_body: str) -> None:
        self.ml_status = ml_status
        self.ml_body = ml_body
        super().__init__(f"ML token exchange failed: {ml_status} {ml_body}")


async def _exchange_code(code: str) -> dict:
    """POST a ML para intercambiar code por tokens."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(
            f"{settings.MELI_API_BASE}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.MELI_CLIENT_ID,
                "client_secret": settings.MELI_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.MELI_REDIRECT_URI,
            },
        )
    if resp.status_code != 200:
        logger.error("ML token exchange failed: %s %s", resp.status_code, resp.text)
        raise MeliTokenExchangeError(resp.status_code, resp.text)
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

    try:
        token_data = await _exchange_code(code)
    except MeliTokenExchangeError:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/#/mercadolibre?meli=error&reason=token_exchange_failed",
            status_code=status.HTTP_302_FOUND,
        )
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
            url=f"{settings.FRONTEND_URL}/#/mercadolibre?meli=already_connected",
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
        url=f"{settings.FRONTEND_URL}/#/mercadolibre?meli=connected",
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


# ── Listing schemas ───────────────────────────────────────────────────────────


class PublishListingRequest(BaseModel):
    product_id: UUID
    category_id: str
    listing_type_id: str = "gold_special"
    price: Decimal | None = None
    title: str | None = None
    attributes: list[dict] = []
    pictures: list[str] = []
    condition: str = "new"
    description: str | None = None
    price_markup_pct: Decimal = Decimal("0")
    sync_price: bool = True
    sync_stock: bool = True


class LinkListingRequest(BaseModel):
    product_id: UUID
    meli_item_id: str


class PatchListingRequest(BaseModel):
    sync_price: bool | None = None
    sync_stock: bool | None = None
    price_markup_pct: Decimal | None = None


class ListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    meli_item_id: str
    meli_permalink: str | None
    listing_type_id: str | None
    status: str
    sync_price: bool
    sync_stock: bool
    price_markup_pct: Decimal | None
    last_synced_at: datetime | None
    last_sync_error: str | None


class ListingsPage(BaseModel):
    items: list[ListingResponse]
    total: int
    offset: int
    limit: int


# ── Category endpoints ────────────────────────────────────────────────────────


@router.get("/categories/predict")
async def predict_category(
    title: str = Query(..., min_length=1),
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Predict the best ML category for a given product title."""
    client = MeliClient(db, business_id)
    return await client.predict_category(title)


@router.get("/categories/{category_id}/attributes")
async def get_category_attributes(
    category_id: str,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Return the required and optional attributes for a ML category."""
    client = MeliClient(db, business_id)
    return await client.get_category_attributes(category_id)


# ── Listing endpoints ─────────────────────────────────────────────────────────


@router.post("/listings", response_model=ListingResponse, status_code=201)
async def create_listing(
    body: PublishListingRequest,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Publish a local product to Mercado Libre and create a MeliListing record."""
    publisher = MeliPublisher(db, business_id)
    try:
        listing = await publisher.publish(
            product_id=body.product_id,
            category_id=body.category_id,
            listing_type_id=body.listing_type_id,
            price=body.price,
            title=body.title,
            attributes=body.attributes,
            pictures=body.pictures,
            condition=body.condition,
            description=body.description,
            price_markup_pct=body.price_markup_pct,
            sync_price=body.sync_price,
            sync_stock=body.sync_stock,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()
    return listing


@router.get("/listings", response_model=ListingsPage)
async def list_listings(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    product_id: UUID | None = Query(None),
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated listings for the current business."""
    publisher = MeliPublisher(db, business_id)
    items, total = await publisher.get_listings(
        offset=offset,
        limit=limit,
        status=status,
        product_id=product_id,
    )
    return ListingsPage(items=items, total=total, offset=offset, limit=limit)


@router.post("/listings/link", response_model=ListingResponse, status_code=201)
async def link_listing(
    body: LinkListingRequest,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Link an existing ML item to a local product without publishing a new one."""
    publisher = MeliPublisher(db, business_id)
    try:
        listing = await publisher.link(
            product_id=body.product_id,
            meli_item_id=body.meli_item_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()
    return listing


@router.patch("/listings/{listing_id}", response_model=ListingResponse)
async def patch_listing(
    listing_id: UUID,
    body: PatchListingRequest,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Update sync settings for a listing."""
    publisher = MeliPublisher(db, business_id)
    try:
        listing = await publisher.patch_listing(
            listing_id,
            sync_price=body.sync_price,
            sync_stock=body.sync_stock,
            price_markup_pct=body.price_markup_pct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()
    return listing


@router.post("/listings/{listing_id}/pause", status_code=204)
async def pause_listing(
    listing_id: UUID,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue a PAUSE action for the given listing."""
    publisher = MeliPublisher(db, business_id)
    try:
        await publisher.enqueue_action(listing_id, MeliSyncKind.PAUSE)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()


@router.post("/listings/{listing_id}/activate", status_code=204)
async def activate_listing(
    listing_id: UUID,
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """Enqueue an ACTIVATE action for the given listing."""
    publisher = MeliPublisher(db, business_id)
    try:
        await publisher.enqueue_action(listing_id, MeliSyncKind.ACTIVATE)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await db.commit()


# ── Webhook notifications ─────────────────────────────────────────────────────


class MeliNotification(BaseModel):
    resource: str
    user_id: int
    topic: str | None = None


def _extract_order_id(resource: str) -> int | None:
    """Extract numeric order_id from ML resource paths like /orders/123 or /orders/v2/123."""
    m = re.search(r"/orders(?:/v\d+)?/(\d+)", resource)
    return int(m.group(1)) if m else None


@router.post("/notifications", status_code=200)
async def ml_notifications(
    body: MeliNotification,
    db: AsyncSession = Depends(get_db),
):
    """
    Public ML webhook endpoint. Always returns 200 immediately.
    Order processing is delegated to SyncWorker via outbox (PROCESS_ORDER job).
    """
    if body.topic != "orders_v2":
        return {}

    order_id = _extract_order_id(body.resource)
    if not order_id:
        return {}

    result = await db.execute(
        select(MeliCredentials).where(
            MeliCredentials.meli_user_id == body.user_id,
            MeliCredentials.status == MeliCredentialStatus.CONNECTED,
            MeliCredentials.deleted_at.is_(None),
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return {}

    db.add(
        MeliSyncQueue(
            business_id=cred.business_id,
            listing_id=None,
            kind=MeliSyncKind.PROCESS_ORDER,
            payload={"order_id": order_id},
            status=MeliSyncStatus.PENDING,
        )
    )
    await db.commit()

    return {}
