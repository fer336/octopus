"""
Servicio de Rentabilidad y Reportes.
Calcula márgenes, COGS, ganancia neta y otros KPIs
sobre datos reales de ventas, gastos y acopios.
"""

import logging
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, null, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.brand import Brand
from app.models.client import Client
from app.models.client_account import ClientAccount, MovementType
from app.models.category import Category
from app.models.expense import Expense, ExpenseCategory
from app.models.product import Product
from app.models.stockpile import Stockpile, StockpileStatus
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus
from app.models.voucher_item import VoucherItem
from app.schemas.base import MessageResponse
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
    ProfitabilityAlert,
    ProfitabilityComparison,
    ProfitabilityFilterParams,
    ProfitabilitySummary,
    SellerProfit,
    StockpileIncome,
)

logger = logging.getLogger(__name__)


class ProfitabilityService:
    """Servicio de cálculos de rentabilidad y métricas financieras."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Helpers ─────────────────────────────────────────────────

    async def _get_confirmed_voucher_ids(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[UUID]:
        """Retorna los IDs de comprobantes confirmados en el rango."""
        query = select(Voucher.id).where(
            Voucher.business_id == business_id,
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.deleted_at.is_(None),
        )
        if date_from:
            query = query.where(Voucher.date >= date_from)
        if date_to:
            query = query.where(Voucher.date <= date_to)

        result = await self.db.execute(query)
        return [row[0] for row in result.all()]

    # ── Resumen ─────────────────────────────────────────────────

    async def get_summary(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> ProfitabilitySummary:
        """Calcula el resumen de rentabilidad del período."""
        voucher_ids = await self._get_confirmed_voucher_ids(
            business_id, date_from, date_to
        )

        if not voucher_ids:
            return ProfitabilitySummary(
                total_revenue=0.0,
                total_cost=0.0,
                gross_margin=0.0,
                gross_margin_pct=0.0,
                markup_pct=0.0,
                units_sold=0,
                total_expenses=0.0,
                net_profit=0.0,
                avg_ticket=0.0,
                stockpile_income=0.0,
                invoice_count=0,
                comparison=None,
            )

        # ── Ventas (ingresos, costos y unidades) ──
        item_agg = await self.db.execute(
            select(
                func.coalesce(func.sum(VoucherItem.total), 0),
                func.coalesce(
                    func.sum(
                        func.coalesce(VoucherItem.cost_price, Product.cost_price, 0)
                        * VoucherItem.quantity
                    ),
                    0,
                ),
                func.count(func.distinct(VoucherItem.voucher_id)),
                func.coalesce(func.sum(VoucherItem.quantity), 0),
            )
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .where(
                VoucherItem.voucher_id.in_(voucher_ids),
                VoucherItem.deleted_at.is_(None),
            )
        )
        total_revenue, total_cost, invoice_count, units_sold = item_agg.one()
        total_revenue = float(total_revenue)
        total_cost = float(total_cost)
        invoice_count = int(invoice_count)
        units_sold = int(units_sold)

        gross_margin = total_revenue - total_cost
        gross_margin_pct = (
            (gross_margin / total_revenue * 100) if total_revenue > 0 else 0.0
        )
        markup_pct = (
            round((gross_margin / total_cost * 100), 2) if total_cost else 0.0
        )

        # ── Comparación vs período anterior ──
        comparison = None
        if date_from and date_to:
            period_days = (date_to - date_from).days
            if period_days > 0:
                prev_date_from = date_from - timedelta(days=period_days)
                prev_date_to = date_from - timedelta(days=1)
                prev_voucher_ids = await self._get_confirmed_voucher_ids(
                    business_id, prev_date_from, prev_date_to
                )
                if prev_voucher_ids:
                    prev_agg = await self.db.execute(
                        select(
                            func.coalesce(func.sum(VoucherItem.total), 0),
                            func.coalesce(
                                func.sum(
                                    func.coalesce(VoucherItem.cost_price, Product.cost_price, 0)
                                    * VoucherItem.quantity
                                ),
                                0,
                            ),
                        )
                        .outerjoin(Product, VoucherItem.product_id == Product.id)
                        .where(
                            VoucherItem.voucher_id.in_(prev_voucher_ids),
                            VoucherItem.deleted_at.is_(None),
                        )
                    )
                    prev_revenue, prev_cost = prev_agg.one()
                    prev_revenue = float(prev_revenue)
                    prev_cost = float(prev_cost)
                    prev_profit = prev_revenue - prev_cost
                    prev_margin = (
                        (prev_profit / prev_revenue * 100)
                        if prev_revenue > 0
                        else 0.0
                    )

                    current_profit = gross_margin
                    current_margin = gross_margin_pct

                    comparison = ProfitabilityComparison(
                        revenue_change_pct=round(
                            ((total_revenue - prev_revenue) / prev_revenue * 100), 2
                        ) if prev_revenue else 0.0,
                        cost_change_pct=round(
                            ((total_cost - prev_cost) / prev_cost * 100), 2
                        ) if prev_cost else 0.0,
                        profit_change_pct=round(
                            ((current_profit - prev_profit) / prev_profit * 100), 2
                        ) if prev_profit else 0.0,
                        margin_change_pct=round(
                            (current_margin - prev_margin), 2
                        ),
                    )

        # ── Gastos del período ──
        expense_query = select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.business_id == business_id,
        )
        if date_from:
            expense_query = expense_query.where(Expense.date >= date_from)
        if date_to:
            expense_query = expense_query.where(Expense.date <= date_to)

        expense_result = await self.db.execute(expense_query)
        total_expenses = float(expense_result.scalar() or 0)

        net_profit = gross_margin - total_expenses
        avg_ticket = total_revenue / invoice_count if invoice_count > 0 else 0.0

        # ── Ingresos por acopios ──
        stockpile_query = select(
            func.coalesce(func.sum(Stockpile.initial_amount), 0)
        ).where(
            Stockpile.business_id == business_id,
            Stockpile.deleted_at.is_(None),
            Stockpile.status.in_([
                StockpileStatus.OPEN,
                StockpileStatus.PARTIAL,
                StockpileStatus.COMPLETED,
            ]),
        )
        if date_from:
            stockpile_query = stockpile_query.where(
                Stockpile.created_at >= datetime.combine(date_from, datetime.min.time())
            )
        if date_to:
            stockpile_query = stockpile_query.where(
                Stockpile.created_at <= datetime.combine(date_to, datetime.max.time())
            )

        stockpile_result = await self.db.execute(stockpile_query)
        stockpile_income = float(stockpile_result.scalar() or 0)

        return ProfitabilitySummary(
            total_revenue=round(total_revenue, 2),
            total_cost=round(total_cost, 2),
            gross_margin=round(gross_margin, 2),
            gross_margin_pct=round(gross_margin_pct, 2),
            markup_pct=round(markup_pct, 2),
            units_sold=units_sold,
            total_expenses=round(total_expenses, 2),
            net_profit=round(net_profit, 2),
            avg_ticket=round(avg_ticket, 2),
            stockpile_income=round(stockpile_income, 2),
            invoice_count=invoice_count,
            comparison=comparison,
        )

    # ── Por producto ────────────────────────────────────────────

    async def get_products(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[ProductProfit], int]:
        """Rentabilidad desglosada por producto."""
        voucher_ids = await self._get_confirmed_voucher_ids(
            business_id, date_from, date_to
        )

        if not voucher_ids:
            return [], 0

        # Query base: items agrupados por producto
        cols = [
            VoucherItem.product_id,
            VoucherItem.code,
            VoucherItem.description,
            func.coalesce(Category.name, None).label("category_name"),
            func.sum(VoucherItem.quantity).label("quantity_sold"),
            func.sum(VoucherItem.total).label("revenue"),
            func.coalesce(
                func.sum(
                    func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                ),
                0,
            ).label("cost"),
        ]

        base_query = (
            select(*cols)
            .where(
                VoucherItem.voucher_id.in_(voucher_ids),
                VoucherItem.deleted_at.is_(None),
                VoucherItem.product_id.isnot(None),
            )
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .outerjoin(Category, Product.category_id == Category.id)
            .group_by(
                VoucherItem.product_id,
                VoucherItem.code,
                VoucherItem.description,
                Category.name,
            )
        )

        if search:
            pattern = f"%{search}%"
            base_query = base_query.where(
                or_(
                    VoucherItem.code.ilike(pattern),
                    VoucherItem.description.ilike(pattern),
                )
            )

        # Contar total de grupos
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Paginar
        query = base_query.order_by(
            func.sum(VoucherItem.total).desc()
        ).offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            revenue = float(row.revenue)
            cost_val = float(row.cost)
            margin = revenue - cost_val
            margin_pct = (margin / revenue * 100) if revenue > 0 else 0.0
            markup_pct = (margin / cost_val * 100) if cost_val > 0 else 0.0
            items.append(
                ProductProfit(
                    product_id=row.product_id,
                    code=row.code,
                    description=row.description,
                    category_name=row.category_name,
                    quantity_sold=float(row.quantity_sold),
                    revenue=round(revenue, 2),
                    cost=round(cost_val, 2),
                    margin=round(margin, 2),
                    margin_pct=round(margin_pct, 2),
                    markup_pct=round(markup_pct, 2),
                )
            )

        return items, total

    # ── Por cliente ─────────────────────────────────────────────

    async def get_clients(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[ClientProfit], int]:
        """Rentabilidad desglosada por cliente."""
        voucher_ids = await self._get_confirmed_voucher_ids(
            business_id, date_from, date_to
        )

        if not voucher_ids:
            return [], 0

        cols = [
            Voucher.client_id,
            func.coalesce(Client.name, "Sin nombre").label("name"),
            func.sum(VoucherItem.total).label("total_billed"),
            func.coalesce(
                func.sum(
                    func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                ),
                0,
            ).label("total_cost"),
            func.count(func.distinct(Voucher.id)).label("invoice_count"),
        ]

        base_query = (
            select(*cols)
            .join(Voucher, VoucherItem.voucher_id == Voucher.id)
            .outerjoin(Client, Voucher.client_id == Client.id)
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .where(
                VoucherItem.voucher_id.in_(voucher_ids),
                VoucherItem.deleted_at.is_(None),
                Voucher.deleted_at.is_(None),
            )
            .group_by(Voucher.client_id, Client.name)
        )

        if search:
            pattern = f"%{search}%"
            base_query = base_query.where(Client.name.ilike(pattern))

        # Contar
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Paginar
        query = base_query.order_by(
            func.sum(VoucherItem.total).desc()
        ).offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            billed = float(row.total_billed)
            cost_val = float(row.total_cost)
            margin = billed - cost_val
            margin_pct = (margin / billed * 100) if billed > 0 else 0.0
            items.append(
                ClientProfit(
                    client_id=row.client_id,
                    name=row.name,
                    total_billed=round(billed, 2),
                    total_cost=round(cost_val, 2),
                    margin=round(margin, 2),
                    margin_pct=round(margin_pct, 2),
                    invoice_count=int(row.invoice_count),
                )
            )

        return items, total

    # ── Por categoría ───────────────────────────────────────────

    async def get_categories(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[CategoryProfit], int]:
        """Rentabilidad desglosada por categoría de producto."""
        voucher_ids = await self._get_confirmed_voucher_ids(
            business_id, date_from, date_to
        )

        if not voucher_ids:
            return [], 0

        cols = [
            func.coalesce(Category.id, UUID(int=0)).label("category_id"),
            func.coalesce(Category.name, "Sin categoría").label("name"),
            func.sum(VoucherItem.total).label("revenue"),
            func.coalesce(
                func.sum(
                    func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                ),
                0,
            ).label("cost"),
            func.count(func.distinct(VoucherItem.product_id)).label("item_count"),
        ]

        base_query = (
            select(*cols)
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .outerjoin(Category, Product.category_id == Category.id)
            .where(
                VoucherItem.voucher_id.in_(voucher_ids),
                VoucherItem.deleted_at.is_(None),
            )
            .group_by(Category.id, Category.name)
        )

        # Contar
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Paginar
        query = base_query.order_by(
            func.sum(VoucherItem.total).desc()
        ).offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            revenue = float(row.revenue)
            cost_val = float(row.cost)
            margin = revenue - cost_val
            margin_pct = (margin / revenue * 100) if revenue > 0 else 0.0
            items.append(
                CategoryProfit(
                    category_id=row.category_id,
                    name=row.name,
                    revenue=round(revenue, 2),
                    cost=round(cost_val, 2),
                    margin=round(margin, 2),
                    margin_pct=round(margin_pct, 2),
                    item_count=int(row.item_count),
                )
            )

        return items, total

    # ── Acopios ─────────────────────────────────────────────────

    async def get_stockpiles(
        self,
        business_id: UUID,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[StockpileIncome], int]:
        """Lista de acopios con ingresos."""
        base_query = (
            select(Stockpile)
            .where(
                Stockpile.business_id == business_id,
                Stockpile.deleted_at.is_(None),
            )
            .options(selectinload(Stockpile.client))
        )

        # Contar
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Paginar
        query = base_query.order_by(Stockpile.created_at.desc()).offset(
            (page - 1) * per_page
        ).limit(per_page)

        result = await self.db.execute(query)
        stockpiles = result.scalars().all()

        items = []
        for sp in stockpiles:
            items.append(
                StockpileIncome(
                    stockpile_id=sp.id,
                    client_name=sp.client.name if sp.client else "Sin cliente",
                    total_paid=float(sp.initial_amount),
                    total_withdrawn=float(sp.withdrawn_amount),
                    remaining=float(sp.remaining_amount),
                    status=sp.status,
                )
            )

        return items, total

    # ── Resumen de cuenta corriente por cliente ─────────────────

    async def get_account_summary(
        self,
        client_id: UUID,
        business_id: UUID,
    ) -> AccountSummary:
        """Resumen de cuenta corriente de un cliente específico."""
        # Obtener el cliente
        result = await self.db.execute(
            select(Client).where(
                Client.id == client_id,
                Client.business_id == business_id,
                Client.deleted_at.is_(None),
            )
        )
        client = result.scalar_one_or_none()
        if not client:
            raise ValueError("Cliente no encontrado")

        # Deuda total: suma de débitos - créditos en client_accounts
        debt_query = await self.db.execute(
            select(
                func.coalesce(func.sum(ClientAccount.debit), 0),
                func.coalesce(func.sum(ClientAccount.credit), 0),
            ).where(
                ClientAccount.client_id == client_id,
                ClientAccount.deleted_at.is_(None),
            )
        )
        total_debit, total_credit = debt_query.one()
        total_debt = float(total_debit) - float(total_credit)

        # Vencido: deuda con más de 30 días de antigüedad
        # Buscamos movimientos de tipo INVOICE/DEBIT_NOTE/ADJUSTMENT_DEBIT
        # con fecha anterior a hace 30 días que no tengan pago asociado
        thirty_days_ago = date.today() - timedelta(days=30)
        overdue_query = await self.db.execute(
            select(func.coalesce(func.sum(ClientAccount.debit), 0)).where(
                ClientAccount.client_id == client_id,
                ClientAccount.deleted_at.is_(None),
                ClientAccount.date < thirty_days_ago,
                ClientAccount.movement_type.in_([
                    MovementType.INVOICE,
                    MovementType.DEBIT_NOTE,
                    MovementType.ADJUSTMENT_DEBIT,
                ]),
            )
        )
        overdue_debits = float(overdue_query.scalar() or 0)

        # Pagos de créditos (pagos, NC, ajustes crédito) anteriores a 30 días
        overdue_credits_query = await self.db.execute(
            select(func.coalesce(func.sum(ClientAccount.credit), 0)).where(
                ClientAccount.client_id == client_id,
                ClientAccount.deleted_at.is_(None),
                ClientAccount.date < thirty_days_ago,
                ClientAccount.movement_type.in_([
                    MovementType.PAYMENT,
                    MovementType.CREDIT_NOTE,
                    MovementType.ADJUSTMENT_CREDIT,
                ]),
            )
        )
        # Solo consideramos vencido lo que excede créditos anteriores
        overdue_credits = float(overdue_credits_query.scalar() or 0)
        overdue = max(0.0, overdue_debits - overdue_credits)

        # Pagado este mes
        first_of_month = date.today().replace(day=1)
        paid_query = await self.db.execute(
            select(func.coalesce(func.sum(ClientAccount.credit), 0)).where(
                ClientAccount.client_id == client_id,
                ClientAccount.deleted_at.is_(None),
                ClientAccount.date >= first_of_month,
                ClientAccount.movement_type.in_([
                    MovementType.PAYMENT,
                    MovementType.CREDIT_NOTE,
                    MovementType.ADJUSTMENT_CREDIT,
                ]),
            )
        )
        paid_this_month = float(paid_query.scalar() or 0)

        # Saldo actual
        balance = float(client.current_balance)

        # Antigüedad máxima (días desde el movimiento débito más antiguo sin pagar)
        aging_query = await self.db.execute(
            select(func.min(ClientAccount.date)).where(
                ClientAccount.client_id == client_id,
                ClientAccount.deleted_at.is_(None),
                ClientAccount.debit > 0,
                ClientAccount.credit == 0,
            )
        )
        oldest_date = aging_query.scalar()
        aging_days = (date.today() - oldest_date).days if oldest_date else 0

        return AccountSummary(
            client_id=client_id,
            client_name=client.name,
            total_debt=round(total_debt, 2),
            overdue=round(overdue, 2),
            paid_this_month=round(paid_this_month, 2),
            balance=round(balance, 2),
            aging_days=aging_days,
        )

    # ── Evolución temporal ────────────────────────────────────

    async def get_evolution(
        self,
        business_id: UUID,
        filters: ProfitabilityFilterParams,
    ) -> list[EvolutionPoint]:
        """Evolución de rentabilidad agregada por período (día/semana/mes)."""
        period_col = func.date_trunc(
            filters.group_by or "month", Voucher.date
        ).label("period")

        cols = [
            period_col,
            func.coalesce(func.sum(VoucherItem.total), 0).label("revenue"),
            func.coalesce(
                func.sum(
                    func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                ),
                0,
            ).label("cost"),
            (
                func.coalesce(func.sum(VoucherItem.total), 0)
                - func.coalesce(
                    func.sum(
                        func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                    ),
                    0,
                )
            ).label("profit"),
        ]

        query = (
            select(*cols)
            .join(Voucher, VoucherItem.voucher_id == Voucher.id)
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .where(
                Voucher.business_id == business_id,
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
            )
        )

        # ── Filtros ──
        if filters.date_from:
            query = query.where(Voucher.date >= filters.date_from)
        if filters.date_to:
            query = query.where(Voucher.date <= filters.date_to)
        if filters.client_id:
            query = query.where(Voucher.client_id == filters.client_id)
        if filters.seller_id:
            query = query.where(Voucher.created_by == filters.seller_id)
        if filters.brand_id:
            query = query.where(Product.brand_id == filters.brand_id)
        if filters.category_id:
            query = query.where(Product.category_id == filters.category_id)
        # branch_id, price_list_id, supplier_id — stubs (modelos no implementados)

        # ── Agrupar y ordenar ──
        query = query.group_by(period_col).order_by(period_col)

        result = await self.db.execute(query)
        rows = result.all()

        return [
            EvolutionPoint(
                period=str(row.period),
                revenue=float(row.revenue or 0),
                cost=float(row.cost or 0),
                profit=float(row.profit or 0),
                margin_pct=round(
                    (float(row.profit or 0) / float(row.revenue or 1) * 100), 2
                ) if row.revenue else 0.0,
            )
            for row in rows
        ]

    # ── Por marca ─────────────────────────────────────────────

    async def get_brands(
        self,
        business_id: UUID,
        filters: ProfitabilityFilterParams,
    ) -> tuple[list[BrandProfit], int]:
        """Rentabilidad desglosada por marca de producto."""
        base_query = (
            select(
                Brand.id.label("brand_id"),
                Brand.name.label("brand_name"),
                func.coalesce(
                    func.sum(VoucherItem.total), 0
                ).label("revenue"),
                func.coalesce(
                    func.sum(
                        func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                    ),
                    0,
                ).label("cost"),
                func.coalesce(
                    func.sum(VoucherItem.quantity), 0
                ).label("units_sold"),
            )
            .join(Voucher, VoucherItem.voucher_id == Voucher.id)
            .join(Product, VoucherItem.product_id == Product.id)
            .join(Brand, Product.brand_id == Brand.id)
            .where(
                Voucher.business_id == business_id,
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
                Brand.deleted_at.is_(None),
                Product.brand_id.isnot(None),
            )
            .group_by(Brand.id, Brand.name)
        )

        # ── Filtros ──
        if filters.date_from:
            base_query = base_query.where(Voucher.date >= filters.date_from)
        if filters.date_to:
            base_query = base_query.where(Voucher.date <= filters.date_to)
        if filters.category_id:
            base_query = base_query.where(Product.category_id == filters.category_id)

        # ── Contar ──
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # ── Paginar ──
        query = (
            base_query
            .order_by(func.sum(VoucherItem.total).desc())
            .offset((filters.page - 1) * filters.per_page)
            .limit(filters.per_page)
        )
        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            revenue = float(row.revenue)
            cost_val = float(row.cost)
            profit = revenue - cost_val
            margin_pct = (profit / revenue * 100) if revenue > 0 else 0.0
            markup_pct = (profit / cost_val * 100) if cost_val > 0 else 0.0
            items.append(
                BrandProfit(
                    brand_id=row.brand_id,
                    brand_name=row.brand_name,
                    revenue=round(revenue, 2),
                    cost=round(cost_val, 2),
                    profit=round(profit, 2),
                    margin_pct=round(margin_pct, 2),
                    markup_pct=round(markup_pct, 2),
                    units_sold=float(row.units_sold),
                )
            )

        return items, total

    # ── Por vendedor ──────────────────────────────────────────

    async def get_sellers(
        self,
        business_id: UUID,
        filters: ProfitabilityFilterParams,
    ) -> tuple[list[SellerProfit], int]:
        """Rentabilidad desglosada por vendedor/usuario."""
        base_query = (
            select(
                Voucher.created_by.label("user_id"),
                func.coalesce(User.name, "Sin nombre").label("seller_name"),
                func.coalesce(
                    func.sum(VoucherItem.total), 0
                ).label("revenue"),
                func.coalesce(
                    func.sum(
                        func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                    ),
                    0,
                ).label("cost"),
                func.coalesce(
                    func.sum(VoucherItem.discount_percent * VoucherItem.unit_price * VoucherItem.quantity / 100),
                    0,
                ).label("discounts_total"),
                func.count(func.distinct(Voucher.id)).label("invoice_count"),
            )
            .join(Voucher, VoucherItem.voucher_id == Voucher.id)
            .outerjoin(User, Voucher.created_by == User.id)
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .where(
                Voucher.business_id == business_id,
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
            )
            .group_by(Voucher.created_by, User.name)
        )

        # ── Filtros ──
        if filters.date_from:
            base_query = base_query.where(Voucher.date >= filters.date_from)
        if filters.date_to:
            base_query = base_query.where(Voucher.date <= filters.date_to)

        # ── Contar ──
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # ── Paginar ──
        query = (
            base_query
            .order_by(func.sum(VoucherItem.total).desc())
            .offset((filters.page - 1) * filters.per_page)
            .limit(filters.per_page)
        )
        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            revenue = float(row.revenue)
            cost_val = float(row.cost)
            profit = revenue - cost_val
            margin_pct = (profit / revenue * 100) if revenue > 0 else 0.0
            items.append(
                SellerProfit(
                    user_id=row.user_id,
                    seller_name=row.seller_name,
                    revenue=round(revenue, 2),
                    profit=round(profit, 2),
                    margin_pct=round(margin_pct, 2),
                    discounts_total=round(float(row.discounts_total), 2),
                    invoice_count=int(row.invoice_count),
                )
            )

        return items, total

    # ── Por comprobante ───────────────────────────────────────

    async def get_documents(
        self,
        business_id: UUID,
        filters: ProfitabilityFilterParams,
    ) -> tuple[list[DocumentProfit], int]:
        """Rentabilidad desglosada por comprobante individual."""
        base_query = (
            select(
                Voucher.id.label("voucher_id"),
                Voucher.voucher_type.label("document_type"),
                func.concat(
                    Voucher.sale_point, "-", Voucher.number
                ).label("document_number"),
                Voucher.date,
                func.coalesce(Client.name, "Sin nombre").label("client_name"),
                func.coalesce(User.name, "Sin vendedor").label("seller_name"),
                func.coalesce(
                    func.sum(VoucherItem.total), 0
                ).label("revenue"),
                func.coalesce(
                    func.sum(
                        func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                    ),
                    0,
                ).label("cost"),
                Voucher.status,
            )
            .join(VoucherItem, VoucherItem.voucher_id == Voucher.id)
            .outerjoin(Client, Voucher.client_id == Client.id)
            .outerjoin(User, Voucher.created_by == User.id)
            .outerjoin(Product, VoucherItem.product_id == Product.id)
            .where(
                Voucher.business_id == business_id,
                Voucher.status == VoucherStatus.CONFIRMED,
                Voucher.deleted_at.is_(None),
                VoucherItem.deleted_at.is_(None),
            )
            .group_by(
                Voucher.id, Voucher.voucher_type, Voucher.sale_point,
                Voucher.number, Voucher.date, Voucher.status,
                Client.name, User.name,
            )
        )

        # ── Filtros ──
        if filters.date_from:
            base_query = base_query.where(Voucher.date >= filters.date_from)
        if filters.date_to:
            base_query = base_query.where(Voucher.date <= filters.date_to)
        if filters.client_id:
            base_query = base_query.where(Voucher.client_id == filters.client_id)
        if filters.seller_id:
            base_query = base_query.where(Voucher.created_by == filters.seller_id)
        if filters.document_type:
            base_query = base_query.where(
                Voucher.voucher_type == filters.document_type
            )
        if filters.search:
            pattern = f"%{filters.search}%"
            base_query = base_query.where(
                or_(
                    Client.name.ilike(pattern),
                    Voucher.number.ilike(pattern),
                    User.name.ilike(pattern),
                )
            )

        # ── Contar ──
        count_query = select(func.count()).select_from(base_query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # ── Paginar ──
        query = (
            base_query
            .order_by(Voucher.date.desc())
            .offset((filters.page - 1) * filters.per_page)
            .limit(filters.per_page)
        )
        result = await self.db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            revenue = float(row.revenue)
            cost_val = float(row.cost)
            profit = revenue - cost_val
            margin_pct = (profit / revenue * 100) if revenue > 0 else 0.0
            items.append(
                DocumentProfit(
                    voucher_id=row.voucher_id,
                    document_type=str(row.document_type),
                    document_number=str(row.document_number),
                    date=row.date,
                    client_name=row.client_name,
                    seller_name=row.seller_name,
                    revenue=round(revenue, 2),
                    cost=round(cost_val, 2),
                    profit=round(profit, 2),
                    margin_pct=round(margin_pct, 2),
                    status=str(row.status),
                )
            )

        return items, total

    # ── Alertas de rentabilidad ───────────────────────────────

    async def get_alerts(
        self,
        business_id: UUID,
        filters: ProfitabilityFilterParams,
    ) -> AlertSummary:
        """Detecta anomalías de rentabilidad (márgenes negativos, productos sin costo, descuentos excesivos)."""
        # ── Condiciones base compartidas ──
        base_where = [
            Voucher.business_id == business_id,
            Voucher.status == VoucherStatus.CONFIRMED,
            Voucher.deleted_at.is_(None),
            VoucherItem.deleted_at.is_(None),
        ]
        if filters.date_from:
            base_where.append(Voucher.date >= filters.date_from)
        if filters.date_to:
            base_where.append(Voucher.date <= filters.date_to)

        base_join = (
            VoucherItem.__table__.join(
                Voucher.__table__,
                VoucherItem.voucher_id == Voucher.id,
            )
            .outerjoin(
                Client.__table__,
                Voucher.client_id == Client.id,
            )
        )

        def _run_alert_query(
            extra_where: list,
            select_cols: list,
        ):
            query = select(*select_cols).select_from(base_join).where(
                *base_where, *extra_where
            )
            return query.order_by(Voucher.date.desc()).limit(50)

        # ── 1. Márgenes negativos ──
        neg_cols = [
            VoucherItem.voucher_id,
            VoucherItem.description.label("product_name"),
            func.coalesce(Client.name, "Sin nombre").label("client_name"),
            func.coalesce(VoucherItem.total, 0).label("revenue"),
            (
                func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
            ).label("cost"),
            (
                (
                    func.coalesce(VoucherItem.total, 0)
                    - func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                )
                / func.coalesce(VoucherItem.total, 1) * 100
            ).label("margin_pct"),
        ]
        neg_where = [
            VoucherItem.cost_price.isnot(None),
            (
                func.coalesce(VoucherItem.total, 0)
                - func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
            ) <= 0,
        ]
        neg_result = await self.db.execute(
            _run_alert_query(neg_where, neg_cols)
        )
        neg_rows = neg_result.all()

        # ── 2. Sin precio de costo ──
        nocost_cols = [
            VoucherItem.voucher_id,
            VoucherItem.description.label("product_name"),
            func.coalesce(Client.name, "Sin nombre").label("client_name"),
            func.coalesce(VoucherItem.total, 0).label("revenue"),
            null().label("cost"),
            null().label("margin_pct"),
        ]
        nocost_where = [
            VoucherItem.cost_price.is_(None),
        ]
        nocost_result = await self.db.execute(
            _run_alert_query(nocost_where, nocost_cols)
        )
        nocost_rows = nocost_result.all()

        # ── 3. Descuentos excesivos (>30%) ──
        discount_cols = [
            VoucherItem.voucher_id,
            VoucherItem.description.label("product_name"),
            func.coalesce(Client.name, "Sin nombre").label("client_name"),
            func.coalesce(VoucherItem.total, 0).label("revenue"),
            (
                func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
            ).label("cost"),
            VoucherItem.discount_percent.label("margin_pct"),
        ]
        discount_where = [
            VoucherItem.discount_percent > 30,
        ]
        discount_result = await self.db.execute(
            _run_alert_query(discount_where, discount_cols)
        )
        discount_rows = discount_result.all()

        # ── 4. Margen bajo (0% < margen <= 5%) ──
        low_cols = [
            VoucherItem.voucher_id,
            VoucherItem.description.label("product_name"),
            func.coalesce(Client.name, "Sin nombre").label("client_name"),
            func.coalesce(VoucherItem.total, 0).label("revenue"),
            (
                func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
            ).label("cost"),
            (
                (
                    func.coalesce(VoucherItem.total, 0)
                    - func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                )
                / func.coalesce(VoucherItem.total, 1) * 100
            ).label("margin_pct"),
        ]
        low_where = [
            VoucherItem.cost_price.isnot(None),
            (
                func.coalesce(VoucherItem.total, 0)
                - func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
            ) > 0,
            (
                (
                    func.coalesce(VoucherItem.total, 0)
                    - func.coalesce(func.nullif(VoucherItem.cost_price, 0), func.nullif(Product.cost_price, 0), 0) * VoucherItem.quantity
                )
                / func.coalesce(VoucherItem.total, 1) * 100
            ) <= 5,
        ]
        low_result = await self.db.execute(
            _run_alert_query(low_where, low_cols)
        )
        low_rows = low_result.all()

        # ── Ensamblar alertas ──
        alerts: list[ProfitabilityAlert] = []

        for row in neg_rows:
            margin_val = float(row.margin_pct) if row.margin_pct is not None else None
            cost_val = float(row.cost) if row.cost is not None else None
            alerts.append(
                ProfitabilityAlert(
                    type="negative_margin",
                    voucher_id=row.voucher_id,
                    product_name=row.product_name,
                    client_name=row.client_name,
                    revenue=float(row.revenue),
                    cost=cost_val,
                    margin_pct=margin_val,
                    reason="Margen negativo: el costo supera al ingreso",
                )
            )

        for row in nocost_rows:
            alerts.append(
                ProfitabilityAlert(
                    type="no_cost",
                    voucher_id=row.voucher_id,
                    product_name=row.product_name,
                    client_name=row.client_name,
                    revenue=float(row.revenue),
                    cost=None,
                    margin_pct=None,
                    reason="Producto sin precio de costo registrado",
                )
            )

        for row in discount_rows:
            cost_val = float(row.cost) if row.cost is not None else None
            disc_val = float(row.margin_pct) if row.margin_pct is not None else None
            alerts.append(
                ProfitabilityAlert(
                    type="excessive_discount",
                    voucher_id=row.voucher_id,
                    product_name=row.product_name,
                    client_name=row.client_name,
                    revenue=float(row.revenue),
                    cost=cost_val,
                    margin_pct=disc_val,
                    reason=f"Descuento excesivo: {disc_val:.0f}%",
                )
            )

        for row in low_rows:
            margin_val = float(row.margin_pct) if row.margin_pct is not None else None
            cost_val = float(row.cost) if row.cost is not None else None
            alerts.append(
                ProfitabilityAlert(
                    type="low_margin",
                    voucher_id=row.voucher_id,
                    product_name=row.product_name,
                    client_name=row.client_name,
                    revenue=float(row.revenue),
                    cost=cost_val,
                    margin_pct=margin_val,
                    reason=f"Margen bajo: {margin_val:.1f}% — por debajo del 5%",
                )
            )

        # ── Contar por tipo ──
        type_counts = Counter(a.type for a in alerts)

        return AlertSummary(
            negative_margin_count=type_counts.get("negative_margin", 0),
            low_margin_count=type_counts.get("low_margin", 0),
            no_cost_count=type_counts.get("no_cost", 0),
            excessive_discount_count=type_counts.get("excessive_discount", 0),
            alerts=alerts,
        )

    # ── CRUD de Gastos ─────────────────────────────────────────

    async def get_expenses(
        self,
        business_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
        category_id: UUID | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Expense], int]:
        """Lista gastos con filtros y paginación."""
        query = select(Expense).where(
            Expense.business_id == business_id,
            Expense.deleted_at.is_(None),
        ).options(selectinload(Expense.category))

        if date_from:
            query = query.where(Expense.date >= date_from)
        if date_to:
            query = query.where(Expense.date <= date_to)
        if category_id:
            query = query.where(Expense.category_id == category_id)

        # Contar
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Paginar
        query = query.order_by(Expense.date.desc()).offset(
            (page - 1) * per_page
        ).limit(per_page)

        result = await self.db.execute(query)
        expenses = result.scalars().all()

        return list(expenses), total

    async def create_expense(
        self,
        business_id: UUID,
        user_id: UUID,
        data: ExpenseCreate,
    ) -> Expense:
        """Crea un nuevo gasto."""
        expense = Expense(
            business_id=business_id,
            category_id=data.category_id,
            description=data.description,
            amount=data.amount,
            date=data.date,
            payment_method=data.payment_method,
            notes=data.notes,
            created_by=user_id,
        )
        self.db.add(expense)
        await self.db.commit()
        await self.db.refresh(expense, attribute_names=["category"])
        return expense

    async def update_expense(
        self,
        expense_id: UUID,
        business_id: UUID,
        data: ExpenseUpdate,
    ) -> Expense | None:
        """Actualiza un gasto existente."""
        result = await self.db.execute(
            select(Expense).where(
                Expense.id == expense_id,
                Expense.business_id == business_id,
                Expense.deleted_at.is_(None),
            )
        )
        expense = result.scalar_one_or_none()
        if not expense:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(expense, field, value)

        await self.db.commit()
        await self.db.refresh(expense, attribute_names=["category"])
        return expense

    async def delete_expense(
        self,
        expense_id: UUID,
        business_id: UUID,
    ) -> bool:
        """Elimina un gasto (soft delete)."""
        result = await self.db.execute(
            select(Expense).where(
                Expense.id == expense_id,
                Expense.business_id == business_id,
                Expense.deleted_at.is_(None),
            )
        )
        expense = result.scalar_one_or_none()
        if not expense:
            return False

        expense.soft_delete()
        await self.db.commit()
        return True

    async def get_expense_categories(
        self,
        business_id: UUID,
    ) -> list[ExpenseCategory]:
        """Lista todas las categorías de gasto activas."""
        result = await self.db.execute(
            select(ExpenseCategory).where(
                ExpenseCategory.business_id == business_id,
                ExpenseCategory.is_active.is_(True),
                ExpenseCategory.deleted_at.is_(None),
            ).order_by(ExpenseCategory.name)
        )
        return list(result.scalars().all())

    async def create_expense_category(
        self,
        business_id: UUID,
        data: ExpenseCategoryCreate,
    ) -> ExpenseCategory:
        """Crea una nueva categoría de gasto."""
        category = ExpenseCategory(
            business_id=business_id,
            name=data.name,
            description=data.description,
        )
        self.db.add(category)
        await self.db.commit()
        await self.db.refresh(category)
        return category
