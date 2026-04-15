"""
Servicio de reporte de cuentas corrientes en PDF.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.schemas.report_schemas import ClientAccountsReportFilters
from app.services.reporting.report_pdf_service import report_pdf_service


class ClientAccountsReportService:
    """Genera reporte de saldos de cuenta corriente por cliente."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pdf(
        self,
        business_id: UUID,
        filters: ClientAccountsReportFilters,
        generated_by: str | None = None,
    ) -> bytes:
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
                    "name": client.name,
                    "document": f"{client.document_type} {client.document_number}",
                    "tax_condition": client.tax_condition,
                    "balance": float(balance),
                    "credit_limit": float(Decimal(str(client.credit_limit or 0))),
                    "status": status,
                }
            )

        context = {
            "business": {
                "name": business.name,
                "cuit": business.cuit,
            },
            "report": {
                "title": "Reporte de Cuentas Corrientes",
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "generated_by": generated_by or "Sistema",
            },
            "filters": {
                "only_with_balance": filters.only_with_balance,
            },
            "summary": {
                "clients_count": len(rows),
                "debt_total": float(debt_total),
                "favor_total": float(favor_total),
            },
            "rows": rows,
        }

        return report_pdf_service.render("accounts_report.html", context)

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
