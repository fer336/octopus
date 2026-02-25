"""
Router de Dashboard.
Endpoints para estadísticas y resumen del negocio.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.client import Client
from app.models.product import Product
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.schemas.base import BaseSchema
from app.utils.security import get_current_business

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# Tipos de comprobante que representan ventas reales (facturas emitidas)
INVOICE_TYPES = {VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C}


class DashboardSummary(BaseSchema):
    """Resumen del dashboard."""
    total_products: int
    total_clients: int
    low_stock_products: int
    total_value: float          # Valor total del inventario (costo)
    total_sales: float          # Suma de facturas emitidas en el período
    total_invoices: int         # Cantidad de facturas en el período
    filter_month: int           # Mes filtrado (1-12)
    filter_year: int            # Año filtrado


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    month: Optional[int] = Query(default=None, ge=1, le=12, description="Mes (1-12). Por defecto: mes actual"),
    year: Optional[int] = Query(default=None, ge=2000, le=2100, description="Año. Por defecto: año actual"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un resumen estadístico para el dashboard con filtro por mes/año."""
    from datetime import date
    today = date.today()
    filter_month = month or today.month
    filter_year = year or today.year

    # Total de productos
    products_query = select(func.count(Product.id)).where(
        Product.business_id == business_id,
        Product.deleted_at.is_(None)
    )
    total_products = (await db.execute(products_query)).scalar() or 0

    # Total de clientes
    clients_query = select(func.count(Client.id)).where(
        Client.business_id == business_id,
        Client.deleted_at.is_(None)
    )
    total_clients = (await db.execute(clients_query)).scalar() or 0

    # Productos con stock bajo
    low_stock_query = select(func.count(Product.id)).where(
        Product.business_id == business_id,
        Product.deleted_at.is_(None),
        Product.current_stock <= Product.minimum_stock
    )
    low_stock_products = (await db.execute(low_stock_query)).scalar() or 0

    # Valor total del inventario (precio de costo * stock)
    value_query = select(func.sum(Product.cost_price * Product.current_stock)).where(
        Product.business_id == business_id,
        Product.deleted_at.is_(None)
    )
    total_value = (await db.execute(value_query)).scalar() or 0.0

    # Suma de ventas: solo facturas (A, B, C) confirmadas en el mes/año indicado
    sales_query = select(func.sum(Voucher.total)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        extract('month', Voucher.date) == filter_month,
        extract('year', Voucher.date) == filter_year,
    )
    total_sales = (await db.execute(sales_query)).scalar() or 0.0

    # Cantidad de facturas en el período
    invoices_count_query = select(func.count(Voucher.id)).where(
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(INVOICE_TYPES),
        extract('month', Voucher.date) == filter_month,
        extract('year', Voucher.date) == filter_year,
    )
    total_invoices = (await db.execute(invoices_count_query)).scalar() or 0

    return DashboardSummary(
        total_products=total_products,
        total_clients=total_clients,
        low_stock_products=low_stock_products,
        total_value=float(total_value),
        total_sales=float(total_sales),
        total_invoices=int(total_invoices),
        filter_month=filter_month,
        filter_year=filter_year,
    )
