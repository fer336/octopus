"""
Router de reportes PDF.
"""

import io
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.report_schemas import (
    ClientAccountsReportFilters,
    SalesReportFilters,
    StockReportFilters,
    TopProductsReportFilters,
)
from app.services.reporting.client_accounts_report_service import (
    ClientAccountsReportService,
)
from app.services.reporting.sales_report_service import SalesReportService
from app.services.reporting.stock_report_service import StockReportService
from app.services.reporting.top_products_report_service import TopProductsReportService
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)

router = APIRouter(
    prefix="/reports",
    tags=["Reportes"],
    dependencies=[Depends(require_module_access("reports"))],
)


def _pdf_response(pdf_bytes: bytes, filename_prefix: str) -> StreamingResponse:
    today = datetime.now().strftime("%Y_%m_%d")
    filename = f"reporte_{filename_prefix}_{today}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/stock/pdf")
async def export_stock_report_pdf(
    search: str | None = Query(default=None),
    category_id: UUID | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    low_stock_only: bool = Query(default=False),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de stock en PDF."""
    filters = StockReportFilters(
        search=search,
        category_id=category_id,
        supplier_id=supplier_id,
        low_stock_only=low_stock_only,
        include_inactive=include_inactive,
    )
    service = StockReportService(db)
    try:
        pdf_bytes = await service.generate_pdf(
            business_id=business_id,
            filters=filters,
            generated_by=getattr(current_user, "email", None),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _pdf_response(pdf_bytes, "stock")


@router.get("/sales/pdf")
async def export_sales_report_pdf(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_receipts: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de ventas por período en PDF."""
    filters = SalesReportFilters(
        date_from=date_from,
        date_to=date_to,
        include_receipts=include_receipts,
    )
    service = SalesReportService(db)
    try:
        pdf_bytes = await service.generate_pdf(
            business_id=business_id,
            filters=filters,
            generated_by=getattr(current_user, "email", None),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _pdf_response(pdf_bytes, "ventas")


@router.get("/products/pdf")
async def export_products_report_pdf(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de productos más vendidos en PDF."""
    filters = TopProductsReportFilters(
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    service = TopProductsReportService(db)
    try:
        pdf_bytes = await service.generate_pdf(
            business_id=business_id,
            filters=filters,
            generated_by=getattr(current_user, "email", None),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _pdf_response(pdf_bytes, "productos")


@router.get("/accounts/pdf")
async def export_accounts_report_pdf(
    only_with_balance: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de cuentas corrientes en PDF."""
    filters = ClientAccountsReportFilters(only_with_balance=only_with_balance)
    service = ClientAccountsReportService(db)
    try:
        pdf_bytes = await service.generate_pdf(
            business_id=business_id,
            filters=filters,
            generated_by=getattr(current_user, "email", None),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _pdf_response(pdf_bytes, "cuentas_corrientes")
