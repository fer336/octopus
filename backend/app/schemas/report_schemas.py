"""
Schemas de filtros para reportes PDF.
"""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


ReportFormat = Literal["pdf", "xlsx", "csv"]


class BaseReportFilters(BaseModel):
    """Filtros base para reportes por período."""

    date_from: date | None = Field(default=None)
    date_to: date | None = Field(default=None)

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from no puede ser mayor a date_to")
        return self


class StockReportFilters(BaseModel):
    """Filtros para reporte de stock."""

    search: str | None = Field(default=None, max_length=120)
    category_id: UUID | None = None
    supplier_id: UUID | None = None
    low_stock_only: bool = False
    include_inactive: bool = False


class SalesReportFilters(BaseReportFilters):
    """Filtros para reporte de ventas."""

    include_receipts: bool = True


class TopProductsReportFilters(BaseReportFilters):
    """Filtros para reporte de productos más vendidos."""

    limit: int = Field(default=30, ge=1, le=200)


class ClientAccountsReportFilters(BaseModel):
    """Filtros para reporte de cuentas corrientes."""

    only_with_balance: bool = True


class CategoryReportFilters(BaseReportFilters):
    """Filtros para reporte por categoría."""

    category_id: UUID | None = None


class SupplierReportFilters(BaseReportFilters):
    """Filtros para reporte por proveedor."""

    supplier_id: UUID | None = None
    only_with_stock: bool = False


class PurchaseOrderHistoryReportFilters(BaseReportFilters):
    """Filtros para historial de órdenes de pedido."""

    supplier_id: UUID | None = None
    status: Literal["draft", "confirmed"] | None = None


class StockpileWithdrawalsReportFilters(BaseReportFilters):
    """Filtros para retiros de acopio."""

    stockpile_id: UUID | None = None


class CurrentAccountWithdrawalsReportFilters(BaseReportFilters):
    """Filtros para retiros de cuenta corriente."""

    client_id: UUID | None = None


class InventoryCountReportFilters(BaseModel):
    """Filtros para planilla de conteo de inventario."""

    supplier_id: UUID | None = None
    category_id: UUID | None = None

    @model_validator(mode="after")
    def validate_required_filter(self):
        if not self.supplier_id and not self.category_id:
            raise ValueError("Debe especificar al menos un proveedor o una categoría")
        return self
