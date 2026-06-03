"""
Service for Price Lists.
"""

from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.price_list import PriceList, PriceListItem
from app.models.product import Product
from app.schemas.price_list import PriceListCreate


class PriceListService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_all(self, business_id: UUID) -> list[PriceList]:
        """Return all price lists for a business ordered by snapshot_date DESC."""
        result = await self.db.execute(
            select(PriceList)
            .where(
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
            .order_by(PriceList.snapshot_date.desc())
        )
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
            .options(selectinload(PriceList.items))
            .where(
                PriceList.id == id,
                PriceList.business_id == business_id,
                PriceList.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, data: PriceListCreate, business_id: UUID) -> PriceList:
        """Create a price list together with all its items in one transaction."""
        price_list = PriceList(
            business_id=business_id,
            name=data.name,
            snapshot_date=data.snapshot_date,
            notes=data.notes,
        )
        self.db.add(price_list)
        await self.db.flush()  # obtain the generated id

        for item_data in data.items:
            item = PriceListItem(
                price_list_id=price_list.id,
                product_code=item_data.product_code,
                unit_price=item_data.unit_price,
            )
            self.db.add(item)

        await self.db.flush()
        return price_list

    async def delete(self, id: UUID, business_id: UUID) -> bool:
        """Soft-delete a price list. Returns False if not found."""
        from datetime import datetime

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
        )
        self.db.add(price_list)
        await self.db.flush()

        for product in products:
            item = PriceListItem(
                price_list_id=price_list.id,
                product_code=product.code,
                unit_price=product.sale_price,
            )
            self.db.add(item)

        await self.db.flush()
        return price_list
