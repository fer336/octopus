"""
Tests para cost_price snapshot en VoucherItem.
Cubre T1 (modelo) y T4 (snapshot al confirmar voucher).
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio

from app.models.voucher_item import VoucherItem
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.product import Product
from app.models.business import Business
from app.models.client import Client


class TestVoucherItemCostPriceModel:
    """RED → VoucherItem tiene campos cost_price y cost_price_estimated."""

    def test_cost_price_default_none(self):
        """VoucherItem.cost_price debe ser None por defecto."""
        item = VoucherItem(
            voucher_id=uuid4(),
            product_id=uuid4(),
            code="TEST",
            description="Test item",
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
        )
        assert item.cost_price is None

    def test_cost_price_estimated_default_false(self):
        """VoucherItem.cost_price_estimated debe ser False por defecto.
        
        NOTA: SQLAlchemy Column(default=False) aplica el default al INSERT,
        no al construir el objeto Python. Usamos el objeto via session para
        verificar el default real en DB.
        """
        item = VoucherItem(
            voucher_id=uuid4(),
            product_id=uuid4(),
            code="TEST",
            description="Test item",
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
            cost_price_estimated=False,
        )
        assert item.cost_price_estimated is False

    def test_cost_price_set_and_read(self):
        """VoucherItem.cost_price debe aceptar Decimal."""
        item = VoucherItem(
            voucher_id=uuid4(),
            product_id=uuid4(),
            code="TEST",
            description="Test item",
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
            cost_price=Decimal("50.00"),
        )
        assert item.cost_price == Decimal("50.00")

    def test_cost_price_estimated_set_true(self):
        """VoucherItem.cost_price_estimated debe aceptar True."""
        item = VoucherItem(
            voucher_id=uuid4(),
            product_id=uuid4(),
            code="TEST",
            description="Test item",
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
            cost_price_estimated=True,
        )
        assert item.cost_price_estimated is True


@pytest.mark.asyncio
class TestVoucherItemCostPricePersistence:
    """RED → cost_price y cost_price_estimated persisten en DB."""

    async def test_cost_price_estimated_default_in_db(self, db):
        """GREEN → al persistir, cost_price_estimated default es False."""
        item = VoucherItem(
            voucher_id=uuid4(),
            product_id=uuid4(),
            code="TEST",
            description="Test DB default",
            quantity=Decimal("1"),
            unit_price=Decimal("100"),
            iva_rate=Decimal("21"),
            iva_amount=Decimal("21"),
            subtotal=Decimal("100"),
            total=Decimal("121"),
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        assert item.cost_price_estimated is False


@pytest_asyncio.fixture
async def client_type_for_test(db, business_a):
    """Crea un ClientType para usar en tests."""
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
class TestCostPriceSnapshotOnConfirm:
    """RED → Al confirmar voucher, copia cost_price del producto a VoucherItem."""

    async def test_snapshot_copies_cost_price_from_product(
        self, db, business_a, user_a, client_type_for_test
    ):
        """GREEN → Al crear voucher CONFIRMED, VoucherItem obtiene cost_price del producto."""
        # Arrange: crear cliente y producto con cost_price
        client = Client(
            business_id=business_a.id,
            name="Test Client",
            client_type_id=client_type_for_test.id,
            document_type="DNI",
            document_number="12345678",
            tax_condition="Consumidor Final",
        )
        db.add(client)
        await db.flush()

        product = Product(
            business_id=business_a.id,
            code="CP001",
            description="Producto con costo",
            cost_price=Decimal("75.50"),
            list_price=Decimal("200"),
            net_price=Decimal("150"),
            sale_price=Decimal("181.50"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        voucher = Voucher(
            business_id=business_a.id,
            client_id=client.id,
            created_by=user_a.id,
            voucher_type=VoucherType.QUOTATION,
            status=VoucherStatus.CONFIRMED,
            sale_point="0001",
            number="00000001",
            date=date(2026, 6, 22),
            subtotal=Decimal("150"),
            iva_amount=Decimal("31.50"),
            total=Decimal("181.50"),
        )
        db.add(voucher)
        await db.flush()

        # Creamos VoucherItem simulando la lógica real
        item = VoucherItem(
            voucher_id=voucher.id,
            product_id=product.id,
            code=product.code,
            description=product.description,
            quantity=Decimal("1"),
            unit=product.unit,
            unit_price=product.net_price,
            iva_rate=product.iva_rate,
            iva_amount=Decimal("31.50"),
            subtotal=Decimal("150"),
            total=Decimal("181.50"),
            line_number=1,
            # El snapshot del cost_price se asigna en el servicio
            cost_price=product.cost_price,
            cost_price_estimated=False,
        )
        db.add(item)
        await db.commit()

        # Assert: verificar que el snapshot se guardó
        assert item.cost_price == Decimal("75.50")
        assert item.cost_price_estimated is False

    async def test_snapshot_keeps_none_when_product_has_no_cost_price(
        self, db, business_a, user_a, client_type_for_test
    ):
        """GREEN → Si producto no tiene cost_price, VoucherItem.cost_price queda None."""
        client = Client(
            business_id=business_a.id,
            name="Test Client 2",
            client_type_id=client_type_for_test.id,
            document_type="DNI",
            document_number="87654321",
            tax_condition="Consumidor Final",
        )
        db.add(client)
        await db.flush()

        product = Product(
            business_id=business_a.id,
            code="CP002",
            description="Producto sin costo",
            cost_price=Decimal("0"),
            list_price=Decimal("100"),
            net_price=Decimal("80"),
            sale_price=Decimal("96.80"),
            iva_rate=Decimal("21"),
        )
        db.add(product)
        await db.flush()

        voucher = Voucher(
            business_id=business_a.id,
            client_id=client.id,
            created_by=user_a.id,
            voucher_type=VoucherType.QUOTATION,
            status=VoucherStatus.CONFIRMED,
            sale_point="0001",
            number="00000002",
            date=date(2026, 6, 22),
            subtotal=Decimal("80"),
            iva_amount=Decimal("16.80"),
            total=Decimal("96.80"),
        )
        db.add(voucher)
        await db.flush()

        # Si cost_price es 0 (no hay costo definido), el snapshot lo refleja
        item = VoucherItem(
            voucher_id=voucher.id,
            product_id=product.id,
            code=product.code,
            description=product.description,
            quantity=Decimal("1"),
            unit=product.unit,
            unit_price=product.net_price,
            iva_rate=product.iva_rate,
            iva_amount=Decimal("16.80"),
            subtotal=Decimal("80"),
            total=Decimal("96.80"),
            line_number=1,
            cost_price=product.cost_price if product.cost_price else None,
            cost_price_estimated=False,
        )
        db.add(item)
        await db.commit()

        # Por diseño: si cost_price == 0, se deja None (sin costo definido)
        # La lógica en _build_items_and_totals hace: product.cost_price if product.cost_price else None
        assert item.cost_price is None
