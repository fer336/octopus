"""Servicio de dataset para retiros de cuenta corriente."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.business import Business
from app.models.client import Client
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.schemas.report_schemas import CurrentAccountWithdrawalsReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class CurrentAccountWithdrawalsReportService(BaseReportService[CurrentAccountWithdrawalsReportFilters]):
    """Construye retiros de mercadería de cuenta corriente desde remitos válidos."""

    HEADERS = [
        "Fecha",
        "Cliente facturación",
        "Cliente retiro",
        "Comprobante",
        "Código",
        "Producto",
        "Cantidad",
        "Subtotal",
        "IVA",
        "Total",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: CurrentAccountWithdrawalsReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("current_account_withdrawals_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: CurrentAccountWithdrawalsReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)
        result = await self.db.execute(self._query(business_id, filters))
        rows = []
        total_qty = Decimal("0")
        total_subtotal = Decimal("0")
        total_vat = Decimal("0")
        total_value = Decimal("0")

        for voucher, item, billing_client, withdrawal_client in result:
            qty = Decimal(str(item.quantity or 0))
            subtotal = Decimal(str(item.subtotal or 0))
            vat = Decimal(str(item.iva_amount or 0))
            total = Decimal(str(item.total or 0))
            total_qty += qty
            total_subtotal += subtotal
            total_vat += vat
            total_value += total
            rows.append(
                {
                    "Fecha": voucher.date.strftime("%d/%m/%Y"),
                    "Cliente facturación": billing_client.name,
                    "Cliente retiro": withdrawal_client.name,
                    "Comprobante": voucher.full_number,
                    "Código": item.code,
                    "Producto": item.description,
                    "Cantidad": float(qty),
                    "Subtotal": float(subtotal),
                    "IVA": float(vat),
                    "Total": float(total),
                }
            )

        return self.create_dataset(
            title="Retiros de Cuenta Corriente",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={
                "Filas": len(rows),
                "Cantidad": float(total_qty),
                "Subtotal": float(total_subtotal),
                "IVA": float(total_vat),
                "Total": float(total_value),
            },
            generated_by=generated_by,
            orientation="landscape",
        )

    def _query(self, business_id: UUID, filters: CurrentAccountWithdrawalsReportFilters):
        billing_client = aliased(Client)
        withdrawal_client = aliased(Client)
        query = (
            select(Voucher, VoucherItem, billing_client, withdrawal_client)
            .join(VoucherItem, VoucherItem.voucher_id == Voucher.id)
            .join(billing_client, billing_client.id == Voucher.billing_client_id)
            .join(withdrawal_client, withdrawal_client.id == Voucher.operating_client_id)
            .where(
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.voucher_type == VoucherType.RECEIPT,
                Voucher.is_current_account.is_(True),
                Voucher.is_current_account_closure.is_(False),
                Voucher.is_return_receipt.is_(False),
                Voucher.stockpile_id.is_(None),
            )
        )
        if filters.client_id:
            query = query.where(Voucher.billing_client_id == filters.client_id)
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
