"""
Servicio de reporte de stock en PDF.
"""

from datetime import datetime, date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.voucher import Voucher, VoucherStatus
from app.models.voucher_item import VoucherItem
from app.schemas.report_schemas import StockReportFilters
from app.services.reporting.report_pdf_service import report_pdf_service


class StockReportService:
    """Genera el reporte PDF de estado de stock."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: StockReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        business = await self._get_business(business_id)
        products = await self._get_products(business_id, filters)

        # Obtener última fecha de venta por producto
        last_sales = await self._get_last_sale_dates(business_id, [p.id for p in products])
        today = date.today()
        expiring_soon_threshold = today + timedelta(days=30)

        rows: list[dict] = []
        total_stock_units = 0
        total_stock_value = Decimal("0")
        low_stock_items = 0
        stagnant_items = 0  # +90 días sin vender
        total_expired_lots = 0
        total_expiring_soon_lots = 0

        for product in products:
            current_stock = int(product.current_stock or 0)
            sale_price = Decimal(str(product.sale_price or 0))
            row_stock_value = sale_price * Decimal(current_stock)
            is_low_stock = current_stock <= int(product.minimum_stock or 0)

            if is_low_stock:
                low_stock_items += 1

            total_stock_units += current_stock
            total_stock_value += row_stock_value

            last_sale_date = last_sales.get(product.id)
            days_without_sale = (today - last_sale_date).days if last_sale_date else None
            if days_without_sale is not None and days_without_sale > 90:
                stagnant_items += 1

            # Información de lotes
            next_expiration = product.next_expiration
            active_lots = [
                lot for lot in product.lots
                if not lot.deleted_at and lot.quantity > 0
            ]
            expired_lots_count = sum(
                1 for lot in active_lots
                if lot.expiration_date and lot.expiration_date < today
            )
            lots_expiring_soon_count = sum(
                1 for lot in active_lots
                if lot.expiration_date
                and today <= lot.expiration_date <= expiring_soon_threshold
            )
            total_expired_lots += expired_lots_count
            total_expiring_soon_lots += lots_expiring_soon_count

            rows.append(
                {
                    "code": product.code,
                    "supplier_code": product.supplier_code or "—",
                    "description": product.description,
                    "category_name": product.category.name if product.category else "—",
                    "supplier_name": product.supplier.name if product.supplier else "—",
                    "current_stock": current_stock,
                    "minimum_stock": int(product.minimum_stock or 0),
                    "sale_price": float(sale_price),
                    "stock_value": float(row_stock_value),
                    "is_low_stock": is_low_stock,
                    "is_active": bool(product.is_active),
                    "last_sale_date": last_sale_date.strftime("%d/%m/%Y") if last_sale_date else "—",
                    "days_without_sale": days_without_sale if last_sale_date else None,
                    "next_expiration": next_expiration.strftime("%d/%m/%Y") if next_expiration else None,
                    "expired_lots_count": expired_lots_count,
                    "lots_expiring_soon_count": lots_expiring_soon_count,
                }
            )

        # Actualizar summary con items estancados e info de lotes
        context = await self._build_context(
            business, rows, filters, generated_by,
            total_stock_units, total_stock_value, low_stock_items, stagnant_items,
            total_expired_lots, total_expiring_soon_lots,
        )

        return report_pdf_service.render("stock_report.html", context)

    async def _get_last_sale_dates(
        self, business_id: UUID, product_ids: list[UUID]
    ) -> dict[UUID, date]:
        """Retorna {product_id: última_fecha_venta} para productos vendidos."""
        if not product_ids:
            return {}

        subq = (
            select(
                VoucherItem.product_id,
                func.max(Voucher.created_at).label("last_sale"),
            )
            .join(Voucher, Voucher.id == VoucherItem.voucher_id)
            .where(
                VoucherItem.product_id.in_(product_ids),
                Voucher.business_id == business_id,
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.deleted_at.is_(None),
            )
            .group_by(VoucherItem.product_id)
        )

        result = await self.db.execute(subq)
        return {row.product_id: row.last_sale.date() for row in result}

    async def _build_context(
        self,
        business,
        rows,
        filters,
        generated_by,
        total_stock_units,
        total_stock_value,
        low_stock_items,
        stagnant_items,
        total_expired_lots=0,
        total_expiring_soon_lots=0,
    ):
        return {
            "business": {
                "name": business.name,
                "cuit": business.cuit,
                "address": business.address,
                "city": business.city,
                "province": business.province,
                "phone": business.phone,
                "email": business.email,
            },
            "report": {
                "title": "Reporte de Stock",
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "generated_by": generated_by or "Sistema",
            },
            "filters": {
                "search": filters.search or "—",
                "low_stock_only": filters.low_stock_only,
                "include_inactive": filters.include_inactive,
            },
            "summary": {
                "total_items": len(rows),
                "low_stock_items": low_stock_items,
                "stagnant_items": stagnant_items,
                "total_stock_units": total_stock_units,
                "total_stock_value": float(total_stock_value),
                "total_expired_lots": total_expired_lots,
                "total_expiring_soon_lots": total_expiring_soon_lots,
            },
            "rows": rows,
        }

    async def _get_business(self, business_id: UUID) -> Business:
        result = await self.db.execute(
            select(Business).where(
                Business.id == business_id,
                Business.deleted_at.is_(None),
            )
        )
        business = result.scalar_one_or_none()
        if not business:
            raise ValueError("Negocio no encontrado")
        return business

    async def _get_products(
        self, business_id: UUID, filters: StockReportFilters
    ) -> list[Product]:
        query = (
            select(Product)
            .options(
                selectinload(Product.category),
                selectinload(Product.supplier),
                selectinload(Product.lots),
            )
            .where(
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
            )
        )

        if not filters.include_inactive:
            query = query.where(Product.is_active.is_(True))

        if filters.search:
            search = f"%{filters.search}%"
            query = query.where(
                or_(
                    Product.code.ilike(search),
                    Product.supplier_code.ilike(search),
                    Product.description.ilike(search),
                )
            )

        if filters.category_id:
            query = query.where(Product.category_id == filters.category_id)

        if filters.supplier_id:
            query = query.where(Product.supplier_id == filters.supplier_id)

        if filters.low_stock_only:
            stock_subq = (
                select(
                    ProductLot.product_id.label("product_id"),
                    func.coalesce(func.sum(ProductLot.quantity), 0).label("stock"),
                )
                .where(
                    ProductLot.business_id == business_id,
                    ProductLot.deleted_at.is_(None),
                )
                .group_by(ProductLot.product_id)
                .subquery()
            )
            current_stock_expr = func.coalesce(stock_subq.c.stock, 0)
            query = query.outerjoin(
                stock_subq,
                stock_subq.c.product_id == Product.id,
            )
            query = query.where(current_stock_expr <= Product.minimum_stock)

        query = query.order_by(Product.description.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())
