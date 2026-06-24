"""
Router de Rentabilidad.
Endpoints para cálculo de márgenes, rentabilidad por producto/cliente/categoría,
ingresos por acopios y CRUD de gastos.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.profitability import (
    AccountSummary,
    CategoryProfit,
    ClientProfit,
    ExpenseCategoryCreate,
    ExpenseCategoryOut,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    ProductProfit,
    ProfitabilitySummary,
    StockpileIncome,
)
from app.services.profitability_service import ProfitabilityService
from app.utils.security import get_current_business, get_current_user, require_module_access

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
