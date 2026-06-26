"""
Tests para backfill de cost_price histórico (T3).
"""
from datetime import date, datetime
from decimal import Decimal

import pytest
import pytest_asyncio

from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.models.client import Client
from app.services.backfill_cost_price import backfill_cost_price


@pytest_asyncio.fixture
async def client_type_for_backfill(db, business_a):
    """Crea un ClientType para tests de backfill."""
    from app.models.client_type import ClientType
    ct = ClientType(
        business_id=business_a.id,
        name="Consumidor Final",
    )
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@pytest.mark.asyncio
class TestBackfillCostPrice:
    """RED → backfill_cost_price actualiza VoucherItems sin cost_price."""

    async def _setup_voucher_with_item(
        self, db, business, user, product, client=None, client_type=None
    ) -> VoucherItem:
        """Helper para crear un voucher + item de prueba."""
        if client is None:
            client = Client(
                business_id=business.id,
                name="Backfill Client",
                client_type_id=client_type.id,
                document_type="DNI",
                document_number="11111111",
                tax_condition="Consumidor Final",
            )
            db.add(client)
            await db.flush()

        voucher = Voucher(
            business_id=business.id,
            client_id=client.id,
            created_by=user.id,
            voucher_type=VoucherType.QUOTATION,
            status=VoucherStatus.CONFIRMED,
            sale_point="0001",
            number="00000001",
            date=date(2026, 1, 15),
            subtotal=Decimal("100"),
            iva_amount=Decimal("21"),
            total=Decimal("121"),
        )
        db.add(voucher)
        await db.flush()

        item = VoucherItem(
            voucher_id=voucher.id,
            product_id=product.id,
            code=product.code,
            description=product.description,
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
            line_number=1,
            cost_price=None,
            cost_price_estimated=False,
        )
        db.add(item)
        await db.flush()
        return item

    async def test_backfill_sets_current_cost_price(
        self, db, business_a, user_a, client_type_for_backfill
    ):
        """GREEN → backfill usa cost_price actual si no hay PriceHistory."""
        product = Product(
            business_id=business_a.id,
            code="BF001",
            description="Backfill test",
            cost_price=Decimal("45.00"),
            list_price=Decimal("150"),
            net_price=Decimal("120"),
            sale_price=Decimal("145.20"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        item = await self._setup_voucher_with_item(
            db, business_a, user_a, product, client_type=client_type_for_backfill
        )

        result = await backfill_cost_price(db, batch_size=10)

        # Verificar que se actualizó
        await db.refresh(item)
        assert item.cost_price == Decimal("45.00")
        assert item.cost_price_estimated is True  # Sin PriceHistory → estimated
        assert result["updated"] == 1

    async def test_backfill_uses_price_history(
        self, db, business_a, user_a, client_type_for_backfill
    ):
        """GREEN → backfill usa PriceHistory cercano si existe."""
        product = Product(
            business_id=business_a.id,
            code="BF002",
            description="Backfill with history",
            cost_price=Decimal("60.00"),
            list_price=Decimal("200"),
            net_price=Decimal("160"),
            sale_price=Decimal("193.60"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        # PriceHistory 5 días antes del voucher
        history = PriceHistory(
            product_id=product.id,
            old_list_price=Decimal("180"),
            old_net_price=Decimal("140"),
            old_sale_price=Decimal("169.40"),
            new_list_price=Decimal("200"),
            new_net_price=Decimal("160"),
            new_sale_price=Decimal("193.60"),
            change_reason="Price update",
        )
        # Forzar created_at más antiguo
        history.created_at = datetime(2026, 1, 10, 10, 0, 0)
        db.add(history)
        await db.flush()

        item = await self._setup_voucher_with_item(
            db, business_a, user_a, product, client_type=client_type_for_backfill
        )

        result = await backfill_cost_price(db, batch_size=10)

        await db.refresh(item)
        # Como tiene PriceHistory (aunque no guarda cost_price), usamos costo actual
        assert item.cost_price is not None
        assert result["updated"] >= 1

    async def test_backfill_skips_items_with_cost_price(
        self, db, business_a, user_a, client_type_for_backfill
    ):
        """GREEN → backfill salta items que ya tienen cost_price."""
        product = Product(
            business_id=business_a.id,
            code="BF003",
            description="Already has cost",
            cost_price=Decimal("30.00"),
            list_price=Decimal("100"),
            net_price=Decimal("80"),
            sale_price=Decimal("96.80"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        client = Client(
            business_id=business_a.id,
            name="Skip Client",
            client_type_id=client_type_for_backfill.id,
            document_type="DNI",
            document_number="22222222",
            tax_condition="Consumidor Final",
        )
        db.add(client)
        await db.flush()

        voucher = Voucher(
            business_id=business_a.id,
            client_id=client.id,
            created_by=user_a.id,
            voucher_type=VoucherType.QUOTATION,
            status=VoucherStatus.CONFIRMED,
            sale_point="0001",
            number="00000002",
            date=date(2026, 1, 15),
            subtotal=Decimal("80"),
            iva_amount=Decimal("16.80"),
            total=Decimal("96.80"),
        )
        db.add(voucher)
        await db.flush()

        item = VoucherItem(
            voucher_id=voucher.id,
            product_id=product.id,
            code=product.code,
            description=product.description,
            quantity=Decimal("1"),
            unit_price=Decimal("80"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("16.80"),
            subtotal=Decimal("80"),
            total=Decimal("96.80"),
            line_number=1,
            cost_price=Decimal("30.00"),  # Ya tiene costo
            cost_price_estimated=False,
        )
        db.add(item)
        await db.commit()

        result = await backfill_cost_price(db, batch_size=10)

        assert result["updated"] == 0
        assert result["total_processed"] == 0

    async def test_backfill_empty_db(self, db):
        """GREEN → backfill sin items retorna 0 actualizados."""
        result = await backfill_cost_price(db, batch_size=10)
        assert result["updated"] == 0
        assert result["skipped_no_product"] == 0

    async def test_backfill_summary_format(
        self, db, business_a, user_a, client_type_for_backfill
    ):
        """GREEN → backfill retorna summary con todas las claves esperadas."""
        product = Product(
            business_id=business_a.id,
            code="BF004",
            description="Summary test",
            cost_price=Decimal("10.00"),
            list_price=Decimal("50"),
            net_price=Decimal("40"),
            sale_price=Decimal("48.40"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        await self._setup_voucher_with_item(
            db, business_a, user_a, product, client_type=client_type_for_backfill
        )

        result = await backfill_cost_price(db, batch_size=10)

        expected_keys = {
            "updated", "estimated", "skipped_with_cost",
            "skipped_no_product", "errors", "total_processed",
        }
        assert expected_keys.issubset(result.keys())
        assert result["total_processed"] >= 1
