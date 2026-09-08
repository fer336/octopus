"""
Servicio de reporte de cuentas corrientes en PDF.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.schemas.report_schemas import ClientAccountsReportFilters
from app.services.reporting.base_report_service import BaseReportService, ReportDataset
from app.services.reporting.report_pdf_service import report_pdf_service


class ClientAccountsReportService(BaseReportService[ClientAccountsReportFilters]):
    """Genera reporte de saldos de cuenta corriente por cliente."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: ClientAccountsReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
        dataset = await self.build_dataset(business_id, filters, generated_by)
        return report_pdf_service.render_dataset("accounts_report.html", dataset)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: ClientAccountsReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        business = await self._get_business(business_id)

        query = select(Client).where(
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        )
        if filters.only_with_balance:
            query = query.where(Client.current_balance != 0)
        query = query.order_by(Client.current_balance.desc(), Client.name.asc())

        result = await self.db.execute(query)
        clients = list(result.scalars().all())

        rows = []
        debt_total = Decimal("0")
        favor_total = Decimal("0")
        for client in clients:
            balance = Decimal(str(client.current_balance or 0))
            if balance > 0:
                debt_total += balance
                status = "Deudor"
            elif balance < 0:
                favor_total += abs(balance)
                status = "A favor"
            else:
                status = "Al día"

            rows.append(
                {
                    "Cliente": client.name,
                    "Documento": f"{client.document_type} {client.document_number}",
                    "Condición IVA": client.tax_condition,
                    "Estado": status,
                    "Saldo": float(balance),
                    "Límite crédito": float(Decimal(str(client.credit_limit or 0))),
                }
            )

        return self.create_dataset(
            title="Reporte de Cuentas Corrientes",
            business=business,
            filters=filters,
            headers=["Cliente", "Documento", "Condición IVA", "Estado", "Saldo", "Límite crédito"],
            rows=rows,
            totals={
                "Clientes": len(rows),
                "Deuda": float(debt_total),
                "A favor": float(favor_total),
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
