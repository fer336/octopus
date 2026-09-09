"""Servicio de dataset para retiros de acopio."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.models.stockpile import Stockpile
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.schemas.report_schemas import StockpileWithdrawalsReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class StockpileWithdrawalsReportService(BaseReportService[StockpileWithdrawalsReportFilters]):
    """Construye retiros confirmados desde remitos vinculados a acopios."""

    HEADERS = ["Fecha", "Acopio", "Cliente", "Comprobante", "Código", "Producto", "Cantidad", "Valor"]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: StockpileWithdrawalsReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("stockpile_withdrawals_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: StockpileWithdrawalsReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        result = await self.db.execute(self._query(business_id, filters))
        rows = []
        total_qty = Decimal("0")
        total_value = Decimal("0")

        for voucher, item, stockpile, client in result:
            qty = Decimal(str(item.quantity or 0))
            value = Decimal(str(item.total or 0))
            total_qty += qty
            total_value += value
            rows.append(
                {
                    "Fecha": voucher.date.strftime("%d/%m/%Y"),
                    "Acopio": stockpile.name,
                    "Cliente": client.name,
                    "Comprobante": voucher.full_number,
                    "Código": item.code,
                    "Producto": item.description,
                    "Cantidad": float(qty),
                    "Valor": float(value),
                }
            )

        return self.create_dataset(
            title="Retiros de Acopio",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={"Filas": len(rows), "Cantidad": float(total_qty), "Valor": float(total_value)},
            generated_by=generated_by,
            orientation="landscape",
            metadata={
                "groups": self.build_client_groups(
                    rows,
                    "Cliente",
                    ["Cantidad", "Valor"],
                )
            },
        )

    def _query(self, business_id: UUID, filters: StockpileWithdrawalsReportFilters):
        query = (
            select(Voucher, VoucherItem, Stockpile, Client)
            .join(VoucherItem, VoucherItem.voucher_id == Voucher.id)
            .join(Stockpile, Stockpile.id == Voucher.stockpile_id)
            .join(Client, Client.id == Voucher.client_id)
            .where(
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
                Stockpile.deleted_at.is_(None),
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.voucher_type == VoucherType.RECEIPT,
                Voucher.stockpile_id.is_not(None),
            )
        )
        if filters.stockpile_id:
            query = query.where(Voucher.stockpile_id == filters.stockpile_id)
        if filters.date_from:
            query = query.where(Voucher.date >= filters.date_from)
        if filters.date_to:
            query = query.where(Voucher.date <= filters.date_to)
        return query.order_by(Voucher.date.desc(), Voucher.created_at.desc(), VoucherItem.line_number.asc())

    async def _get_business(self, business_id: UUID) -> Business:
        result = await self.db.execute(
            select(Business).where(Business.id == business_id, Business.deleted_at.is_(None))
        )
        business = result.scalar_one_or_none()
        if not business:
            raise ValueError("Negocio no encontrado")
        return business
