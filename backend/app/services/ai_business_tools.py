"""Business analytics helpers for the Luci agent."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem

logger = logging.getLogger(__name__)

_SALES_TYPES = [
    VoucherType.RECEIPT,
    VoucherType.INVOICE_A,
    VoucherType.INVOICE_B,
    VoucherType.INVOICE_C,
]


async def get_low_stock_products(db: AsyncSession, business_id: str) -> list[dict]:
    """Returns products where current_stock <= minimum_stock, ordered by deficit."""
    # Use ProductLot to get current_stock (same pattern as StockReportService._get_products)
    stock_subq = (
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
    current_stock_expr = func.coalesce(stock_subq.c.stock, 0)

    query = (
        select(
            Product.code,
            Product.description,
            Product.unit,
            Product.minimum_stock,
            current_stock_expr.label("current_stock"),
        )
        .outerjoin(stock_subq, stock_subq.c.product_id == Product.id)
        .where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
            Product.is_active.is_(True),
            current_stock_expr <= Product.minimum_stock,
        )
        .order_by(
            (Product.minimum_stock - current_stock_expr).desc()
        )
        .limit(20)
    )

    result = await db.execute(query)
    rows = []
    for row in result:
        rows.append({
            "code": row.code,
            "description": row.description,
            "unit": row.unit or "un.",
            "current_stock": int(row.current_stock),
            "minimum_stock": int(row.minimum_stock or 0),
        })
    return rows


async def get_stagnant_products(
    db: AsyncSession, business_id: str, days: int = 90
) -> list[dict]:
    """Returns active products with stock > 0 that haven't sold in `days` days."""
    # Get all active products with stock > 0
    stock_subq = (
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
    current_stock_expr = func.coalesce(stock_subq.c.stock, 0)

    prod_q = (
        select(Product.id, Product.code, Product.description, Product.unit, current_stock_expr.label("current_stock"))
        .outerjoin(stock_subq, stock_subq.c.product_id == Product.id)
        .where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
            Product.is_active.is_(True),
            current_stock_expr > 0,
        )
    )
    prod_result = await db.execute(prod_q)
    products = {row.id: row for row in prod_result}
    if not products:
        return []

    # Get last sale date per product
    last_sale_q = (
        select(
            VoucherItem.product_id,
            func.max(Voucher.created_at).label("last_sale"),
        )
        .join(Voucher, Voucher.id == VoucherItem.voucher_id)
        .where(
            VoucherItem.product_id.in_(list(products.keys())),
            Voucher.business_id == business_id,
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.deleted_at.is_(None),
        )
        .group_by(VoucherItem.product_id)
    )
    sale_result = await db.execute(last_sale_q)
    last_sales: dict = {row.product_id: row.last_sale.date() for row in sale_result}

    cutoff = date.today() - timedelta(days=days)
    rows = []
    for pid, prod in products.items():
        last_sale = last_sales.get(pid)
        if last_sale is None or last_sale < cutoff:
            days_without = (date.today() - last_sale).days if last_sale else None
            rows.append({
                "code": prod.code,
                "description": prod.description,
                "unit": prod.unit or "un.",
                "current_stock": int(prod.current_stock),
                "last_sale_date": last_sale.strftime("%d/%m/%Y") if last_sale else "Nunca",
                "days_without_sale": days_without,
            })

    rows.sort(key=lambda r: r["days_without_sale"] or 99999, reverse=True)
    return rows[:20]


async def get_sales_summary(
    db: AsyncSession, business_id: str, period: str = "month"
) -> dict:
    """Returns top 5 products by revenue and qty for the given period."""
    today = date.today()
    if period == "year":
        date_from = date(today.year, 1, 1)
        period_label = f"Año {today.year}"
    elif period == "quarter":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        date_from = date(today.year, q_start_month, 1)
        period_label = f"Q{(today.month - 1) // 3 + 1} {today.year}"
    else:  # month
        date_from = date(today.year, today.month, 1)
        period_label = today.strftime("%B %Y")

    conditions = [
        Voucher.business_id == business_id,
        Voucher.deleted_at.is_(None),
        Voucher.status == VoucherStatus.CONFIRMED,
        Voucher.voucher_type.in_(_SALES_TYPES),
        Voucher.date >= date_from,
        Voucher.date <= today,
    ]

    query = (
        select(
            VoucherItem.description,
            func.coalesce(func.sum(VoucherItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(VoucherItem.total), 0).label("amount"),
        )
        .join(Voucher, Voucher.id == VoucherItem.voucher_id)
        .where(and_(*conditions))
        .group_by(VoucherItem.description)
        .order_by(func.sum(VoucherItem.total).desc())
        .limit(10)
    )
    result = await db.execute(query)

    top_by_revenue = []
    top_by_qty_map = []
    total_amount = Decimal("0")

    for row in result:
        amount = Decimal(str(row.amount or 0))
        qty = Decimal(str(row.qty or 0))
        total_amount += amount
        entry = {
            "description": row.description,
            "quantity": float(qty),
            "amount": float(amount),
        }
        top_by_revenue.append(entry)
        top_by_qty_map.append(entry)

    top_by_qty = sorted(top_by_qty_map, key=lambda x: x["quantity"], reverse=True)

    return {
        "period": period_label,
        "date_from": date_from.strftime("%d/%m/%Y"),
        "date_to": today.strftime("%d/%m/%Y"),
        "total_amount": float(total_amount),
        "top_by_revenue": top_by_revenue[:5],
        "top_by_qty": top_by_qty[:5],
    }
