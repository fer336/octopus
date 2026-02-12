"""
Router de Dashboard.
Endpoints para estadísticas y resumen del negocio.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.client import Client
from app.models.product import Product
from app.schemas.base import BaseSchema
from app.utils.security import get_current_business

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class DashboardSummary(BaseSchema):
    """Resumen del dashboard."""
    total_products: int
    total_clients: int
    low_stock_products: int
    total_value: float  # Valor total del inventario (costo)


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un resumen estadístico para el dashboard."""
    
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
    # Nota: Esto es una aproximación simple.
    value_query = select(func.sum(Product.cost_price * Product.current_stock)).where(
        Product.business_id == business_id,
        Product.deleted_at.is_(None)
    )
    total_value = (await db.execute(value_query)).scalar() or 0.0

    return DashboardSummary(
        total_products=total_products,
        total_clients=total_clients,
        low_stock_products=low_stock_products,
        total_value=float(total_value)
    )
