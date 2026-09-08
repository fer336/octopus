"""
Servicio de reporte de ventas en PDF.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.schemas.report_schemas import SalesReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class SalesReportService(BaseReportService[SalesReportFilters]):
    """Genera reporte de ventas por período."""

    _BASE_TYPES = [
        VoucherType.INVOICE_A,
        VoucherType.INVOICE_B,
        VoucherType.INVOICE_C,
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: SalesReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("sales_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: SalesReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        voucher_types = list(self._BASE_TYPES)
        if filters.include_receipts:
            voucher_types.append(VoucherType.RECEIPT)

        conditions = [
            Voucher.business_id == business_id,
            Voucher.deleted_at.is_(None),
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.voucher_type.in_(voucher_types),
        ]

        if filters.date_from:
            conditions.append(Voucher.date >= filters.date_from)
        if filters.date_to:
            conditions.append(Voucher.date <= filters.date_to)

        summary_query = select(
            func.count(Voucher.id),
            func.coalesce(func.sum(Voucher.subtotal), 0),
            func.coalesce(func.sum(Voucher.iva_amount), 0),
            func.coalesce(func.sum(Voucher.total), 0),
        ).where(and_(*conditions))
        summary_result = await self.db.execute(summary_query)
        count, subtotal, iva, total = summary_result.one()

        rows_query = (
            select(
                Voucher.date,
                Voucher.voucher_type,
                Voucher.sale_point,
                Voucher.number,
                Voucher.total,
            )
            .where(and_(*conditions))
            .order_by(Voucher.date.desc(), Voucher.created_at.desc())
            .limit(500)
        )
        rows_result = await self.db.execute(rows_query)

        rows = [
            {
                "Fecha": row.date.strftime("%d/%m/%Y"),
                "Tipo": str(row.voucher_type.value),
                "Número": f"{row.sale_point}-{row.number}",
                "Total": float(row.total or 0),
            }
            for row in rows_result
        ]

        return self.create_dataset(
            title="Reporte de Ventas",
            business=business,
            filters=filters,
            headers=["Fecha", "Tipo", "Número", "Total"],
            rows=rows,
            totals={
                "Comprobantes": int(count or 0),
                "Subtotal": float(Decimal(str(subtotal or 0))),
                "IVA": float(Decimal(str(iva or 0))),
                "Total": float(Decimal(str(total or 0))),
            },
            generated_by=generated_by,
            orientation="portrait",
        )

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
