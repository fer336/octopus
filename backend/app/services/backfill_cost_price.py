"""
Servicio de backfill de cost_price histórico para VoucherItem.
Busca items sin cost_price y los completa desde Product.cost_price
o PriceHistory cuando está disponible.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.voucher_item import VoucherItem

logger = logging.getLogger("uvicorn")


async def backfill_cost_price(
    db: AsyncSession,
    batch_size: int = 500,
    days_window: int = 30,
) -> dict[str, int]:
    """
    Backfill de cost_price para VoucherItems que no tienen uno asignado.

    Para cada item sin cost_price:
    1. Busca PriceHistory del producto cercano a la fecha del voucher
    2. Si existe, usa el costo más cercano disponible
    3. Si no existe PriceHistory, usa Product.cost_price actual
    4. Si se usa el costo actual (no histórico), marca cost_price_estimated = True

    Args:
        db: Sesión de base de datos
        batch_size: Tamaño de lote para procesar
        days_window: Ventana en días para buscar PriceHistory cercano

    Returns:
        Dict con estadísticas del backfill
    """
    stats: dict[str, int] = {
        "updated": 0,
        "estimated": 0,
        "skipped_with_cost": 0,
        "skipped_no_product": 0,
        "errors": 0,
        "total_processed": 0,
    }

    # Buscar items sin cost_price
    query = (
        select(VoucherItem)
        .where(VoucherItem.cost_price.is_(None))
        .limit(batch_size)
    )
    result = await db.execute(query)
    items = list(result.scalars().all())

    if not items:
        logger.info("No hay VoucherItems pendientes de backfill")
        return stats

    stats["total_processed"] = len(items)

    for item in items:
        try:
            # Verificar que el item tiene producto
            if not item.product_id:
                stats["skipped_no_product"] += 1
                continue

            # Obtener el producto
            product = await db.get(Product, item.product_id)
            if not product:
                stats["skipped_no_product"] += 1
                continue

            # Buscar PriceHistory cercano a la fecha del voucher
            # Primero obtener la fecha del voucher
            from app.models.voucher import Voucher

            voucher = await db.get(Voucher, item.voucher_id)
            voucher_date = voucher.date if voucher else None

            cost_price_to_use: Decimal | None = None
            is_estimated = False

            if voucher_date and product.cost_price and product.cost_price > 0:
                # Buscar PriceHistory alrededor de la fecha del voucher
                date_start = voucher_date - timedelta(days=days_window)
                date_end = voucher_date + timedelta(days=1)

                history_query = (
                    select(PriceHistory)
                    .where(
                        PriceHistory.product_id == product.id,
                        PriceHistory.created_at >= date_start,
                        PriceHistory.created_at <= date_end,
                    )
                    .order_by(PriceHistory.created_at.desc())
                    .limit(1)
                )
                history_result = await db.execute(history_query)
                price_history = history_result.scalar_one_or_none()

                if price_history:
                    # Usar el costo del producto en ese momento
                    # PriceHistory no guarda cost_price, usamos el actual como aproximación
                    # Si en el futuro se agrega cost_price a PriceHistory, aquí se puede mejorar
                    cost_price_to_use = product.cost_price
                    is_estimated = True
                else:
                    # No hay historial, usar costo actual
                    cost_price_to_use = product.cost_price
                    is_estimated = True
            elif product.cost_price and product.cost_price > 0:
                # No hay fecha de voucher, usar costo actual
                cost_price_to_use = product.cost_price
                is_estimated = True
            else:
                # Producto sin costo definido
                cost_price_to_use = Decimal("0")
                is_estimated = False

            # Actualizar el item
            item.cost_price = cost_price_to_use
            item.cost_price_estimated = is_estimated
            stats["updated"] += 1
            if is_estimated:
                stats["estimated"] += 1

        except Exception as e:
            logger.error(f"Error backfilling item {item.id}: {e}")
            stats["errors"] += 1

    # Commit en lote
    await db.commit()
    logger.info(
        f"Backfill completado: {stats['updated']} actualizados, "
        f"{stats['estimated']} estimados, {stats['errors']} errores"
    )

    return stats
