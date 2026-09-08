"""Servicio de dataset para reporte por categoría."""

from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.product import Product
from app.schemas.report_schemas import CategoryReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class CategoryReportService(BaseReportService[CategoryReportFilters]):
    """Construye filas agrupables para análisis de productos por categoría."""

    HEADERS = [
        "Categoría",
        "Código",
        "Descripción",
        "Proveedor",
        "Stock",
        "Precio Venta",
        "Valor Stock",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: CategoryReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("category_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: CategoryReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        products = await self._get_products(business_id, filters)
        rows: list[dict] = []
        category_names: set[str] = set()
        total_units = 0
        total_stock_value = Decimal("0")

        for product in products:
            stock = int(product.current_stock or 0)
            sale_price = Decimal(str(product.sale_price or 0))
            stock_value = sale_price * Decimal(stock)
            category_name = product.category.name if product.category else "Sin categoría"
            category_names.add(category_name)
            total_units += stock
            total_stock_value += stock_value
            rows.append(
                {
                    "Categoría": category_name,
                    "Código": product.code,
                    "Descripción": product.description,
                    "Proveedor": product.supplier.name if product.supplier else "—",
                    "Stock": stock,
                    "Precio Venta": float(sale_price),
                    "Valor Stock": float(stock_value),
                }
            )

        return self.create_dataset(
            title="Reporte por Categoría",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={
                "Categorías": len(category_names),
                "Productos": len(rows),
                "Unidades": total_units,
                "Valor stock": float(total_stock_value),
            },
            generated_by=generated_by,
            orientation="portrait",
        )

    async def _get_business(self, business_id: UUID) -> Business:
        result = await self.db.execute(
            select(Business).where(Business.id == business_id, Business.deleted_at.is_(None))
        )
        business = result.scalar_one_or_none()
        if not business:
            raise ValueError("Negocio no encontrado")
        return business

    async def _get_products(
        self, business_id: UUID, filters: CategoryReportFilters
    ) -> list[Product]:
        query = (
            select(Product)
            .options(selectinload(Product.category), selectinload(Product.supplier), selectinload(Product.lots))
            .where(Product.business_id == business_id, Product.deleted_at.is_(None), Product.is_active.is_(True))
        )
        if filters.category_id:
            query = query.where(Product.category_id == filters.category_id)
        if filters.date_from:
            query = query.where(Product.created_at >= datetime.combine(filters.date_from, time.min))
        if filters.date_to:
            query = query.where(Product.created_at <= datetime.combine(filters.date_to, time.max))
        query = query.order_by(Product.category_id.asc(), Product.description.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())
