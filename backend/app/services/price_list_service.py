"""
Service for Price Lists — B2B extension.
"""

from __future__ import annotations

import decimal
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.price_list import PriceList, PriceListItem, PriceListSendLog
from app.models.product import Product
from app.schemas.price_list import PriceListCreate
from app.services.price_list_pricing import calculate_price_list_item_prices

if TYPE_CHECKING:
    from app.schemas.price_list import (
        PriceListItemUpdate,
        PriceListSendLogCreate,
        PriceListUpdate,
    )


class PriceListService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Existing methods (kept, extended)
    # ------------------------------------------------------------------

    async def list_all(
        self,
        business_id: UUID,
        status: str | None = None,
        list_type: str | None = None,
    ) -> list[PriceList]:
        """Return all price lists for a business ordered by snapshot_date DESC."""
        query = select(PriceList).where(
            PriceList.business_id == business_id,
            PriceList.deleted_at.is_(None),
        )
        if status:
            query = query.where(PriceList.status == status)
        if list_type:
            query = query.where(PriceList.list_type == list_type)
        query = query.order_by(PriceList.snapshot_date.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_item_count(self, price_list_id: UUID) -> int:
        """Return the number of items for a given price list."""
        result = await self.db.execute(
            select(func.count(PriceListItem.id)).where(
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
            )
        )
        return result.scalar() or 0

    async def get_by_id(self, id: UUID, business_id: UUID) -> PriceList | None:
        """Return a price list with items eagerly loaded."""
        result = await self.db.execute(
            select(PriceList)
            .options(selectinload(PriceList.items).selectinload(PriceListItem.product))
            .where(
                PriceList.id == id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, data: PriceListCreate, business_id: UUID) -> PriceList:
        """Create a price list together with all its items in one transaction."""
        payment_conditions_raw = (
            [c.model_dump(mode="json") for c in data.payment_conditions]
            if data.payment_conditions
            else None
        )
        price_list = PriceList(
            business_id=business_id,
            name=data.name,
            snapshot_date=data.snapshot_date,
            notes=data.notes,
            description=data.description,
            currency=data.currency,
            includes_tax=data.includes_tax,
            valid_from=data.valid_from,
            valid_until=data.valid_until,
            status=data.status,
            terms_and_conditions=data.terms_and_conditions,
            client_type_id=data.client_type_id,
            client_id=data.client_id,
            list_type=data.list_type,
            column_config=data.column_config,
            payment_conditions=payment_conditions_raw,
        )
        self.db.add(price_list)
        await self.db.flush()

        for item_data in data.items:
            item = PriceListItem(
                price_list_id=price_list.id,
                product_code=item_data.product_code,
                unit_price=item_data.unit_price,
                product_id=item_data.product_id,
                discount_percent=item_data.discount_percent,
                surcharge_percent=item_data.surcharge_percent,
                min_quantity=item_data.min_quantity,
                pack_quantity=item_data.pack_quantity,
                item_notes=item_data.item_notes,
            )
            self.db.add(item)

        await self.db.flush()
        return price_list

    async def delete(self, id: UUID, business_id: UUID) -> bool:
        """Soft-delete a price list. Returns False if not found."""
        price_list = await self.db.execute(
            select(PriceList).where(
                PriceList.id == id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        obj = price_list.scalar_one_or_none()
        if not obj:
            return False
        obj.deleted_at = datetime.utcnow()
        await self.db.flush()
        return True

    async def snapshot_from_products(self, name: str, business_id: UUID) -> PriceList:
        """Create a price list snapshot from all active products for the business."""
        today = date.today()
        result = await self.db.execute(
            select(Product).where(
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
                Product.is_active.is_(True),
            )
        )
        products = list(result.scalars().all())

        price_list = PriceList(
            business_id=business_id,
            name=name,
            snapshot_date=today,
            list_type="snapshot",
        )
        self.db.add(price_list)
        await self.db.flush()

        for product in products:
            item = PriceListItem(
                price_list_id=price_list.id,
                product_id=product.id,
                product_code=product.code,
                unit_price=product.sale_price,
                description=product.description,
            )
            self.db.add(item)

        await self.db.flush()
        return price_list

    # ------------------------------------------------------------------
    # B2B methods
    # ------------------------------------------------------------------

    async def update(
        self, id: UUID, business_id: UUID, data: PriceListUpdate
    ) -> PriceList | None:
        """Update price list metadata. Cannot update archived lists."""
        pl = await self._get_draft_or_active(id, business_id)
        if not pl:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(pl, field, value)
        await self.db.flush()
        return pl

    async def archive(self, id: UUID, business_id: UUID) -> bool:
        """Set status to archived."""
        result = await self.db.execute(
            select(PriceList).where(
                PriceList.id == id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        pl = result.scalar_one_or_none()
        if not pl:
            return False
        pl.status = "archived"
        await self.db.flush()
        return True

    async def add_products(
        self,
        price_list_id: UUID,
        business_id: UUID,
        product_ids: list[UUID],
        default_discount_percent: Decimal = Decimal("0"),
    ) -> list[PriceListItem]:
        """Add products to a draft price list as snapshot items."""
        pl = await self._get_draft(price_list_id, business_id)
        if not pl:
            raise ValueError("Price list not found or not in draft status")

        products_result = await self.db.execute(
            select(Product)
            .options(
                selectinload(Product.category),
                selectinload(Product.brand_ref),
            )
            .where(
                Product.id.in_(product_ids),
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
            )
        )
        products = list(products_result.scalars().all())

        # Find already-added product_ids (no min_quantity tier) to avoid duplicates
        existing_result = await self.db.execute(
            select(PriceListItem.product_id).where(
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
                PriceListItem.min_quantity.is_(None),
            )
        )
        existing_product_ids = set(existing_result.scalars().all())

        added: list[PriceListItem] = []
        for product in products:
            if product.id in existing_product_ids:
                continue

            base_price: Decimal = (
                product.sale_price if pl.includes_tax else product.net_price
            )
            if base_price is None:
                base_price = Decimal("0")

            net_price, final_price = calculate_price_list_item_prices(
                base_price=Decimal(str(base_price)),
                discount_percent=default_discount_percent,
                tax_percent=Decimal(str(product.iva_rate or "21")),
                includes_tax=pl.includes_tax,
            )

            category_name: str | None = None
            brand_name: str | None = None
            try:
                if product.category:
                    category_name = product.category.name
            except Exception:
                pass
            try:
                brand_name = product.brand_name
            except Exception:
                pass

            item = PriceListItem(
                price_list_id=price_list_id,
                product=product,
                product_id=product.id,
                product_code=product.code,
                description=product.description,
                supplier_code=product.supplier_code,
                brand_name=brand_name,
                category_name=category_name,
                unit=product.unit,
                quantity_per_package=product.quantity_per_package,
                iva_rate=product.iva_rate,
                base_price=Decimal(str(base_price)),
                discount_percent=default_discount_percent,
                surcharge_percent=Decimal("0"),
                net_price=net_price,
                tax_percent=Decimal(str(product.iva_rate or "21")),
                final_price=final_price,
                unit_price=final_price,
            )
            self.db.add(item)
            added.append(item)

        await self.db.flush()
        return added

    async def update_item(
        self,
        price_list_id: UUID,
        item_id: UUID,
        business_id: UUID,
        data: PriceListItemUpdate,
    ) -> PriceListItem | None:
        """Update item discount/surcharge and recalculate prices."""
        pl = await self._get_draft(price_list_id, business_id)
        if not pl:
            return None
        result = await self.db.execute(
            select(PriceListItem)
            .options(selectinload(PriceListItem.product))
            .where(
                PriceListItem.id == item_id,
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        if item.base_price is not None:
            net_price, final_price = calculate_price_list_item_prices(
                base_price=Decimal(str(item.base_price)),
                discount_percent=Decimal(str(item.discount_percent or "0")),
                surcharge_percent=Decimal(str(item.surcharge_percent or "0")),
                tax_percent=Decimal(str(item.tax_percent or item.iva_rate or "21")),
                includes_tax=pl.includes_tax,
            )
            item.net_price = net_price
            item.final_price = final_price
            item.unit_price = final_price
        await self.db.flush()
        return item

    async def remove_item(
        self,
        price_list_id: UUID,
        item_id: UUID,
        business_id: UUID,
    ) -> bool:
        """Soft-delete an item from a draft price list."""
        pl = await self._get_draft(price_list_id, business_id)
        if not pl:
            return False
        result = await self.db.execute(
            select(PriceListItem).where(
                PriceListItem.id == item_id,
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            return False
        item.soft_delete()
        await self.db.flush()
        return True

    async def bulk_adjust(
        self,
        price_list_id: UUID,
        business_id: UUID,
        percent: Decimal,
        category_id: UUID | None = None,
        brand_id: UUID | None = None,
        supplier_id: UUID | None = None,
    ) -> int:
        """Apply a % increase to base_price of all matching draft items. Returns affected count."""
        pl = await self._get_draft(price_list_id, business_id)
        if not pl:
            raise ValueError("Price list not found or not in draft status")

        items_result = await self.db.execute(
            select(PriceListItem).where(
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
            )
        )
        items = list(items_result.scalars().all())

        # Resolve product filter if category/brand/supplier requested
        filtered_product_ids: set[UUID] | None = None
        if category_id or brand_id or supplier_id:
            product_query = select(Product.id).where(
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
            )
            if category_id:
                product_query = product_query.where(
                    Product.category_id == category_id
                )
            if brand_id:
                product_query = product_query.where(Product.brand_id == brand_id)
            if supplier_id:
                product_query = product_query.where(
                    Product.supplier_id == supplier_id
                )
            pids_result = await self.db.execute(product_query)
            filtered_product_ids = set(pids_result.scalars().all())

        count = 0
        factor = Decimal("1") + percent / Decimal("100")
        for item in items:
            if (
                filtered_product_ids is not None
                and item.product_id not in filtered_product_ids
            ):
                continue
            if item.base_price is None:
                continue
            item.base_price = (Decimal(str(item.base_price)) * factor).quantize(
                Decimal("0.01"), rounding=decimal.ROUND_HALF_UP
            )
            net_price, final_price = calculate_price_list_item_prices(
                base_price=Decimal(str(item.base_price)),
                discount_percent=Decimal(str(item.discount_percent or "0")),
                surcharge_percent=Decimal(str(item.surcharge_percent or "0")),
                tax_percent=Decimal(str(item.tax_percent or item.iva_rate or "21")),
                includes_tax=pl.includes_tax,
            )
            item.net_price = net_price
            item.final_price = final_price
            item.unit_price = final_price
            count += 1

        await self.db.flush()
        return count

    async def duplicate(
        self,
        price_list_id: UUID,
        business_id: UUID,
        name: str,
        valid_from: date | None = None,
        valid_until: date | None = None,
    ) -> PriceList:
        """Duplicate an existing price list into a new draft with incremented version."""
        original = await self.get_by_id(price_list_id, business_id)
        if not original:
            raise ValueError("Price list not found")

        new_pl = PriceList(
            business_id=business_id,
            name=name,
            snapshot_date=original.snapshot_date,
            notes=original.notes,
            description=original.description,
            currency=original.currency,
            includes_tax=original.includes_tax,
            valid_from=valid_from or original.valid_from,
            valid_until=valid_until or original.valid_until,
            status="draft",
            terms_and_conditions=original.terms_and_conditions,
            version=(original.version or 1) + 1,
            previous_version_id=original.id,
            client_type_id=original.client_type_id,
            client_id=original.client_id,
            list_type=original.list_type or "snapshot",
            column_config=original.column_config,
            payment_conditions=original.payment_conditions,
        )
        self.db.add(new_pl)
        await self.db.flush()

        items_result = await self.db.execute(
            select(PriceListItem).where(
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.deleted_at.is_(None),
            )
        )
        for orig_item in items_result.scalars().all():
            new_item = PriceListItem(
                price_list_id=new_pl.id,
                product_id=orig_item.product_id,
                product_code=orig_item.product_code,
                unit_price=orig_item.unit_price,
                description=orig_item.description,
                supplier_code=orig_item.supplier_code,
                brand_name=orig_item.brand_name,
                category_name=orig_item.category_name,
                unit=orig_item.unit,
                quantity_per_package=orig_item.quantity_per_package,
                iva_rate=orig_item.iva_rate,
                base_price=orig_item.base_price,
                discount_percent=orig_item.discount_percent,
                surcharge_percent=orig_item.surcharge_percent,
                net_price=orig_item.net_price,
                tax_percent=orig_item.tax_percent,
                final_price=orig_item.final_price,
                min_quantity=orig_item.min_quantity,
                pack_quantity=orig_item.pack_quantity,
                item_notes=orig_item.item_notes,
            )
            self.db.add(new_item)

        await self.db.flush()
        return new_pl

    async def create_send_log(
        self,
        price_list_id: UUID,
        business_id: UUID,
        data: PriceListSendLogCreate,
        user_id: UUID | None = None,
    ) -> PriceListSendLog:
        """Record a send event for a price list."""
        pl_result = await self.db.execute(
            select(PriceList).where(
                PriceList.id == price_list_id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        if not pl_result.scalar_one_or_none():
            raise ValueError("Price list not found")
        log = PriceListSendLog(
            price_list_id=price_list_id,
            client_id=data.client_id,
            channel=data.channel,
            sent_at=datetime.utcnow(),
            sent_by_user_id=user_id,
            file_url=data.file_url,
            message_preview=data.message_preview,
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def list_send_logs(
        self,
        price_list_id: UUID,
        business_id: UUID,
    ) -> list[PriceListSendLog]:
        """Return send logs for a price list, newest first."""
        pl_result = await self.db.execute(
            select(PriceList).where(
                PriceList.id == price_list_id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        if not pl_result.scalar_one_or_none():
            return []
        result = await self.db.execute(
            select(PriceListSendLog)
            .where(
                PriceListSendLog.price_list_id == price_list_id,
                PriceListSendLog.deleted_at.is_(None),
            )
            .order_by(PriceListSendLog.sent_at.desc())
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_draft(
        self, price_list_id: UUID, business_id: UUID
    ) -> PriceList | None:
        result = await self.db.execute(
            select(PriceList).where(
                PriceList.id == price_list_id,
                PriceList.business_id == business_id,
                PriceList.status == "draft",
                PriceList.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def _get_draft_or_active(
        self, price_list_id: UUID, business_id: UUID
    ) -> PriceList | None:
        result = await self.db.execute(
            select(PriceList).where(
                PriceList.id == price_list_id,
                PriceList.business_id == business_id,
                PriceList.status.in_(["draft", "active"]),
                PriceList.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()
