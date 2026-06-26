"""
Router de Rentabilidad.
Endpoints para cálculo de márgenes, rentabilidad por producto/cliente/categoría,
ingresos por acopios y CRUD de gastos.
"""

import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.profitability import (
    AccountSummary,
    AlertSummary,
    BrandProfit,
    CategoryProfit,
    ClientProfit,
    DocumentProfit,
    EvolutionPoint,
    ExpenseCategoryCreate,
    ExpenseCategoryOut,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    ProductProfit,
    ProfitabilityFilterParams,
    ProfitabilitySummary,
    SellerProfit,
    StockpileIncome,
)
from app.services.export_service import EXPORT_CONTENT_TYPES, ExportService
from app.services.profitability_service import ProfitabilityService
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
    require_profitability_permission,
)

router = APIRouter(
    prefix="/profitability",
    tags=["Rentabilidad"],
    dependencies=[Depends(require_module_access("profitability"))],
)


# ─── Resumen ────────────────────────────────────────────────────


@router.get("/summary", response_model=ProfitabilitySummary)
async def get_summary(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Resumen de rentabilidad del período con KPIs principales."""
    service = ProfitabilityService(db)
    return await service.get_summary(business_id, date_from, date_to)


# ─── Por producto ───────────────────────────────────────────────


@router.get("/products", response_model=PaginatedResponse[ProductProfit])
async def get_products(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    search: str | None = Query(None, description="Buscar por código o descripción"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Rentabilidad desglosada por producto con paginación."""
    service = ProfitabilityService(db)
    items, total = await service.get_products(
        business_id, date_from, date_to, search, page, per_page
    )
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Por cliente ────────────────────────────────────────────────


@router.get("/clients", response_model=PaginatedResponse[ClientProfit])
async def get_clients(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    search: str | None = Query(None, description="Buscar por nombre de cliente"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Rentabilidad desglosada por cliente con paginación."""
    service = ProfitabilityService(db)
    items, total = await service.get_clients(
        business_id, date_from, date_to, search, page, per_page
    )
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Por categoría ──────────────────────────────────────────────


@router.get("/categories", response_model=PaginatedResponse[CategoryProfit])
async def get_categories(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Rentabilidad desglosada por categoría de producto con paginación."""
    service = ProfitabilityService(db)
    items, total = await service.get_categories(
        business_id, date_from, date_to, page, per_page
    )
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Acopios ────────────────────────────────────────────────────


@router.get("/stockpiles", response_model=PaginatedResponse[StockpileIncome])
async def get_stockpiles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista de acopios con ingresos generados."""
    service = ProfitabilityService(db)
    items, total = await service.get_stockpiles(business_id, page, per_page)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── CRUD de Gastos ─────────────────────────────────────────────


@router.get("/expenses", response_model=PaginatedResponse[ExpenseOut])
async def get_expenses(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    category_id: UUID | None = Query(None, description="Filtrar por categoría"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista gastos con filtros y paginación."""
    service = ProfitabilityService(db)
    expenses, total = await service.get_expenses(
        business_id, date_from, date_to, category_id, page, per_page
    )
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[ExpenseOut.model_validate(e) for e in expenses],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """Crea un nuevo gasto."""
    service = ProfitabilityService(db)
    expense = await service.create_expense(business_id, current_user.id, data)
    return ExpenseOut.model_validate(expense)


@router.put("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un gasto existente."""
    service = ProfitabilityService(db)
    expense = await service.update_expense(expense_id, business_id, data)
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto no encontrado",
        )
    return ExpenseOut.model_validate(expense)


@router.delete("/expenses/{expense_id}", response_model=MessageResponse)
async def delete_expense(
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina un gasto (soft delete)."""
    service = ProfitabilityService(db)
    deleted = await service.delete_expense(expense_id, business_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto no encontrado",
        )
    return MessageResponse(message="Gasto eliminado correctamente")


# ─── Categorías de Gastos ───────────────────────────────────────


@router.get("/expenses/categories", response_model=list[ExpenseCategoryOut])
async def get_expense_categories(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista todas las categorías de gasto activas."""
    service = ProfitabilityService(db)
    categories = await service.get_expense_categories(business_id)
    return [ExpenseCategoryOut.model_validate(c) for c in categories]


@router.post(
    "/expenses/categories",
    response_model=ExpenseCategoryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_expense_category(
    data: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea una nueva categoría de gasto."""
    service = ProfitabilityService(db)
    category = await service.create_expense_category(business_id, data)
    return ExpenseCategoryOut.model_validate(category)


# ─── Evolución temporal ──────────────────────────────────────────


@router.get("/evolution", response_model=list[EvolutionPoint])
async def get_evolution(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    group_by: str = Query("month", description="Agrupar por: day, week, month"),
    client_id: UUID | None = Query(None, description="Filtrar por cliente"),
    seller_id: UUID | None = Query(None, description="Filtrar por vendedor"),
    brand_id: UUID | None = Query(None, description="Filtrar por marca"),
    category_id: UUID | None = Query(None, description="Filtrar por categoría"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.view_costs")),
):
    """Evolución de rentabilidad a lo largo del tiempo."""
    if group_by not in ("day", "week", "month"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="group_by debe ser 'day', 'week' o 'month'",
        )
    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
        group_by=group_by,
        client_id=client_id,
        seller_id=seller_id,
        brand_id=brand_id,
        category_id=category_id,
    )
    return await service.get_evolution(business_id, filters)


# ─── Por marca ───────────────────────────────────────────────────


@router.get("/brands", response_model=PaginatedResponse[BrandProfit])
async def get_brands(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    category_id: UUID | None = Query(None, description="Filtrar por categoría"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.view_costs")),
):
    """Rentabilidad desglosada por marca con paginación."""
    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
        page=page,
        per_page=per_page,
    )
    items, total = await service.get_brands(business_id, filters)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Por vendedor ────────────────────────────────────────────────


@router.get("/sellers", response_model=PaginatedResponse[SellerProfit])
async def get_sellers(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.view_by_seller")),
):
    """Rentabilidad desglosada por vendedor con paginación."""
    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )
    items, total = await service.get_sellers(business_id, filters)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Por comprobante ─────────────────────────────────────────────


@router.get("/documents", response_model=PaginatedResponse[DocumentProfit])
async def get_documents(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    client_id: UUID | None = Query(None, description="Filtrar por cliente"),
    seller_id: UUID | None = Query(None, description="Filtrar por vendedor"),
    document_type: str | None = Query(None, description="Filtrar por tipo (A, B, C)"),
    search: str | None = Query(None, description="Buscar por cliente, número o vendedor"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.view_documents")),
):
    """Rentabilidad desglosada por comprobante con paginación."""
    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
        client_id=client_id,
        seller_id=seller_id,
        document_type=document_type,
        search=search,
        page=page,
        per_page=per_page,
    )
    items, total = await service.get_documents(business_id, filters)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── Alertas de rentabilidad ─────────────────────────────────────


@router.get("/alerts", response_model=AlertSummary)
async def get_alerts(
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.view_alerts")),
):
    """Alertas de rentabilidad: márgenes negativos, productos sin costo, descuentos excesivos."""
    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
    )
    return await service.get_alerts(business_id, filters)


# ─── Exportación ──────────────────────────────────────────────────


@router.get("/export/{export_format}")
async def export_profitability(
    export_format: str,
    tab: str = Query(..., description="Sección a exportar: summary, products, brands, sellers, documents, alerts"),
    date_from: date | None = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Fecha fin (YYYY-MM-DD)"),
    search: str | None = Query(None, description="Buscar (productos/comprobantes)"),
    client_id: UUID | None = Query(None, description="Filtrar por cliente"),
    seller_id: UUID | None = Query(None, description="Filtrar por vendedor"),
    brand_id: UUID | None = Query(None, description="Filtrar por marca"),
    category_id: UUID | None = Query(None, description="Filtrar por categoría"),
    document_type: str | None = Query(None, description="Filtrar por tipo de comprobante"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    _: None = Depends(require_profitability_permission("profitability.export")),
):
    """
    Exporta datos de rentabilidad al formato solicitado.

    **format**: `excel`, `csv`, o `pdf` (solo excel y csv implementados).
    **tab**: `summary`, `products`, `brands`, `sellers`, `documents`, o `alerts`.
    """
    # Validar formato
    valid_formats = {"excel", "csv", "pdf"}
    if export_format not in valid_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato no soportado: '{export_format}'. Use: {', '.join(sorted(valid_formats))}",
        )

    # PDF no implementado
    if export_format == "pdf":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Exportación a PDF no implementada. Use excel o csv.",
        )

    # Validar tab
    valid_tabs = {"summary", "products", "brands", "sellers", "documents", "alerts"}
    if tab not in valid_tabs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sección no válida: '{tab}'. Use: {', '.join(sorted(valid_tabs))}",
        )

    service = ProfitabilityService(db)
    filters = ProfitabilityFilterParams(
        date_from=date_from,
        date_to=date_to,
        search=search,
        client_id=client_id,
        seller_id=seller_id,
        brand_id=brand_id,
        category_id=category_id,
        document_type=document_type,
        page=1,
        per_page=100000,  # Exporta todos los registros disponibles
    )

    # ── Obtener datos según el tab ──
    if tab == "summary":
        data = await _export_summary(service, business_id, filters)
    elif tab == "products":
        data = await _export_products(service, business_id, filters)
    elif tab == "brands":
        data = await _export_brands(service, business_id, filters)
    elif tab == "sellers":
        data = await _export_sellers(service, business_id, filters)
    elif tab == "documents":
        data = await _export_documents(service, business_id, filters)
    elif tab == "alerts":
        data = await _export_alerts(service, business_id, filters)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tab no válido")

    # ── Generar archivo ──
    filename_prefix = f"rentabilidad_{tab}"
    content_type = EXPORT_CONTENT_TYPES[export_format]
    filename = ExportService._prepare_filename(filename_prefix, export_format)

    if export_format == "excel":
        content = ExportService.to_excel(data, sheet_name=tab.capitalize())
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # CSV
    content = ExportService.to_csv(data)
    return StreamingResponse(
        io.StringIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Helpers de exportación ──────────────────────────────────────


async def _export_summary(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos del resumen para exportación."""
    summary = await service.get_summary(business_id, filters.date_from, filters.date_to)
    return [
        {
            "Ingreso total": summary.total_revenue,
            "Costo total": summary.total_cost,
            "Margen bruto": summary.gross_margin,
            "Margen %": summary.gross_margin_pct,
            "Markup %": summary.markup_pct,
            "Unidades vendidas": summary.units_sold,
            "Gastos totales": summary.total_expenses,
            "Utilidad neta": summary.net_profit,
            "Ticket promedio": summary.avg_ticket,
            "Ingreso acopios": summary.stockpile_income,
            "Facturas emitidas": summary.invoice_count,
        }
    ]


async def _export_products(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos de productos para exportación."""
    items, _ = await service.get_products(
        business_id, filters.date_from, filters.date_to,
        filters.search, filters.page, filters.per_page,
    )
    return [
        {
            "Código": p.code,
            "Descripción": p.description,
            "Categoría": p.category_name or "",
            "Cantidad": p.quantity_sold,
            "Ingreso": p.revenue,
            "Costo": p.cost,
            "Margen": p.margin,
            "Margen %": p.margin_pct,
        }
        for p in items
    ]


async def _export_brands(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos de marcas para exportación."""
    items, _ = await service.get_brands(business_id, filters)
    return [
        {
            "Marca": b.brand_name,
            "Ingreso": b.revenue,
            "Costo": b.cost,
            "Ganancia": b.profit,
            "Margen %": b.margin_pct,
            "Markup %": b.markup_pct,
            "Unidades": b.units_sold,
        }
        for b in items
    ]


async def _export_sellers(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos de vendedores para exportación."""
    items, _ = await service.get_sellers(business_id, filters)
    return [
        {
            "Vendedor": s.seller_name,
            "Ingreso": s.revenue,
            "Ganancia": s.profit,
            "Margen %": s.margin_pct,
            "Dto. total": s.discounts_total,
            "Facturas": s.invoice_count,
        }
        for s in items
    ]


async def _export_documents(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos de comprobantes para exportación."""
    items, _ = await service.get_documents(business_id, filters)
    return [
        {
            "Tipo": d.document_type,
            "Número": d.document_number,
            "Fecha": d.date.isoformat(),
            "Cliente": d.client_name,
            "Vendedor": d.seller_name,
            "Ingreso": d.revenue,
            "Costo": d.cost,
            "Ganancia": d.profit,
            "Margen %": d.margin_pct,
            "Estado": d.status,
        }
        for d in items
    ]


async def _export_alerts(
    service: ProfitabilityService,
    business_id: UUID,
    filters: ProfitabilityFilterParams,
) -> list[dict]:
    """Prepara datos de alertas para exportación."""
    alert_summary = await service.get_alerts(business_id, filters)
    return [
        {
            "Tipo": a.type,
            "Producto": a.product_name,
            "Cliente": a.client_name or "",
            "Ingreso": a.revenue,
            "Costo": a.cost or 0,
            "Margen %": a.margin_pct or 0,
            "Motivo": a.reason,
        }
        for a in alert_summary.alerts
    ]
