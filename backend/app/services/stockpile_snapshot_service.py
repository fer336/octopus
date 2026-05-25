"""
Servicio de Snapshots de Precios de Acopio.
Generación de Excel de precios congelados y helper de webhook para n8n.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.stockpile import Stockpile, StockpilePriceSnapshot, StockpileStatus

logger = logging.getLogger("uvicorn")

# Estilos para el Excel
HEADER_FONT = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
HEADER_ALIGNMENT = Alignment(horizontal="center", vertical="center", wrap_text=True)
CELL_ALIGNMENT = Alignment(horizontal="center", vertical="center")
LEFT_ALIGNMENT = Alignment(horizontal="left", vertical="center")
MONEY_FORMAT = '#,##0.00'
PERCENT_FORMAT = '0.00"%"'
DATE_FORMAT = 'DD/MM/YYYY HH:MM'


class StockpileSnapshotService:
    """Servicio para manejar snapshots de precios de acopios."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_snapshots(
        self, stockpile_id: UUID
    ) -> list[StockpilePriceSnapshot]:
        """Obtiene todos los snapshots de un acopio."""
        result = await self.db.execute(
            select(StockpilePriceSnapshot).where(
                StockpilePriceSnapshot.stockpile_id == stockpile_id,
                StockpilePriceSnapshot.deleted_at.is_(None),
            ).order_by(StockpilePriceSnapshot.code)
        )
        return list(result.scalars().all())

    def generate_excel(
        self,
        snapshots: list[StockpilePriceSnapshot],
        stockpile_name: str,
    ) -> io.BytesIO:
        """
        Genera un archivo Excel con los snapshots de precios.

        Columnas: Código, Descripción, Precio sin IVA, IVA %, IVA $,
                  Precio final con IVA, Fecha de congelamiento
        """
        wb = Workbook()
        ws = wb.active
        ws.title = "Precios Congelados"

        # Título
        ws.merge_cells("A1:G1")
        title_cell = ws["A1"]
        title_cell.value = f"Precios congelados - {stockpile_name}"
        title_cell.font = Font(name="Calibri", bold=True, size=14, color="1f2937")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 30

        # Headers
        headers = [
            "Código",
            "Descripción",
            "Precio sin IVA",
            "IVA %",
            "IVA $",
            "Precio final con IVA",
            "Fecha de congelamiento",
        ]

        for col_num, header in enumerate(headers, 1):
            cell = ws.cell(row=3, column=col_num, value=header)
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = HEADER_ALIGNMENT

        ws.row_dimensions[3].height = 25

        # Datos
        for row_num, snap in enumerate(snapshots, 4):
            ws.cell(
                row=row_num, column=1, value=snap.code
            ).alignment = LEFT_ALIGNMENT

            ws.cell(
                row=row_num, column=2, value=snap.description
            ).alignment = LEFT_ALIGNMENT

            price_cell = ws.cell(
                row=row_num, column=3, value=float(snap.price_without_iva)
            )
            price_cell.number_format = MONEY_FORMAT
            price_cell.alignment = CELL_ALIGNMENT

            iva_rate_cell = ws.cell(
                row=row_num, column=4, value=float(snap.iva_rate)
            )
            iva_rate_cell.number_format = PERCENT_FORMAT
            iva_rate_cell.alignment = CELL_ALIGNMENT

            iva_amt_cell = ws.cell(
                row=row_num, column=5, value=float(snap.iva_amount)
            )
            iva_amt_cell.number_format = MONEY_FORMAT
            iva_amt_cell.alignment = CELL_ALIGNMENT

            total_cell = ws.cell(
                row=row_num, column=6, value=float(snap.price_with_iva)
            )
            total_cell.number_format = MONEY_FORMAT
            total_cell.alignment = CELL_ALIGNMENT

            date_cell = ws.cell(
                row=row_num,
                column=7,
                value=(
                    snap.frozen_at.strftime("%d/%m/%Y %H:%M")
                    if snap.frozen_at
                    else ""
                ),
            )
            date_cell.alignment = CELL_ALIGNMENT

        # Ajustar ancho de columnas
        column_widths = [15, 45, 16, 10, 14, 22, 22]
        for i, width in enumerate(column_widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = width

        # Autofilter en el rango de datos
        if snapshots:
            ws.auto_filter.ref = f"A3:G{3 + len(snapshots)}"

        # Freeze panes: fila de headers + columna código
        ws.freeze_panes = "B4"

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    async def dispatch_webhook(
        self,
        stockpile_id: UUID,
        client_email: str | None,
        client_name: str | None,
        business_name: str,
        base_url: str,
    ) -> dict[str, Any]:
        """
        Dispara webhook a n8n para envío de email con Excel adjunto.
        Fire-and-forget con timeout de 5 segundos.
        Retorna {"sent": True} si se envió, {"sent": False, "reason": "..."} si no.
        """
        settings = get_settings()
        webhook_url = settings.N8N_STOCKPILE_WEBHOOK_URL

        if not webhook_url:
            logger.debug("N8N_STOCKPILE_WEBHOOK_URL not configured, skipping webhook dispatch")
            return {"sent": False, "reason": "webhook_url_not_configured"}

        api_key = settings.N8N_STOCKPILE_SNAPSHOT_API_KEY
        snapshot_url = (
            f"{base_url.rstrip('/')}/stockpiles/{stockpile_id}/price-snapshot/excel"
        )

        payload = {
            "event": "stockpile_created",
            "stockpile_id": str(stockpile_id),
            "client_email": client_email or "",
            "client_name": client_name or "",
            "business_name": business_name,
            "snapshot_url": snapshot_url,
            "auth_token": api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()
                logger.info(
                    f"Webhook dispatched for stockpile {stockpile_id}: "
                    f"status={response.status_code}"
                )
                return {"sent": True, "status_code": response.status_code}
        except httpx.TimeoutException:
            logger.warning(f"Webhook timeout for stockpile {stockpile_id}")
            return {"sent": False, "reason": "timeout"}
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Webhook HTTP error for stockpile {stockpile_id}: {e}"
            )
            return {"sent": False, "reason": f"http_{e.response.status_code}"}
        except Exception as e:
            logger.error(
                f"Webhook dispatch failed for stockpile {stockpile_id}: {e}"
            )
            return {"sent": False, "reason": str(e)}
