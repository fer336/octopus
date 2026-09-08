"""
Router de reportes con exportación PDF, Excel y CSV.
"""

import io
from collections.abc import Callable
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.report_schemas import (
    CategoryReportFilters,
    ClientAccountsReportFilters,
    CurrentAccountWithdrawalsReportFilters,
    InventoryCountReportFilters,
    PurchaseOrderHistoryReportFilters,
    ReportFormat,
    SalesReportFilters,
    StockReportFilters,
    StockpileWithdrawalsReportFilters,
    SupplierReportFilters,
    TopProductsReportFilters,
)
from app.services.export_service import EXPORT_CONTENT_TYPES, ExportService
from app.services.reporting.base_report_service import ReportDataset, ReportRowProvider
from app.services.reporting.category_report_service import CategoryReportService
from app.services.reporting.client_accounts_report_service import ClientAccountsReportService
from app.services.reporting.current_account_withdrawals_report_service import (
    CurrentAccountWithdrawalsReportService,
)
from app.services.reporting.inventory_count_report_service import InventoryCountReportService
from app.services.reporting.purchase_order_history_report_service import (
    PurchaseOrderHistoryReportService,
)
from app.services.reporting.sales_report_service import SalesReportService
from app.services.reporting.stock_report_service import StockReportService
from app.services.reporting.stockpile_withdrawals_report_service import (
    StockpileWithdrawalsReportService,
)
from app.services.reporting.supplier_report_service import SupplierReportService
from app.services.reporting.top_products_report_service import TopProductsReportService
from app.services.reporting.report_pdf_service import report_pdf_service
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

REPORT_FILTERS: dict[str, set[str]] = {
    "stock": {"search", "category_id", "supplier_id", "low_stock_only", "include_inactive"},
    "sales": {"date_from", "date_to", "include_receipts"},
    "top-products": {"date_from", "date_to", "limit"},
    "client-accounts": {"only_with_balance"},
    "inventory-count": {"supplier_id", "category_id"},
    "category": {"date_from", "date_to", "category_id"},
    "supplier": {"date_from", "date_to", "supplier_id", "only_with_stock"},
    "purchase-order-history": {"date_from", "date_to", "supplier_id", "status"},
    "stockpile-withdrawals": {"date_from", "date_to", "stockpile_id"},
    "current-account-withdrawals": {"date_from", "date_to", "client_id"},
}


def _validate_allowed_filters(request: Request, report_key: str) -> None:
    """Rechaza parámetros de query no declarados para el reporte."""
    allowed = REPORT_FILTERS[report_key] | {"format"}
    unknown = sorted(set(request.query_params.keys()) - allowed)
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Filtro no permitido: {', '.join(unknown)}",
        )


def _format_filename(prefix: str, report_format: ReportFormat) -> str:
    """Genera nombre de descarga consistente por formato."""
    today = datetime.now().strftime("%Y_%m_%d")
    return f"reporte_{prefix}_{today}.{report_format}"


def _report_response(
    dataset: ReportDataset,
    report_format: ReportFormat,
    filename_prefix: str,
    template_name: str,
) -> StreamingResponse:
    """Convierte un dataset compartido en la respuesta solicitada."""
    filename = _format_filename(filename_prefix, report_format)
    if report_format == "pdf":
        content = report_pdf_service.render_dataset(template_name, dataset)
        media_type = EXPORT_CONTENT_TYPES["pdf"]
    elif report_format == "xlsx":
        content = ExportService.to_excel(dataset.rows, dataset.title, headers=dataset.headers)
        media_type = EXPORT_CONTENT_TYPES["excel"]
    else:
        content = ExportService.to_csv(dataset.rows, headers=dataset.headers).encode("utf-8")
        media_type = EXPORT_CONTENT_TYPES["csv"]

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _build_and_render_report(
    *,
    provider: ReportRowProvider,
    filters: Any,
    business_id: UUID,
    generated_by: str | None,
    report_format: ReportFormat,
    filename_prefix: str,
    template_name: str,
) -> StreamingResponse:
    """Construye dataset y devuelve archivo descargable."""
    try:
        dataset = await provider.build_dataset(business_id, filters, generated_by=generated_by)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return _report_response(dataset, report_format, filename_prefix, template_name)


def _filters_or_400(factory: Callable[[], Any]) -> Any:
    """Convierte errores de validación de filtros en HTTP 400."""
    try:
        return factory()
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/stock")
async def export_stock_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    search: str | None = Query(default=None),
    category_id: UUID | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    low_stock_only: bool = Query(default=False),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de stock."""
    _validate_allowed_filters(request, "stock")
    filters = _filters_or_400(
        lambda: StockReportFilters(
            search=search,
            category_id=category_id,
            supplier_id=supplier_id,
            low_stock_only=low_stock_only,
            include_inactive=include_inactive,
        )
    )
    return await _build_and_render_report(
        provider=StockReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="stock",
        template_name="stock_report.html",
    )


@router.get("/sales")
async def export_sales_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_receipts: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de ventas por período."""
    _validate_allowed_filters(request, "sales")
    filters = _filters_or_400(
        lambda: SalesReportFilters(
            date_from=date_from,
            date_to=date_to,
            include_receipts=include_receipts,
        )
    )
    return await _build_and_render_report(
        provider=SalesReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="ventas",
        template_name="sales_report.html",
    )


