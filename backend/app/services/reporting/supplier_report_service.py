"""Servicio de dataset para reporte por proveedor."""

from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.product import Product
from app.models.supplier import Supplier
from app.schemas.report_schemas import SupplierReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class SupplierReportService(BaseReportService[SupplierReportFilters]):
    """Construye filas de productos por proveedor con precios y márgenes."""

    HEADERS = [
        "Proveedor",
        "CUIT",
        "Código",
        "Descripción",
        "Categoría",
        "Stock",
        "Precio Lista",
        "Bonificaciones",
        "Costo",
        "Precio Venta",
        "Margen %",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: SupplierReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("supplier_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: SupplierReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        products = await self._get_products(business_id, filters)
        supplier = await self._get_supplier(filters.supplier_id) if filters.supplier_id else None
        rows: list[dict] = []
        supplier_names: set[str] = set()
        total_stock = 0
        total_stock_value = Decimal("0")
        margin_total = Decimal("0")

        for product in products:
            stock = int(product.current_stock or 0)
            cost = Decimal(str(product.cost_price or 0))
            sale_price = Decimal(str(product.sale_price or 0))
            margin = self._margin_percent(cost, sale_price)
            supplier_name = product.supplier.name if product.supplier else "Sin proveedor"
            supplier_names.add(supplier_name)
            total_stock += stock
            total_stock_value += cost * Decimal(stock)
            margin_total += margin
            rows.append(
                {
                    "Proveedor": supplier_name,
                    "CUIT": product.supplier.cuit if product.supplier and product.supplier.cuit else "—",
                    "Código": product.code,
                    "Descripción": product.description,
                    "Categoría": product.category.name if product.category else "—",
                    "Stock": stock,
                    "Precio Lista": float(Decimal(str(product.list_price or 0))),
                    "Bonificaciones": product.discount_display or "—",
                    "Costo": float(cost),
                    "Precio Venta": float(sale_price),
                    "Margen %": float(margin),
                }
            )

        dataset = self.create_dataset(
            title="Reporte por Proveedor",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={
                "Proveedores": len(supplier_names),
                "Productos": len(rows),
                "Stock": total_stock,
                "Valor stock": float(total_stock_value),
                "Margen promedio": float(margin_total / len(rows)) if rows else 0.0,
            },
            generated_by=generated_by,
            orientation="landscape",
        )
        if supplier:
            dataset.filters = self._supplier_filters(supplier)
        return dataset

    @staticmethod
    def _margin_percent(cost: Decimal, sale_price: Decimal) -> Decimal:
        if cost == 0:
            return Decimal("0")
        return round((sale_price - cost) * Decimal("100") / cost, 2)

    @staticmethod
    def _supplier_filters(supplier: Supplier) -> dict[str, str]:
        contact_parts = [supplier.contact_name, supplier.phone, supplier.email]
        filters = {"Proveedor": supplier.name}
        if supplier.cuit:
            filters["CUIT"] = supplier.cuit
        contact = " · ".join(part for part in contact_parts if part)
        if contact:
            filters["Contacto"] = contact
        return filters

    async def _get_business(self, business_id: UUID) -> Business:
        result = await self.db.execute(
            select(Business).where(Business.id == business_id, Business.deleted_at.is_(None))
        )
        business = result.scalar_one_or_none()
        if not business:
            raise ValueError("Negocio no encontrado")
        return business

    async def _get_supplier(self, supplier_id: UUID) -> Supplier | None:
        result = await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id, Supplier.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def _get_products(
        self, business_id: UUID, filters: SupplierReportFilters
    ) -> list[Product]:
        query = (
            select(Product)
            .options(selectinload(Product.category), selectinload(Product.supplier), selectinload(Product.lots))
            .where(Product.business_id == business_id, Product.deleted_at.is_(None), Product.is_active.is_(True))
        )
        if filters.supplier_id:
            query = query.where(Product.supplier_id == filters.supplier_id)
        if filters.only_with_stock:
            query = query.where(Product.lots.any())
        if filters.date_from:
            query = query.where(Product.created_at >= datetime.combine(filters.date_from, time.min))
        if filters.date_to:
            query = query.where(Product.created_at <= datetime.combine(filters.date_to, time.max))
        query = query.order_by(Product.supplier_id.asc(), Product.description.asc())
        result = await self.db.execute(query)
        return [product for product in result.scalars().all() if not filters.only_with_stock or product.current_stock > 0]
