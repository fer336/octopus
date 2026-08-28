"""
Tests para la variante flush-only de ProductLotService (Compras — PR2).

`create_uncommitted` es necesaria para que `PurchaseInvoiceService.confirm()`
y `InvoiceReversalService.edit_confirmed()` puedan crear lotes dentro de su
propia transacción atómica sin comprometerla prematuramente (el llamador es
responsable de `db.commit()`/`db.rollback()`).
"""
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.schemas.product_lot import ProductLotCreate
from app.services.product_lot_service import ProductLotService

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def product_a(db, business_a):
    product = Product(
        business_id=business_a.id,
        code="LOT-001",
        description="Producto para test de lotes",
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


class TestCreateUncommitted:
    """RED → create_uncommitted no debe comprometer la transacción."""

    async def test_flushes_and_assigns_id_without_committing(
        self, db, business_a, product_a, user_a
    ):
        """RED → tras create_uncommitted, el lote tiene ID (flush) pero un
        rollback posterior debe deshacerlo por completo (nunca se commiteó).
        """
        service = ProductLotService(db)

        lot = await service.create_uncommitted(
            product_id=product_a.id,
            business_id=business_a.id,
            data=ProductLotCreate(quantity=15, cost_price=100, code="FC-0001"),
            user_id=user_a.id,
        )

        # Flush ocurrió: el lote tiene ID y es visible dentro de la misma transacción
        assert lot.id is not None
        visible = await db.get(ProductLot, lot.id)
        assert visible is not None

        # Rollback debe deshacer todo — nunca se llamó a commit()
        await db.rollback()

        gone = await db.get(ProductLot, lot.id)
        assert gone is None

    async def test_caller_controls_commit(self, db, business_a, product_a, user_a):
        """GREEN → si el llamador decide comitear, el lote persiste normalmente."""
        service = ProductLotService(db)

        lot = await service.create_uncommitted(
            product_id=product_a.id,
            business_id=business_a.id,
            data=ProductLotCreate(quantity=8, code="FC-0002"),
            user_id=user_a.id,
        )
        await db.commit()

        result = await db.execute(
            select(ProductLot).where(ProductLot.id == lot.id)
        )
        persisted = result.scalar_one()
        assert persisted.quantity == 8
        assert persisted.initial_quantity == 8

    async def test_existing_create_still_commits_unchanged(
        self, db, business_a, product_a, user_a
    ):
        """GREEN → create() (existente, usado por vouchers/lot router) sigue
        comiteando inmediatamente — no se rompió el contrato existente.
        """
        service = ProductLotService(db)

        lot = await service.create(
            product_id=product_a.id,
            business_id=business_a.id,
            data=ProductLotCreate(
                quantity=5, cost_price=50, received_date=date.today()
            ),
            user_id=user_a.id,
        )

        # Nueva sesión no debería ser necesaria: create() ya comitió.
        result = await db.execute(select(ProductLot).where(ProductLot.id == lot.id))
        assert result.scalar_one().quantity == 5
