"""
Servicio de dataset para planilla de conteo de inventario.
"""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.schemas.report_schemas import InventoryCountReportFilters
from app.services.purchase_order_service import PurchaseOrderService
from app.services.reporting.base_report_service import BaseReportService, ReportDataset


class InventoryCountReportService(BaseReportService[InventoryCountReportFilters]):
    """Construye la planilla de conteo desde la fuente existente de órdenes de pedido."""

    HEADERS = [
        "Código",
        "Descripción",
        "Categoría",
        "Proveedor",
        "Stock Sistema",
        "Conteo Físico",
        "A Pedir",
    ]

    def __init__(self, db: AsyncSession):
        self.db = db
        self.purchase_order_service = PurchaseOrderService(db)

    async def build_dataset(
        self,
        business_id: UUID,
        filters: InventoryCountReportFilters,
        generated_by: str | None = None,
    ) -> ReportDataset:
        """Arma filas descargables manteniendo la lógica de filtro de planilla existente."""
        products = await self.purchase_order_service.get_products_for_count_sheet(
            business_id=business_id,
            supplier_id=filters.supplier_id,
            category_id=filters.category_id,
        )
        business = await self.db.get(Business, business_id)

        rows = [self._product_to_row(product) for product in products]
        supplier_name = self._first_related_name(products, "supplier")
        category_name = self._first_related_name(products, "category")

        dataset = self.create_dataset(
            title="Planilla de Conteo de Inventario",
            business=business,
            filters=filters,
            headers=self.HEADERS,
            rows=rows,
            totals={"Productos": len(rows)},
            generated_by=generated_by,
            orientation="landscape",
        )
        dataset.filters = self._display_filters(filters, supplier_name, category_name)
        return dataset

    @staticmethod
    def _product_to_row(product: Any) -> dict[str, Any]:
        """Convierte un producto activo en una fila editable por el operador."""
        return {
            "Código": product.code or "",
            "Descripción": product.description or "",
            "Categoría": product.category.name if product.category else "",
            "Proveedor": product.supplier.name if product.supplier else "",
            "Stock Sistema": product.current_stock,
            "Conteo Físico": "",
            "A Pedir": "",
        }

    @staticmethod
    def _first_related_name(products: list[Any], relation_name: str) -> str:
        """Obtiene el primer nombre de relación disponible para mostrar filtros."""
        for product in products:
            relation = getattr(product, relation_name, None)
            if relation and getattr(relation, "name", None):
                return relation.name
        return ""

    @staticmethod
    def _display_filters(
        filters: InventoryCountReportFilters,
        supplier_name: str,
        category_name: str,
    ) -> dict[str, Any]:
        """Presenta nombres si existen y conserva UUIDs cuando el resultado está vacío."""
        display: dict[str, Any] = {}
        if filters.supplier_id:
            display["Proveedor"] = supplier_name or str(filters.supplier_id)
        if filters.category_id:
            display["Categoría"] = category_name or str(filters.category_id)
        return display
