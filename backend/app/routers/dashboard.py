"""
Router de Dashboard.
Endpoints para estadísticas y resumen del negocio.
"""

from calendar import monthrange
from datetime import date, datetime, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cash_register import CashMovement, CashMovementType
from app.models.client import Client
from app.models.client_account import ClientAccount
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.schemas.base import BaseSchema
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(require_module_access("dashboard"))],
)

# Tipos de comprobante que representan ventas reales (facturas emitidas)
INVOICE_TYPES = {VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C}


class DashboardSummary(BaseSchema):
    """Resumen del dashboard."""

    total_products: int
    total_clients: int
    low_stock_products: int
    total_value: float  # Valor total del inventario (costo)
    total_sales: float  # Suma de facturas emitidas en el período
    total_invoices: int  # Cantidad de facturas en el período
    today_sales: float  # Ventas cobradas hoy desde comprobantes confirmados
    today_invoiced: float  # Facturado hoy en comprobantes confirmados
    today_vouchers_count: int  # Cantidad de comprobantes confirmados del día
    cash_income: float  # Plata real ingresada en caja en el período
    paid_invoices: float  # Cobros de facturas/ventas de contado en caja
    paid_stockpiles: float  # Cobros de acopios en caja
    current_account_collected: float  # Cobros de cuenta corriente en caja
    pending_customer_balance: float  # Saldo pendiente total de clientes
    other_income: float  # Ingresos manuales en caja
    closed_current_accounts: int  # Cantidad de cierres de cuenta corriente
    closed_current_accounts_total: float  # Monto total de cierres de cuenta corriente
    filter_month: int  # Mes filtrado (1-12)
    filter_year: int  # Año filtrado
    filter_date_from: date  # Inicio efectivo del período filtrado
    filter_date_to: date  # Fin efectivo del período filtrado


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    month: int | None = Query(
        default=None, ge=1, le=12, description="Mes (1-12). Por defecto: mes actual"
    ),
    year: int | None = Query(
        default=None, ge=2000, le=2100, description="Año. Por defecto: año actual"
    ),
    date_from: Annotated[
        date | None,
        Query(description="Fecha desde opcional"),
    ] = None,
    date_to: Annotated[
        date | None,
        Query(description="Fecha hasta opcional"),
    ] = None,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un resumen estadístico para el dashboard con filtro por mes/año o rango."""
    today = date.today()
    filter_month = month or today.month
    filter_year = year or today.year
    first_day = date(filter_year, filter_month, 1)
    last_day = date(filter_year, filter_month, monthrange(filter_year, filter_month)[1])
    period_date_from = date_from or first_day
    period_date_to = date_to or last_day
    if period_date_from > period_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha desde no puede ser posterior a la fecha hasta.",
        )
    period_start = datetime.combine(period_date_from, time.min)
    period_end = datetime.combine(period_date_to, time.max)
    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)

    # Total de productos
    products_query = select(func.count(Product.id)).where(
        Product.business_id == business_id, Product.deleted_at.is_(None)
    )
    total_products = (await db.execute(products_query)).scalar() or 0

    # Total de clientes
    clients_query = select(func.count(Client.id)).where(
        Client.business_id == business_id, Client.deleted_at.is_(None)
    )
    total_clients = (await db.execute(clients_query)).scalar() or 0

    stock_by_product = (
        select(
            ProductLot.product_id.label("product_id"),
            func.coalesce(func.sum(ProductLot.quantity), 0).label("stock"),
        )
        .where(
            ProductLot.business_id == business_id,
            ProductLot.deleted_at.is_(None),
        )
        .group_by(ProductLot.product_id)
        .subquery()
    )

    # Productos con stock bajo
    low_stock_query = select(func.count(Product.id)).where(
        Product.business_id == business_id,
        Product.deleted_at.is_(None),
        func.coalesce(stock_by_product.c.stock, 0) <= Product.minimum_stock,
    ).outerjoin(
        stock_by_product,
        stock_by_product.c.product_id == Product.id,
    )
    low_stock_products = (await db.execute(low_stock_query)).scalar() or 0

    # Valor total del inventario (precio de costo * stock)
    value_query = (
        select(func.sum(Product.cost_price * func.coalesce(stock_by_product.c.stock, 0)))
        .where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        )
        .outerjoin(
            stock_by_product,
            stock_by_product.c.product_id == Product.id,
        )
    )
    total_value = (await db.execute(value_query)).scalar() or 0.0

    # Suma de ventas: solo facturas (A, B, C) confirmadas en el período indicado
    sales_query = select(func.sum(Voucher.total)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        Voucher.date >= period_date_from,
        Voucher.date <= period_date_to,
    )
    total_sales = (await db.execute(sales_query)).scalar() or 0.0

    # Cantidad de facturas en el período
    invoices_count_query = select(func.count(Voucher.id)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        Voucher.date >= period_date_from,
        Voucher.date <= period_date_to,
    )
    total_invoices = (await db.execute(invoices_count_query)).scalar() or 0

    today_invoiced_query = select(func.sum(Voucher.total)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        Voucher.date == today,
    )
    today_invoiced = (await db.execute(today_invoiced_query)).scalar() or 0.0

    today_vouchers_count_query = select(func.count(Voucher.id)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        Voucher.date == today,
    )
    today_vouchers_count = (await db.execute(today_vouchers_count_query)).scalar() or 0

    income_types = [
        CashMovementType.SALE,
        CashMovementType.PAYMENT_RECEIVED,
        CashMovementType.INCOME,
    ]

    cash_income_query = select(func.sum(CashMovement.amount)).where(
        CashMovement.deleted_at.is_(None),
        CashMovement.type.in_(income_types),
        CashMovement.created_at >= period_start,
        CashMovement.created_at <= period_end,
    ).join(
        CashMovement.cash_register,
    ).where(
        CashMovement.cash_register.has(business_id=business_id),
    )
    cash_income = (await db.execute(cash_income_query)).scalar() or 0.0

    paid_invoices_query = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .outerjoin(Voucher, CashMovement.voucher_id == Voucher.id)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type == CashMovementType.SALE,
            CashMovement.created_at >= period_start,
            CashMovement.created_at <= period_end,
            CashMovement.cash_register.has(business_id=business_id),
            Voucher.business_id == business_id,
            Voucher.voucher_type.in_(INVOICE_TYPES),
            Voucher.stockpile_id.is_(None),
        )
    )
    paid_invoices = (await db.execute(paid_invoices_query)).scalar() or 0.0

    today_sales_query = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .outerjoin(Voucher, CashMovement.voucher_id == Voucher.id)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type == CashMovementType.SALE,
            CashMovement.created_at >= today_start,
            CashMovement.created_at <= today_end,
            CashMovement.cash_register.has(business_id=business_id),
            Voucher.business_id == business_id,
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.voucher_type.in_(INVOICE_TYPES),
            Voucher.stockpile_id.is_(None),
        )
    )
    today_sales = (await db.execute(today_sales_query)).scalar() or 0.0

    paid_stockpiles_query = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .join(Voucher, CashMovement.voucher_id == Voucher.id)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type == CashMovementType.SALE,
            CashMovement.created_at >= period_start,
            CashMovement.created_at <= period_end,
            CashMovement.cash_register.has(business_id=business_id),
            Voucher.stockpile_id.is_not(None),
        )
    )
    paid_stockpiles = (await db.execute(paid_stockpiles_query)).scalar() or 0.0

    current_account_query = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type == CashMovementType.PAYMENT_RECEIVED,
            CashMovement.created_at >= period_start,
            CashMovement.created_at <= period_end,
            CashMovement.cash_register.has(business_id=business_id),
        )
    )
    current_account_collected = (await db.execute(current_account_query)).scalar() or 0.0

    other_income_query = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type == CashMovementType.INCOME,
            CashMovement.created_at >= period_start,
            CashMovement.created_at <= period_end,
            CashMovement.cash_register.has(business_id=business_id),
        )
    )
    other_income = (await db.execute(other_income_query)).scalar() or 0.0

    # Cierres de cuenta corriente: vouchers marcados como is_current_account_closure
    closure_count_query = select(func.count(Voucher.id)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.is_current_account_closure == True,  # noqa: E712
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.date >= period_date_from,
        Voucher.date <= period_date_to,
    )
    closed_current_accounts = (await db.execute(closure_count_query)).scalar() or 0

    closure_total_query = select(func.sum(Voucher.total)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.is_current_account_closure == True,  # noqa: E712
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.date >= period_date_from,
        Voucher.date <= period_date_to,
    )
    closed_current_accounts_total = (await db.execute(closure_total_query)).scalar() or 0.0

    pending_balance_query = select(
        func.sum(ClientAccount.debit - ClientAccount.credit)
    ).join(
        Client,
        ClientAccount.client_id == Client.id,
    ).where(
        Client.business_id == business_id,
        Client.deleted_at.is_(None),
        ClientAccount.deleted_at.is_(None),
    )
    pending_customer_balance = (await db.execute(pending_balance_query)).scalar() or 0.0

    return DashboardSummary(
        total_products=total_products,
        total_clients=total_clients,
        low_stock_products=low_stock_products,
        total_value=float(total_value),
        total_sales=float(total_sales),
        total_invoices=int(total_invoices),
        today_sales=float(today_sales),
        today_invoiced=float(today_invoiced),
        today_vouchers_count=int(today_vouchers_count),
        cash_income=float(cash_income),
        paid_invoices=float(paid_invoices),
        paid_stockpiles=float(paid_stockpiles),
        current_account_collected=float(current_account_collected),
        pending_customer_balance=max(float(pending_customer_balance), 0.0),
        other_income=float(other_income),
        closed_current_accounts=int(closed_current_accounts),
        closed_current_accounts_total=float(closed_current_accounts_total),
        filter_month=filter_month,
        filter_year=filter_year,
        filter_date_from=period_date_from,
        filter_date_to=period_date_to,
    )


class MonthlyTrend(BaseSchema):
    """Un mes en la tendencia del dashboard."""

    month: int
    year: int
    label: str  # "Ene 2026", "Feb 2026", etc.
    cash_income: float
    total_sales: float
    pending_customer_balance: float


MONTH_LABELS = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

income_types = [
    CashMovementType.SALE,
    CashMovementType.PAYMENT_RECEIVED,
    CashMovementType.INCOME,
]


async def _monthly_cash_income(
    db: AsyncSession, business_id: UUID, year: int, month: int
) -> float:
    """Suma de ingresos reales de caja para un mes específico."""
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    period_start = datetime.combine(first_day, time.min)
    period_end = datetime.combine(last_day, time.max)

    q = (
        select(func.sum(CashMovement.amount))
        .join(CashMovement.cash_register)
        .where(
            CashMovement.deleted_at.is_(None),
            CashMovement.type.in_(income_types),
            CashMovement.created_at >= period_start,
            CashMovement.created_at <= period_end,
            CashMovement.cash_register.has(business_id=business_id),
        )
    )
    return float((await db.execute(q)).scalar() or 0.0)


async def _monthly_total_sales(
    db: AsyncSession, business_id: UUID, year: int, month: int
) -> float:
    """Suma de facturas emitidas para un mes específico."""
    q = select(func.sum(Voucher.total)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        extract("month", Voucher.date) == month,
        extract("year", Voucher.date) == year,
    )
    return float((await db.execute(q)).scalar() or 0.0)


async def _monthly_pending_balance(
    db: AsyncSession, business_id: UUID
) -> float:
    """Saldo pendiente total de clientes (no varía por mes)."""
    q = (
        select(func.sum(ClientAccount.debit - ClientAccount.credit))
        .join(Client, ClientAccount.client_id == Client.id)
        .where(
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
            ClientAccount.deleted_at.is_(None),
        )
    )
    return max(float((await db.execute(q)).scalar() or 0.0), 0.0)


@router.get("/trend", response_model=list[MonthlyTrend])
async def get_dashboard_trend(
    months: int = Query(default=6, ge=1, le=24, description="Cantidad de meses hacia atrás"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Tendencia mensual de ingresos vs facturado para los últimos N meses."""
    today = date.today()
    pending = await _monthly_pending_balance(db, business_id)
    result: list[MonthlyTrend] = []

    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m < 1:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1

        cash = await _monthly_cash_income(db, business_id, y, m)
        sales = await _monthly_total_sales(db, business_id, y, m)

        result.append(MonthlyTrend(
            month=m,
            year=y,
            label=f"{MONTH_LABELS[m-1]} {y}",
            cash_income=cash,
            total_sales=sales,
            pending_customer_balance=pending,
        ))

    return result
