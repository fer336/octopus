"""
Servicio de reporte de productos más vendidos en PDF.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.schemas.report_schemas import TopProductsReportFilters
from app.services.reporting.report_pdf_service import report_pdf_service


class TopProductsReportService:
    """Genera reporte de ranking de productos vendidos."""

    _SALES_TYPES = [
        VoucherType.RECEIPT,
        VoucherType.INVOICE_A,
        VoucherType.INVOICE_B,
        VoucherType.INVOICE_C,
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: TopProductsReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        business = await self._get_business(business_id)

        conditions = [
            Voucher.business_id == business_id,
            Voucher.deleted_at.is_(None),
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.voucher_type.in_(self._SALES_TYPES),
        ]
        if filters.date_from:
            conditions.append(Voucher.date >= filters.date_from)
        if filters.date_to:
            conditions.append(Voucher.date <= filters.date_to)

        query = (
            select(
                VoucherItem.code,
                VoucherItem.description,
                func.coalesce(func.sum(VoucherItem.quantity), 0).label("qty"),
                func.coalesce(func.sum(VoucherItem.total), 0).label("amount"),
                func.count(func.distinct(Voucher.id)).label("vouchers_count"),
            )
            .join(Voucher, Voucher.id == VoucherItem.voucher_id)
            .where(and_(*conditions))
            .group_by(VoucherItem.code, VoucherItem.description)
            .order_by(func.sum(VoucherItem.total).desc())
            .limit(filters.limit)
        )
        result = await self.db.execute(query)

        rows = []
        total_amount = Decimal("0")
        total_qty = Decimal("0")
        for row in result:
            amount = Decimal(str(row.amount or 0))
            qty = Decimal(str(row.qty or 0))
            total_amount += amount
            total_qty += qty
            rows.append(
                {
                    "code": row.code,
                    "description": row.description,
                    "quantity": float(qty),
                    "amount": float(amount),
                    "vouchers_count": int(row.vouchers_count or 0),
                }
            )

        context = {
            "business": {
                "name": business.name,
                "cuit": business.cuit,
            },
            "report": {
                "title": "Reporte de Productos Más Vendidos",
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
                "limit": filters.limit,
            },
            "summary": {
                "rows": len(rows),
                "total_qty": float(total_qty),
                "total_amount": float(total_amount),
            },
            "rows": rows,
        }

        return report_pdf_service.render("products_report.html", context)

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
