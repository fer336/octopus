"""
Schemas de filtros para reportes PDF.
"""

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


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
