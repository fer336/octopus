"""Servicio de dataset para historial de órdenes de pedido."""

from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.purchase_order import PurchaseOrder, PurchaseOrderStatus
from app.schemas.report_schemas import PurchaseOrderHistoryReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class PurchaseOrderHistoryReportService(BaseReportService[PurchaseOrderHistoryReportFilters]):
    """Construye el historial exportable de órdenes de pedido."""

    HEADERS = ["Número", "Fecha", "Proveedor", "Categoría", "Ítems", "Estado", "Subtotal", "IVA", "Total"]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: PurchaseOrderHistoryReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("purchase_order_history_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: PurchaseOrderHistoryReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        orders = await self._get_orders(business_id, filters)
        rows: list[dict] = []
        total_items = 0
        subtotal = Decimal("0")
        vat = Decimal("0")
        total = Decimal("0")

        for order in orders:
            item_count = len([item for item in order.items if not item.deleted_at])
            total_items += item_count
            subtotal += Decimal(str(order.subtotal or 0))
            vat += Decimal(str(order.total_iva or 0))
            total += Decimal(str(order.total or 0))
            rows.append(
                {
                    "Número": order.full_number,
                    "Fecha": order.created_at.strftime("%d/%m/%Y"),
                    "Proveedor": order.supplier.name if order.supplier else "—",
                    "Categoría": order.category.name if order.category else "—",
                    "Ítems": item_count,
                    "Estado": order.status.value,
                    "Subtotal": float(Decimal(str(order.subtotal or 0))),
                    "IVA": float(Decimal(str(order.total_iva or 0))),
                    "Total": float(Decimal(str(order.total or 0))),
                }
            )

        return self.create_dataset(
            title="Historial de Órdenes de Pedido",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={
                "Órdenes": len(rows),
                "Ítems": total_items,
                "Subtotal": float(subtotal),
                "IVA": float(vat),
                "Total": float(total),
            },
            generated_by=generated_by,
            orientation="landscape",
        )

    async def _get_business(self, business_id: UUID) -> Business:
        result = await self.db.execute(
            select(Business).where(Business.id == business_id, Business.deleted_at.is_(None))
        )
        business = result.scalar_one_or_none()
        if not business:
            raise ValueError("Negocio no encontrado")
        return business

    async def _get_orders(
        self, business_id: UUID, filters: PurchaseOrderHistoryReportFilters
    ) -> list[PurchaseOrder]:
        query = (
            select(PurchaseOrder)
            .options(
                selectinload(PurchaseOrder.supplier),
                selectinload(PurchaseOrder.category),
                selectinload(PurchaseOrder.items),
            )
            .where(PurchaseOrder.business_id == business_id, PurchaseOrder.deleted_at.is_(None))
        )
        if filters.supplier_id:
            query = query.where(PurchaseOrder.supplier_id == filters.supplier_id)
        if filters.status:
            query = query.where(PurchaseOrder.status == PurchaseOrderStatus(filters.status))
        if filters.date_from:
            query = query.where(PurchaseOrder.created_at >= datetime.combine(filters.date_from, time.min))
        if filters.date_to:
            query = query.where(PurchaseOrder.created_at <= datetime.combine(filters.date_to, time.max))
        query = query.order_by(PurchaseOrder.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())
