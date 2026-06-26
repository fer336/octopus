"""
Schemas de Rentabilidad y Reportes.
Define los modelos Pydantic para cálculos de márgenes,
rentabilidad por producto/cliente/categoría y CRUD de gastos.
"""

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from app.schemas.base import BaseResponse, BaseSchema


class ProfitabilityFilter(BaseSchema):
    """Filtros opcionales por rango de fechas."""

    date_from: date | None = None
    date_to: date | None = None


class ProfitabilityComparison(BaseSchema):
    """Comparación vs período anterior."""

    revenue_change_pct: float
    cost_change_pct: float
    profit_change_pct: float
    margin_change_pct: float


# ─── Resumen ────────────────────────────────────────────────────


class ProfitabilitySummary(BaseSchema):
    """Resumen de rentabilidad del período."""

    total_revenue: float
    total_cost: float
    gross_margin: float
    gross_margin_pct: float
    total_expenses: float
    net_profit: float
    avg_ticket: float
    stockpile_income: float
    invoice_count: int
    markup_pct: float
    units_sold: int
    comparison: ProfitabilityComparison | None = None


# ─── Desglose por producto ──────────────────────────────────────


class ProductProfit(BaseSchema):
    """Rentabilidad por producto/SKU."""

    product_id: UUID
    code: str
    description: str
    category_name: str | None
    quantity_sold: float
    revenue: float
    cost: float
    margin: float
    margin_pct: float
    markup_pct: float


class EvolutionPoint(BaseSchema):
    """Punto de evolución temporal (línea de tiempo)."""

    period: str
    revenue: float
    cost: float
    profit: float
    margin_pct: float


class BrandProfit(BaseSchema):
    """Rentabilidad agrupada por marca."""

    brand_id: UUID
    brand_name: str
    revenue: float
    cost: float
    profit: float
    margin_pct: float
    markup_pct: float
    units_sold: float


class SellerProfit(BaseSchema):
    """Rentabilidad agrupada por vendedor."""

    user_id: UUID
    seller_name: str
    revenue: float
    profit: float
    margin_pct: float
    discounts_total: float
    invoice_count: int


class DocumentProfit(BaseSchema):
    """Rentabilidad por comprobante."""

    voucher_id: UUID
    document_type: str
    document_number: str
    date: date
    client_name: str
    seller_name: str
    revenue: float
    cost: float
    profit: float
    margin_pct: float
    status: str


class ProfitabilityAlert(BaseSchema):
    """Alerta individual de rentabilidad."""

    type: str
    voucher_id: UUID | None = None
    product_name: str
    client_name: str | None = None
    revenue: float
    cost: float | None = None
    margin_pct: float | None = None
    reason: str


class AlertSummary(BaseSchema):
    """Resumen de alertas de rentabilidad."""

    negative_margin_count: int
    low_margin_count: int
    no_cost_count: int
    excessive_discount_count: int
    alerts: list[ProfitabilityAlert]


class ProfitabilityFilterParams(BaseSchema):
    """Filtros parametrizables para reportes de rentabilidad."""

    date_from: date | None = None
    date_to: date | None = None
    branch_id: UUID | None = None
    seller_id: UUID | None = None
    client_id: UUID | None = None
    category_id: UUID | None = None
    brand_id: UUID | None = None
    supplier_id: UUID | None = None
    price_list_id: UUID | None = None
    document_type: str | None = None
    status: str | None = None
    search: str | None = None
    page: int = 1
    per_page: int = 20
    group_by: str | None = "month"


# ─── Desglose por cliente ───────────────────────────────────────


class ClientProfit(BaseSchema):
    """Rentabilidad por cliente."""

    client_id: UUID
    name: str
    total_billed: float
    total_cost: float
    margin: float
    margin_pct: float
    invoice_count: int


# ─── Desglose por categoría ─────────────────────────────────────


class CategoryProfit(BaseSchema):
    """Rentabilidad por categoría de producto."""

    category_id: UUID
    name: str
    revenue: float
    cost: float
    margin: float
    margin_pct: float
    item_count: int


# ─── Ingresos por acopios ──────────────────────────────────────


class StockpileIncome(BaseSchema):
    """Ingreso generado por un acopio."""

    stockpile_id: UUID
    client_name: str
    total_paid: float
    total_withdrawn: float
    remaining: float
    status: str


# ─── Resumen de cuenta corriente por cliente ───────────────────


class AccountSummary(BaseSchema):
    """Resumen de cuenta corriente de un cliente."""

    client_id: UUID
    client_name: str
    total_debt: float
    overdue: float
    paid_this_month: float
    balance: float
    aging_days: int


# ─── CRUD de Gastos ─────────────────────────────────────────────


class ExpenseCategoryCreate(BaseSchema):
    """Creación de categoría de gasto."""

    name: str
    description: str | None = None


class ExpenseCategoryOut(BaseResponse):
    """Categoría de gasto (respuesta)."""

    name: str
    description: str | None
    is_active: bool


class ExpenseCreate(BaseSchema):
    """Creación de un gasto."""

    business_id: UUID
    category_id: UUID
    description: str
    amount: Decimal
    date: date
    payment_method: str
    notes: str | None = None


class ExpenseUpdate(BaseSchema):
    """Actualización de un gasto (todos los campos opcionales)."""

    category_id: UUID | None = None
    description: str | None = None
    amount: Decimal | None = None
    date: Optional[date] = None
    payment_method: str | None = None
    notes: str | None = None


class ExpenseOut(BaseResponse):
    """Gasto (respuesta)."""

    business_id: UUID
    category_id: UUID
    description: str
    amount: Decimal
    date: date
    payment_method: str
    notes: str | None
    created_by: UUID