@router.get("/top-products")
async def export_top_products_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de productos más vendidos."""
    _validate_allowed_filters(request, "top-products")
    filters = _filters_or_400(
        lambda: TopProductsReportFilters(date_from=date_from, date_to=date_to, limit=limit)
    )
    return await _build_and_render_report(
        provider=TopProductsReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="productos",
        template_name="products_report.html",
    )


@router.get("/client-accounts")
async def export_client_accounts_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    only_with_balance: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte de cuentas corrientes."""
    _validate_allowed_filters(request, "client-accounts")
    filters = _filters_or_400(
        lambda: ClientAccountsReportFilters(only_with_balance=only_with_balance)
    )
    return await _build_and_render_report(
        provider=ClientAccountsReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="cuentas_corrientes",
        template_name="accounts_report.html",
    )


@router.get("/inventory-count")
async def export_inventory_count_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    supplier_id: UUID | None = Query(default=None),
    category_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta la planilla de conteo de inventario desde el hub de reportes."""
    _validate_allowed_filters(request, "inventory-count")
    filters = _filters_or_400(
        lambda: InventoryCountReportFilters(
            supplier_id=supplier_id,
            category_id=category_id,
        )
    )
    return await _build_and_render_report(
        provider=InventoryCountReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="planilla_conteo",
        template_name="inventory_count.html",
    )


@router.get("/category")
async def export_category_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    category_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte por categoría."""
    _validate_allowed_filters(request, "category")
    filters = _filters_or_400(
        lambda: CategoryReportFilters(
            date_from=date_from,
            date_to=date_to,
            category_id=category_id,
        )
    )
    return await _build_and_render_report(
        provider=CategoryReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="categorias",
        template_name="category_report.html",
    )


@router.get("/supplier")
async def export_supplier_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    only_with_stock: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el reporte por proveedor."""
    _validate_allowed_filters(request, "supplier")
    filters = _filters_or_400(
        lambda: SupplierReportFilters(
            date_from=date_from,
            date_to=date_to,
            supplier_id=supplier_id,
            only_with_stock=only_with_stock,
        )
    )
    return await _build_and_render_report(
        provider=SupplierReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="proveedores",
        template_name="supplier_report.html",
    )


@router.get("/purchase-order-history")
async def export_purchase_order_history_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta el historial de órdenes de pedido."""
    _validate_allowed_filters(request, "purchase-order-history")
    filters = _filters_or_400(
        lambda: PurchaseOrderHistoryReportFilters(
            date_from=date_from,
            date_to=date_to,
            supplier_id=supplier_id,
            status=status,
        )
    )
    return await _build_and_render_report(
        provider=PurchaseOrderHistoryReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="historial_ordenes",
        template_name="purchase_order_history_report.html",
    )


@router.get("/stockpile-withdrawals")
async def export_stockpile_withdrawals_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    stockpile_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta los retiros de acopio."""
    _validate_allowed_filters(request, "stockpile-withdrawals")
    filters = _filters_or_400(
        lambda: StockpileWithdrawalsReportFilters(
            date_from=date_from,
            date_to=date_to,
            stockpile_id=stockpile_id,
        )
    )
    return await _build_and_render_report(
        provider=StockpileWithdrawalsReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="retiros_acopio",
        template_name="stockpile_withdrawals_report.html",
    )


@router.get("/current-account-withdrawals")
async def export_current_account_withdrawals_report(
    request: Request,
    report_format: ReportFormat = Query(default="pdf", alias="format"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    client_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Exporta retiros de mercadería por cuenta corriente."""
    _validate_allowed_filters(request, "current-account-withdrawals")
    filters = _filters_or_400(
        lambda: CurrentAccountWithdrawalsReportFilters(
            date_from=date_from,
            date_to=date_to,
            client_id=client_id,
        )
    )
    return await _build_and_render_report(
        provider=CurrentAccountWithdrawalsReportService(db),
        filters=filters,
        business_id=business_id,
        generated_by=getattr(current_user, "email", None),
        report_format=report_format,
        filename_prefix="retiros_cuenta_corriente",
        template_name="current_account_withdrawals_report.html",
    )


@router.get("/stock/pdf")
async def export_stock_report_pdf(
    request: Request,
    search: str | None = Query(default=None),
    category_id: UUID | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    low_stock_only: bool = Query(default=False),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Alias compatible para exportar stock en PDF."""
    return await export_stock_report(
        request,
        "pdf",
        search,
        category_id,
        supplier_id,
        low_stock_only,
        include_inactive,
        db,
        business_id,
        current_user,
    )


@router.get("/sales/pdf")
async def export_sales_report_pdf(
    request: Request,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_receipts: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Alias compatible para exportar ventas en PDF."""
    return await export_sales_report(
        request,
        "pdf",
        date_from,
        date_to,
        include_receipts,
        db,
        business_id,
        current_user,
    )


@router.get("/products/pdf")
async def export_products_report_pdf(
    request: Request,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Alias compatible para exportar productos más vendidos en PDF."""
    return await export_top_products_report(
        request,
        "pdf",
        date_from,
        date_to,
        limit,
        db,
        business_id,
        current_user,
    )


@router.get("/accounts/pdf")
async def export_accounts_report_pdf(
    request: Request,
    only_with_balance: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Alias compatible para exportar cuentas corrientes en PDF."""
    return await export_client_accounts_report(
        request,
        "pdf",
        only_with_balance,
        db,
        business_id,
        current_user,
    )
