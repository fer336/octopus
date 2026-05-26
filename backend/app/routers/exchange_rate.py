"""
Router para cotizaciones del dólar (blue y oficial).
"""

from fastapi import APIRouter, Depends

from app.services.exchange_rate_service import fetch_dollar_rates
from app.utils.security import get_current_business

router = APIRouter(prefix="/exchange-rate", tags=["Exchange Rate"])


@router.get("")
async def get_exchange_rate(_=Depends(get_current_business)):
    """Devuelve compra, venta y promedio del dólar blue y oficial."""
    return await fetch_dollar_rates()
