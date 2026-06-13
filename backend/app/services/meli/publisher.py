"""
MeliPublisher — service layer for creating and managing Mercado Libre listings.

Responsibilities:
- Publish a local product as a new ML listing
- Link an existing ML item to a local product
- Query listings with filters
- Patch listing sync settings
- Enqueue pause/activate actions for the sync worker
"""

import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.meli import (
    MeliCredentials,
    MeliListing,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)
from app.models.product import Product
from app.services.meli.client import MeliClient

logger = logging.getLogger(__name__)

# Statuses that mean a listing is still "live" and blocks re-publishing.
_ACTIVE_STATUSES = {"active", "paused"}


class MeliPublisher:
    def __init__(self, session: AsyncSession, business_id: UUID) -> None:
        self._session = session
        self._business_id = business_id
        self._client = MeliClient(session, business_id)

    # ── Internal helpers ─────────────────────────────────────────────────────

    async def _load_product(self, product_id: UUID) -> Product:
        result = await self._session.execute(
            select(Product)
            .options(selectinload(Product.lots))
            .where(
                Product.id == product_id,
                Product.business_id == self._business_id,
                Product.deleted_at.is_(None),
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise ValueError(f"Product {product_id} not found")
        return product

    async def _load_credentials(self) -> MeliCredentials:
        result = await self._session.execute(
            select(MeliCredentials).where(
                MeliCredentials.business_id == self._business_id,
                MeliCredentials.deleted_at.is_(None),
            )
        )
        cred = result.scalar_one_or_none()
        if not cred:
            raise ValueError("No Mercado Libre credentials found for this business")
        return cred

    # ── Public methods ────────────────────────────────────────────────────────

    async def publish(
        self,
        *,
        product_id: UUID,
        category_id: str,
        listing_type_id: str,
        price: Decimal | None = None,
        title: str | None = None,
        attributes: list[dict] | None = None,
        pictures: list[str] | None = None,
        condition: str = "new",
        description: str | None = None,
        price_markup_pct: Decimal = Decimal("0"),
        sync_price: bool = True,
        sync_stock: bool = True,
    ) -> MeliListing:
        if attributes is None:
            attributes = []
        if pictures is None:
            pictures = []

        product = await self._load_product(product_id)

        if not product.sale_price or Decimal(str(product.sale_price)) <= 0:
            raise ValueError("Product sale_price must be greater than 0 to publish")

        if product.current_stock <= 0:
            raise ValueError("Product has no stock available to publish")

        # Block re-publish if an active or paused listing already exists
        existing_result = await self._session.execute(
            select(MeliListing).where(
                MeliListing.business_id == self._business_id,
                MeliListing.product_id == product_id,
                MeliListing.status.in_(_ACTIVE_STATUSES),
                MeliListing.deleted_at.is_(None),
            )
        )
        if existing_result.scalar_one_or_none():
            raise ValueError(
                "Ya existe una publicación activa para este producto en Mercado Libre"
            )

        effective_price = price if price is not None else (
            Decimal(str(product.sale_price)) * (1 + price_markup_pct / 100)
        )

        payload: dict = {
            "title": title or product.description,
            "category_id": category_id,
            "price": float(round(effective_price, 2)),
            "currency_id": "ARS",
            "available_quantity": product.current_stock,
            "condition": condition,
            "listing_type_id": listing_type_id,
            "pictures": [{"source": url} for url in pictures],
            "attributes": attributes,
        }

        item = await self._client.create_item(payload)

        # ML returns a dict with an "error" key on failure (non-2xx also raises, but
        # some ML error responses return 2xx with an error body).
        if "error" in item:
            raise ValueError(
                f"Mercado Libre error: {item.get('message') or item['error']}"
            )

        meli_item_id: str = item["id"]
        permalink: str | None = item.get("permalink")

        if description:
            try:
                await self._client.post(
                    f"/items/{meli_item_id}/description",
                    json={"plain_text": description},
                )
            except Exception as exc:
                # Description is optional; a 404 or any error must not abort publishing.
                logger.warning(
                    "Failed to post description for item %s: %s", meli_item_id, exc
                )

        listing = MeliListing(
            business_id=self._business_id,
            product_id=product_id,
            meli_item_id=meli_item_id,
            meli_permalink=permalink,
            listing_type_id=listing_type_id,
            status=item.get("status", "active"),
            sync_price=sync_price,
            sync_stock=sync_stock,
            price_markup_pct=price_markup_pct,
        )
        self._session.add(listing)
        await self._session.flush()
        return listing

    async def link(self, *, product_id: UUID, meli_item_id: str) -> MeliListing:
        """Link an existing ML item to a local product without creating a new listing on ML."""
        product = await self._load_product(product_id)
        # product ownership already validated by _load_product (business_id filter)
        _ = product  # just needed for the ownership check

        cred = await self._load_credentials()

        item = await self._client.get_item(meli_item_id)
        if "error" in item or not item.get("id"):
            raise ValueError(f"Mercado Libre item {meli_item_id} not found")

        if str(item.get("seller_id")) != str(cred.meli_user_id):
            raise ValueError(
                "This Mercado Libre item belongs to a different seller account"
            )

        existing_result = await self._session.execute(
            select(MeliListing).where(
                MeliListing.meli_item_id == meli_item_id,
                MeliListing.deleted_at.is_(None),
            )
        )
        if existing_result.scalar_one_or_none():
            raise ValueError(
                f"Mercado Libre item {meli_item_id} is already linked to a listing"
            )

        listing = MeliListing(
            business_id=self._business_id,
            product_id=product_id,
            meli_item_id=meli_item_id,
            meli_permalink=item.get("permalink"),
            listing_type_id=item.get("listing_type_id"),
            status=item.get("status", "active"),
            sync_price=False,
            sync_stock=False,
        )
        self._session.add(listing)
        await self._session.flush()
        return listing

    async def get_listings(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        status: str | None = None,
        product_id: UUID | None = None,
    ) -> tuple[list[MeliListing], int]:
        conditions = [
            MeliListing.business_id == self._business_id,
            MeliListing.deleted_at.is_(None),
        ]
        if status:
            conditions.append(MeliListing.status == status)
        if product_id:
            conditions.append(MeliListing.product_id == product_id)

        query = select(MeliListing).where(and_(*conditions))

        count_result = await self._session.execute(
            select(MeliListing.id).where(and_(*conditions))
        )
        total = len(count_result.all())

        rows_result = await self._session.execute(
            query.offset(offset).limit(limit).order_by(MeliListing.created_at.desc())
        )
        listings = list(rows_result.scalars().all())
        return listings, total

    async def patch_listing(
        self,
        listing_id: UUID,
        *,
        sync_price: bool | None = None,
        sync_stock: bool | None = None,
        price_markup_pct: Decimal | None = None,
    ) -> MeliListing:
        result = await self._session.execute(
            select(MeliListing).where(
                MeliListing.id == listing_id,
                MeliListing.business_id == self._business_id,
                MeliListing.deleted_at.is_(None),
            )
        )
        listing = result.scalar_one_or_none()
        if not listing:
            raise ValueError(f"Listing {listing_id} not found")

        if sync_price is not None:
            listing.sync_price = sync_price
        if sync_stock is not None:
            listing.sync_stock = sync_stock
        if price_markup_pct is not None:
            listing.price_markup_pct = price_markup_pct

        await self._session.flush()
        return listing

    async def enqueue_action(
        self, listing_id: UUID, kind: MeliSyncKind
    ) -> None:
        """Enqueue a PAUSE or ACTIVATE action for the sync worker and optimistically update listing status."""
        result = await self._session.execute(
            select(MeliListing).where(
                MeliListing.id == listing_id,
                MeliListing.business_id == self._business_id,
                MeliListing.deleted_at.is_(None),
            )
        )
        listing = result.scalar_one_or_none()
        if not listing:
            raise ValueError(f"Listing {listing_id} not found")

        queue_entry = MeliSyncQueue(
            business_id=self._business_id,
            listing_id=listing_id,
            kind=kind,
            payload={},
            status=MeliSyncStatus.PENDING,
        )
        self._session.add(queue_entry)

        # Optimistic status update so the UI reflects the intent immediately.
        if kind == MeliSyncKind.PAUSE:
            listing.status = "paused"
        elif kind == MeliSyncKind.ACTIVATE:
            listing.status = "active"

        await self._session.flush()
