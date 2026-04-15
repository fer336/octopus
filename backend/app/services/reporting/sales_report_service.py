"""
Servicio de reporte de ventas en PDF.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.schemas.report_schemas import SalesReportFilters
from app.services.reporting.report_pdf_service import report_pdf_service


class SalesReportService:
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
                "date": row.date.strftime("%d/%m/%Y"),
                "voucher_type": str(row.voucher_type.value),
                "number": f"{row.sale_point}-{row.number}",
                "total": float(row.total or 0),
            }
            for row in rows_result
        ]

        context = {
            "business": {
                "name": business.name,
                "cuit": business.cuit,
            },
            "report": {
                "title": "Reporte de Ventas",
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "generated_by": generated_by or "Sistema",
            },
            "filters": {
                "date_from": filters.date_from.strftime("%d/%m/%Y")
                if filters.date_from
                else "—",
                "date_to": filters.date_to.strftime("%d/%m/%Y")
                if filters.date_to
                else "—",
                "include_receipts": filters.include_receipts,
            },
            "summary": {
                "voucher_count": int(count or 0),
                "subtotal": float(Decimal(str(subtotal or 0))),
                "iva": float(Decimal(str(iva or 0))),
                "total": float(Decimal(str(total or 0))),
            },
            "rows": rows,
        }

        return report_pdf_service.render("sales_report.html", context)

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
