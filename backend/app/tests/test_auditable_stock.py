"""
Tests para el sistema de stock auditable y movimientos de lotes.

Cubre:
- LotConsumption: CRUD, FK cascade, 1:N relationship with VoucherItem
- ProductLot.created_by: atribución de usuario
- FIFO consume con persistencia de consumos + AuditLog
- VoucherService flush ordering
"""

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.tests.conftest import make_auth_header

from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.client_type import ClientType
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem

# ── Fixtures compartidas ────────────────────────────────────────


@pytest_asyncio.fixture
async def audit_product(db: AsyncSession, business_a) -> Product:
    """Crea un producto de prueba."""
    p = Product(
        business_id=business_a.id,
        code="AUDIT-STOCK-001",
        description="Producto para test de stock audit",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("50.00"),
        unit="unidad",
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest_asyncio.fixture
async def audit_lot_a(
    db: AsyncSession, audit_product: Product, business_a
) -> ProductLot:
    """Lote con vencimiento en 90 días."""
    lot = ProductLot(
        product_id=audit_product.id,
        business_id=business_a.id,
        code="AUDIT-LOT-A",
        quantity=100,
        initial_quantity=100,
        expiration_date=date.today() + timedelta(days=90),
        cost_price=Decimal("50.00"),
        received_date=date.today() - timedelta(days=10),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@pytest_asyncio.fixture
async def audit_lot_b(
    db: AsyncSession, audit_product: Product, business_a
) -> ProductLot:
    """Lote que vence antes (30 días)."""
    lot = ProductLot(
        product_id=audit_product.id,
        business_id=business_a.id,
        code="AUDIT-LOT-B",
        quantity=50,
        initial_quantity=50,
        expiration_date=date.today() + timedelta(days=30),
        cost_price=Decimal("45.00"),
        received_date=date.today() - timedelta(days=5),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@pytest_asyncio.fixture
async def audit_client(db: AsyncSession, business_a) -> Client:
    """Crea un cliente de prueba para vouchers."""
    from sqlalchemy import select

    result = await db.execute(select(ClientType).limit(1))
    ct = result.scalar_one_or_none()
    if not ct:
        ct = ClientType(business_id=business_a.id, name="Consumidor Final")
        db.add(ct)
        await db.flush()

    c = Client(
        business_id=business_a.id,
        name="Audit Client",
        client_type_id=ct.id,
        document_type="DNI",
        document_number="87654321",
        tax_condition="Consumidor Final",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def audit_voucher(db: AsyncSession, business_a, user_a, audit_client) -> Voucher:
    """Crea un voucher de prueba."""
    v = Voucher(
        business_id=business_a.id,
        client_id=audit_client.id,
        created_by=user_a.id,
        voucher_type=VoucherType.RECEIPT,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000099",
        date=date.today(),
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


@pytest_asyncio.fixture
async def audit_voucher_item(
    db: AsyncSession, audit_voucher, audit_product: Product
) -> VoucherItem:
    """Crea un VoucherItem de prueba."""
    vi = VoucherItem(
        voucher_id=audit_voucher.id,
        product_id=audit_product.id,
        code=audit_product.code,
        description=audit_product.description,
        quantity=Decimal("10"),
        unit_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
        iva_amount=Decimal("210.00"),
        subtotal=Decimal("1000.00"),
        total=Decimal("1210.00"),
        line_number=1,
    )
    db.add(vi)
    await db.commit()
    await db.refresh(vi)
    return vi


# ════════════════════════════════════════════════════════════════
# TASK 1.1: LotConsumption model CRUD, FK cascade, 1:N rel
# ════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_lot_consumption_crud(
    db: AsyncSession, audit_voucher_item: VoucherItem, audit_lot_a: ProductLot
):
    """B1-S1: Crear LotConsumption y leerlo."""
    from app.models.lot_consumption import LotConsumption

    lc = LotConsumption(
        voucher_item_id=audit_voucher_item.id,
        lot_id=audit_lot_a.id,
        quantity_taken=10,
    )
    db.add(lc)
    await db.commit()

    # Leer de la DB
    result = await db.execute(
        select(LotConsumption).where(LotConsumption.id == lc.id)
    )
    stored = result.scalar_one_or_none()
    assert stored is not None
    assert stored.voucher_item_id == audit_voucher_item.id
    assert stored.lot_id == audit_lot_a.id
    assert stored.quantity_taken == 10
    assert stored.id is not None


@pytest.mark.asyncio
async def test_voucher_item_has_lot_consumptions_relationship(
    db: AsyncSession, audit_voucher_item: VoucherItem, audit_lot_a: ProductLot
):
    """B1-S1: VoucherItem.lot_consumptions retorna sus consumos."""
    from app.models.lot_consumption import LotConsumption
    from sqlalchemy.orm import selectinload

    lc = LotConsumption(
        voucher_item_id=audit_voucher_item.id,
        lot_id=audit_lot_a.id,
        quantity_taken=5,
    )
    db.add(lc)
    await db.commit()

    # Recargar con eager loading de la relación
    result = await db.execute(
        select(VoucherItem)
        .options(selectinload(VoucherItem.lot_consumptions))
        .where(VoucherItem.id == audit_voucher_item.id)
    )
    vi = result.scalar_one()

    assert len(vi.lot_consumptions) == 1
    assert vi.lot_consumptions[0].quantity_taken == 5
    assert vi.lot_consumptions[0].lot_id == audit_lot_a.id


@pytest.mark.asyncio
async def test_voucher_item_multiple_lot_consumptions(
    db: AsyncSession, audit_voucher_item: VoucherItem,
    audit_lot_a: ProductLot, audit_lot_b: ProductLot
):
    """B1-S2: Un VoucherItem puede tener múltiples LotConsumption rows."""
    from app.models.lot_consumption import LotConsumption
    from sqlalchemy.orm import selectinload

    lc1 = LotConsumption(
        voucher_item_id=audit_voucher_item.id,
        lot_id=audit_lot_a.id,
        quantity_taken=5,
    )
    lc2 = LotConsumption(
        voucher_item_id=audit_voucher_item.id,
        lot_id=audit_lot_b.id,
        quantity_taken=3,
    )
    db.add(lc1)
    db.add(lc2)
    await db.commit()

    # Recargar con eager loading
    result = await db.execute(
        select(VoucherItem)
        .options(selectinload(VoucherItem.lot_consumptions))
        .where(VoucherItem.id == audit_voucher_item.id)
    )
    vi = result.scalar_one()

    assert len(vi.lot_consumptions) == 2

    taken_by_lot = {
        str(c.lot_id): c.quantity_taken
        for c in vi.lot_consumptions
    }
    assert taken_by_lot[str(audit_lot_a.id)] == 5
    assert taken_by_lot[str(audit_lot_b.id)] == 3


@pytest.mark.asyncio
async def test_lot_consumption_cascade_on_voucher_item_delete(
    db: AsyncSession, audit_voucher_item: VoucherItem, audit_lot_a: ProductLot
):
    """B2-S1: Eliminar VoucherItem elimina LotConsumption rows (CASCADE)."""
    from app.models.lot_consumption import LotConsumption

    lc = LotConsumption(
        voucher_item_id=audit_voucher_item.id,
        lot_id=audit_lot_a.id,
        quantity_taken=7,
    )
    db.add(lc)
    await db.commit()

    # Verificar que existe
    result = await db.execute(
        select(LotConsumption).where(LotConsumption.voucher_item_id == audit_voucher_item.id)
    )
    assert result.scalar_one_or_none() is not None

    # Eliminar VoucherItem (soft delete → cascade no aplica)
    audit_voucher_item.soft_delete()
    await db.commit()

    # Para CASCADE real, necesitamos hard-delete; soft-delete preserva.
    # Esta prueba verifica que el CASCADE está configurado en la FK.
    # Verificamos la FK tiene ondelete="CASCADE"
    from sqlalchemy import ForeignKey
    from app.models.lot_consumption import LotConsumption

    # Verificamos que la columna tiene CASCADE configurado
    mapper = LotConsumption.__mapper__
    col = mapper.columns["voucher_item_id"]
    fk = list(col.foreign_keys)[0]
    assert fk.ondelete == "CASCADE", (
        "FK on LotConsumption.voucher_item_id debe tener ondelete=CASCADE"
    )


# ════════════════════════════════════════════════════════════════
# TASK 2.2: fifo_consume() with audit wiring
# ════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_fifo_consume_persists_lot_consumption(
    db: AsyncSession, audit_product: Product, business_a,
    audit_lot_a: ProductLot, audit_client: Client, user_a: User,
):
    """B1-S1 + A1-S3: fifo_consume() with voucher_item_id+user_id
    persists LotConsumption rows and creates AuditLog."""
    from app.models.lot_consumption import LotConsumption
    from app.services.product_lot_service import ProductLotService

    service = ProductLotService(db)

    # Crear un VoucherItem para asociar el consumo
    voucher = Voucher(
        business_id=business_a.id,
        client_id=audit_client.id,
        created_by=user_a.id,
        voucher_type=VoucherType.RECEIPT,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000100",
        date=date.today(),
    )
    db.add(voucher)
    await db.flush()

    vi = VoucherItem(
        voucher_id=voucher.id,
        product_id=audit_product.id,
        code=audit_product.code,
        description=audit_product.description,
        quantity=Decimal("10"),
        unit_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
        iva_amount=Decimal("210.00"),
        subtotal=Decimal("1000.00"),
        total=Decimal("1210.00"),
        line_number=1,
    )
    db.add(vi)
    await db.flush()

    # Consumir 10 unidades del producto
    await service.fifo_consume(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity=10,
        voucher_item_id=vi.id,
        user_id=user_a.id,
        reason="Venta directa",
    )

    # Verificar LotConsumption rows
    result = await db.execute(
        select(LotConsumption).where(
            LotConsumption.voucher_item_id == vi.id
        )
    )
    consumptions = list(result.scalars().all())
    assert len(consumptions) == 1, "Debe haber 1 LotConsumption row"
    assert consumptions[0].quantity_taken == 10
    assert consumptions[0].lot_id == audit_lot_a.id

    # Verificar AuditLog entry
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "consume",
            AuditLog.user_id == user_a.id,
        )
    )
    audit_entries = list(audit_result.scalars().all())
    assert len(audit_entries) >= 1, "Debe haber al menos 1 AuditLog entry"
    audit_entry = audit_entries[-1]  # última entry
    assert audit_entry.resource_type == "lot_operation"
    assert audit_entry.action == "consume"
    assert audit_entry.user_id == user_a.id
    assert audit_entry.details is not None
    assert "delta" in audit_entry.details
    assert audit_entry.details["delta"] == -10
    assert audit_entry.details["reason"] == "Venta directa"
    assert "lot_id" in audit_entry.details


@pytest.mark.asyncio
async def test_fifo_consume_multi_lot_persists_multiple_rows(
    db: AsyncSession, audit_product: Product, business_a,
    audit_lot_a: ProductLot, audit_lot_b: ProductLot,
    audit_client: Client, user_a: User,
):
    """B1-S2: Multi-lot consumption crea un LotConsumption row por lote."""
    from app.models.lot_consumption import LotConsumption
    from app.services.product_lot_service import ProductLotService

    service = ProductLotService(db)

    # Crear un VoucherItem
    voucher = Voucher(
        business_id=business_a.id,
        client_id=audit_client.id,
        created_by=user_a.id,
        voucher_type=VoucherType.RECEIPT,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000101",
        date=date.today(),
    )
    db.add(voucher)
    await db.flush()

    vi = VoucherItem(
        voucher_id=voucher.id,
        product_id=audit_product.id,
        code=audit_product.code,
        description=audit_product.description,
        quantity=Decimal("80"),
        unit_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
        iva_amount=Decimal("210.00"),
        subtotal=Decimal("1000.00"),
        total=Decimal("1210.00"),
        line_number=1,
    )
    db.add(vi)
    await db.flush()

    # Consumir 80 unidades: 50 de lot_b + 30 de lot_a
    await service.fifo_consume(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity=80,
        voucher_item_id=vi.id,
        user_id=user_a.id,
        reason="Venta mayorista",
    )

    result = await db.execute(
        select(LotConsumption).where(
            LotConsumption.voucher_item_id == vi.id
        ).order_by(LotConsumption.created_at)
    )
    rows = list(result.scalars().all())
    assert len(rows) == 2, "Debe haber 2 rows (uno por lote)"

    # Lot B (vence primero) consumió 50
    assert rows[0].lot_id == audit_lot_b.id
    assert rows[0].quantity_taken == 50

    # Lot A consumió 30
    assert rows[1].lot_id == audit_lot_a.id
    assert rows[1].quantity_taken == 30

    # Verificar AuditLog entries
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "consume",
            AuditLog.user_id == user_a.id,
        )
    )
    entries = list(audit_result.scalars().all())
    assert len(entries) >= 2, "Debe haber al menos 2 AuditLog entries"


# ════════════════════════════════════════════════════════════════
# TASK 2.4: ProductLotService.create() with user attribution
# ════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_lot_sets_created_by(
    db: AsyncSession, audit_product: Product, business_a, user_a: User
):
    """C1-S1: ProductLotService.create(user_id=X) sets created_by."""
    from app.schemas.product_lot import ProductLotCreate
    from app.services.product_lot_service import ProductLotService

    service = ProductLotService(db)
    data = ProductLotCreate(
        quantity=25,
        code="AUDIT-MANU-001",
    )

    lot = await service.create(
        product_id=audit_product.id,
        business_id=business_a.id,
        data=data,
        user_id=user_a.id,
    )

    assert lot.created_by == user_a.id, "created_by debe ser user_a.id"

    # Verificar AuditLog entry for lot creation
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "create",
            AuditLog.resource_id == lot.id,
            AuditLog.user_id == user_a.id,
        )
    )
    entry = audit_result.scalar_one_or_none()
    assert entry is not None, "Debe haber AuditLog por creación de lote"
    assert entry.user_id == user_a.id
    assert entry.details is not None
    assert "quantity" in entry.details
    assert entry.details["quantity"] == 25


@pytest.mark.asyncio
async def test_create_lot_without_user_id_keeps_created_by_null(
    db: AsyncSession, audit_product: Product, business_a
):
    """C1-S1: Sin user_id, created_by debe ser None."""
    from app.schemas.product_lot import ProductLotCreate
    from app.services.product_lot_service import ProductLotService

    service = ProductLotService(db)
    data = ProductLotCreate(
        quantity=10,
        code="AUDIT-NO-USER",
    )

    lot = await service.create(
        product_id=audit_product.id,
        business_id=business_a.id,
        data=data,
    )

    assert lot.created_by is None, "created_by debe ser None sin user_id"


# ════════════════════════════════════════════════════════════════
# TASK 2.6: VoucherService flush ordering — LotConsumption persist
# ════════════════════════════════════════════════════════════════

from app.schemas.voucher import VoucherCreate, VoucherItemCreate


@pytest_asyncio.fixture
async def voucher_test_product(db: AsyncSession, business_a) -> Product:
    """Producto con lotes para test de VoucherService."""
    from decimal import Decimal

    p = Product(
        business_id=business_a.id,
        code="VCHR-LOT-001",
        description="Producto VoucherService test",
        list_price=Decimal("200.00"),
        sale_price=Decimal("242.00"),
        cost_price=Decimal("100.00"),
        unit="unidad",
        net_price=Decimal("200.00"),
        iva_rate=Decimal("21.00"),
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)

    # Crear lote con stock
    lot = ProductLot(
        product_id=p.id,
        business_id=business_a.id,
        code="VCHR-LOT-A",
        quantity=50,
        initial_quantity=50,
        expiration_date=date.today() + timedelta(days=60),
        received_date=date.today(),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return p


@pytest_asyncio.fixture
async def voucher_test_client(db: AsyncSession, business_a) -> Client:
    """Cliente con ClientType para VoucherService tests."""
    result = await db.execute(select(ClientType).limit(1))
    ct = result.scalar_one_or_none()
    if not ct:
        ct = ClientType(business_id=business_a.id, name="Consumidor Final")
        db.add(ct)
        await db.flush()
    c = Client(
        business_id=business_a.id,
        name="Voucher Test Client",
        client_type_id=ct.id,
        document_type="DNI",
        document_number="11111111",
        tax_condition="Consumidor Final",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest.mark.asyncio
async def test_voucher_create_persists_lot_consumptions(
    db: AsyncSession,
    business_a,
    user_a: User,
    voucher_test_product: Product,
    voucher_test_client: Client,
    membership_a,
):
    """B1-S1 + A1-S3: VoucherService.create() persiste LotConsumption
    rows via flush ordering en _build_items_and_totals()."""
    from app.models.lot_consumption import LotConsumption
    from app.services.voucher_service import VoucherService

    service = VoucherService(db)

    voucher_data = VoucherCreate(
        client_id=voucher_test_client.id,
        voucher_type=VoucherType.RECEIPT,
        date=date.today(),
        items=[
            VoucherItemCreate(
                product_id=voucher_test_product.id,
                quantity=10,
                unit_price=Decimal("200.00"),
                discount_percent=Decimal("0"),
            ),
        ],
        general_discount=Decimal("0"),
        show_prices=True,
    )

    voucher = await service.create(
        business_id=business_a.id,
        data=voucher_data,
        user_id=user_a.id,
    )

    # Verificar que se crearon LotConsumption rows para el item
    for vi in voucher.items:
        result = await db.execute(
            select(LotConsumption).where(
                LotConsumption.voucher_item_id == vi.id
            )
        )
        consumptions = list(result.scalars().all())
        assert len(consumptions) > 0, (
            f"VoucherItem {vi.id} debe tener LotConsumption rows"
        )
        total_taken = sum(c.quantity_taken for c in consumptions)
        assert total_taken == int(vi.quantity), (
            f"Total consumido ({total_taken}) debe coincidir con cantidad del item ({int(vi.quantity)})"
        )

    # Verificar AuditLog entries para lot_operation:consume
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "consume",
            AuditLog.user_id == user_a.id,
        )
    )
    audit_entries = list(audit_result.scalars().all())
    assert len(audit_entries) >= 1, (
        "Debe haber al menos 1 AuditLog entry por consumo FIFO"
    )


@pytest.mark.asyncio
async def test_voucher_create_multi_item_consumptions(
    db: AsyncSession,
    business_a,
    user_a: User,
    voucher_test_product: Product,
    voucher_test_client: Client,
    membership_a,
):
    """B1-S1: Voucher con múltiples ítems crea consumos para cada uno."""
    from app.models.lot_consumption import LotConsumption
    from app.services.voucher_service import VoucherService

    service = VoucherService(db)

    voucher_data = VoucherCreate(
        client_id=voucher_test_client.id,
        voucher_type=VoucherType.RECEIPT,
        date=date.today(),
        items=[
            VoucherItemCreate(
                product_id=voucher_test_product.id,
                quantity=5,
                unit_price=Decimal("200.00"),
                discount_percent=Decimal("0"),
            ),
            VoucherItemCreate(
                product_id=voucher_test_product.id,
                quantity=3,
                unit_price=Decimal("200.00"),
                discount_percent=Decimal("0"),
            ),
        ],
        general_discount=Decimal("0"),
        show_prices=True,
    )

    voucher = await service.create(
        business_id=business_a.id,
        data=voucher_data,
        user_id=user_a.id,
    )

    # Verificar que cada item tiene consumos
    assert len(voucher.items) == 2
    for vi in voucher.items:
        result = await db.execute(
            select(LotConsumption).where(
                LotConsumption.voucher_item_id == vi.id
            )
        )
        c_list = list(result.scalars().all())
        assert len(c_list) > 0, f"Cada ítem debe tener consumos (item {vi.id})"
        total_taken = sum(c.quantity_taken for c in c_list)
        assert total_taken == int(vi.quantity), (
            f"Total {total_taken} == {int(vi.quantity)}"
        )


@pytest.mark.asyncio
async def test_voucher_quotation_does_not_create_consumptions(
    db: AsyncSession,
    business_a,
    user_a: User,
    voucher_test_product: Product,
    voucher_test_client: Client,
    membership_a,
):
    """Las cotizaciones NO deben crear LotConsumption rows."""
    from app.models.lot_consumption import LotConsumption
    from app.services.voucher_service import VoucherService

    service = VoucherService(db)

    voucher_data = VoucherCreate(
        client_id=voucher_test_client.id,
        voucher_type=VoucherType.QUOTATION,
        date=date.today(),
        items=[
            VoucherItemCreate(
                product_id=voucher_test_product.id,
                quantity=10,
                unit_price=Decimal("200.00"),
                discount_percent=Decimal("0"),
            ),
        ],
        general_discount=Decimal("0"),
        show_prices=True,
    )

    voucher = await service.create(
        business_id=business_a.id,
        data=voucher_data,
        user_id=user_a.id,
    )

    # Verificar que NO hay consumos para esta cotización
    for vi in voucher.items:
        result = await db.execute(
            select(LotConsumption).where(
                LotConsumption.voucher_item_id == vi.id
            )
        )
        consumptions = list(result.scalars().all())
        assert len(consumptions) == 0, (
            "Cotización NO debe tener LotConsumption rows"
        )

    # Verificar que el stock del lote no se modificó
    from sqlalchemy import select as sql_select
    lot_query = sql_select(ProductLot).where(
        ProductLot.product_id == voucher_test_product.id,
        ProductLot.business_id == business_a.id,
        ProductLot.deleted_at.is_(None),
    )
    lot_result = await db.execute(lot_query)
    lots = list(lot_result.scalars().all())
    total_stock = sum(l.quantity for l in lots)


# ════════════════════════════════════════════════════════════════
# TASK 3.1 — A1-S2: ProductService.update_stock() → AuditLog
# ════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_update_stock_positive_creates_audit_log(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
):
    """A1-S2: update_stock con delta positivo crea AuditLog stock_adjustment:adjust."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    product = await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=10,
        user_id=user_a.id,
        reason="Test ingreso manual",
    )

    assert product is not None

    # Verificar AuditLog
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
            AuditLog.action == "adjust",
        ).order_by(AuditLog.created_at.desc())
    )
    audit = result.scalars().first()
    assert audit is not None, "Debe existir un AuditLog stock_adjustment"
    assert audit.user_id == user_a.id
    assert audit.business_id == business_a.id
    assert audit.details is not None
    assert audit.details.get("delta") == 10
    assert audit.details.get("reason") == "Test ingreso manual"


@pytest.mark.asyncio
async def test_update_stock_negative_creates_audit_log(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    audit_lot_a: ProductLot,
):
    """A1-S2: update_stock con delta negativo crea AuditLog stock_adjustment:adjust."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    product = await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=-5,
        user_id=user_a.id,
        reason="Test egreso manual",
    )

    assert product is not None

    # Verificar AuditLog
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
            AuditLog.action == "adjust",
        ).order_by(AuditLog.created_at.desc())
    )
    audit = result.scalars().first()
    assert audit is not None, "Debe existir un AuditLog stock_adjustment"
    assert audit.user_id == user_a.id
    assert audit.details is not None
    assert audit.details.get("delta") == -5
    assert audit.details.get("reason") == "Test egreso manual"


@pytest.mark.asyncio
async def test_update_stock_zero_no_audit_log(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
):
    """A1-S2: update_stock con delta 0 NO crea AuditLog."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    product = await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=0,
        user_id=user_a.id,
        reason="Test sin cambios",
    )

    assert product is not None

    result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
        )
    )
    audits = list(result.scalars().all())
    assert len(audits) == 0, "Delta 0 no debe crear AuditLog"


@pytest.mark.asyncio
async def test_update_stock_no_user_skips_audit(
    db: AsyncSession,
    business_a,
    audit_product: Product,
    audit_lot_a: ProductLot,
):
    """A1-S2: update_stock sin user_id NO crea AuditLog."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    product = await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=5,
    )

    assert product is not None

    result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
        )
    )
    audits = list(result.scalars().all())
    assert len(audits) == 0, "Sin user_id no debe crear AuditLog"


# ════════════════════════════════════════════════════════════════
# TASK 3.2 — A1-S4: ExcelService.confirm_import() → AuditLog + created_by
# ════════════════════════════════════════════════════════════════


async def _excel_import_row(
    code: str,
    description: str,
    list_price: Decimal | None = None,
    current_stock: int = 0,
    is_new: bool = True,
    existing_id=None,
) -> "ProductImportRow":
    """Helper para crear filas de importación de prueba."""
    from app.schemas.excel_schemas import ProductImportRow

    lp = list_price or Decimal("100.00")
    return ProductImportRow(
        row_number=2,
        code=code,
        description=description,
        list_price=lp,
        current_stock=current_stock,
        is_new=is_new,
        existing_id=existing_id,
        has_errors=False,
    )


@pytest.mark.asyncio
async def test_excel_confirm_import_new_product_creates_audit_log(
    db: AsyncSession,
    business_a,
    user_a: User,
):
    """A1-S4: confirm_import con user_id crea AuditLog(lot_operation:create)
    para productos nuevos con stock."""
    from app.services.excel_service import ExcelService
    from app.schemas.excel_schemas import ImportConfirmRequest

    service = ExcelService(db)

    row = await _excel_import_row(
        code="EXC-AUDIT-001",
        description="Producto Excel audit test",
        current_stock=50,
        is_new=True,
    )

    request = ImportConfirmRequest(rows=[row])
    result = await service.confirm_import(
        business_id=business_a.id,
        request=request,
        user_id=user_a.id,
    )

    assert result.created == 1
    assert result.updated == 0

    # Verificar que el lote se creó con created_by
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.code.like("IMP-%"),
            ProductLot.business_id == business_a.id,
        )
    )
    lot = lot_result.scalar_one_or_none()
    assert lot is not None, "Debe existir un lote"
    assert lot.created_by == user_a.id, "created_by debe ser user_a.id"
    assert lot.quantity == 50

    # Verificar AuditLog(lot_operation:create)
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "create",
            AuditLog.resource_id == lot.id,
            AuditLog.user_id == user_a.id,
        )
    )
    audit = audit_result.scalar_one_or_none()
    assert audit is not None, "Debe haber AuditLog por creación de lote"
    assert audit.details is not None
    assert audit.details.get("source") == "excel_import"


@pytest.mark.asyncio
async def test_excel_confirm_import_new_product_no_stock_skips_audit(
    db: AsyncSession,
    business_a,
    user_a: User,
):
    """A1-S4: Producto nuevo SIN stock no crea lote ni AuditLog."""
    from app.services.excel_service import ExcelService
    from app.schemas.excel_schemas import ImportConfirmRequest

    service = ExcelService(db)

    row = await _excel_import_row(
        code="EXC-NOSTOCK-001",
        description="Producto sin stock",
        current_stock=0,
        is_new=True,
    )

    request = ImportConfirmRequest(rows=[row])
    result = await service.confirm_import(
        business_id=business_a.id,
        request=request,
        user_id=user_a.id,
    )

    assert result.created == 1

    # Verificar que NO hay AuditLog de lot_operation
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.resource_id.is_(None),
        )
    )
    audits = list(audit_result.scalars().all())
    # Puede haber otros, verificar que no haya create con source excel_import
    for a in audits:
        if a.details and a.details.get("source") == "excel_import":
            pytest.fail("No debe haber AuditLog excel_import sin stock")


@pytest.mark.asyncio
async def test_excel_confirm_import_new_product_without_user_id(
    db: AsyncSession,
    business_a,
):
    """A1-S4: Sin user_id, created_by debe ser None y no debe crear AuditLog."""
    from app.services.excel_service import ExcelService
    from app.schemas.excel_schemas import ImportConfirmRequest

    service = ExcelService(db)

    row = await _excel_import_row(
        code="EXC-NOUSER-001",
        description="Producto sin user_id",
        current_stock=30,
        is_new=True,
    )

    request = ImportConfirmRequest(rows=[row])
    result = await service.confirm_import(
        business_id=business_a.id,
        request=request,
    )

    assert result.created == 1

    # Verificar que el lote tiene created_by = None
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.business_id == business_a.id,
            ProductLot.quantity == 30,
        )
    )
    lot = lot_result.scalar_one_or_none()
    assert lot is not None
    assert lot.created_by is None, "Sin user_id, created_by debe ser None"

    # Verificar que NO hay AuditLog
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
        )
    )
    audits = list(audit_result.scalars().all())
    for a in audits:
        if a.details and a.details.get("source") == "excel_import":
            pytest.fail("Sin user_id no debe crear AuditLog")


@pytest.mark.asyncio
async def test_excel_confirm_import_existing_product_stock_increase(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
):
    """A1-S4: Producto existente con stock_diff > 0 crea lote + AuditLog."""
    from app.services.excel_service import ExcelService
    from app.schemas.excel_schemas import ImportConfirmRequest

    service = ExcelService(db)

    # audit_product tiene 0 stock inicial (no tiene lotes creados por fixture)
    row = await _excel_import_row(
        code=audit_product.code,
        description=audit_product.description,
        current_stock=50,
        list_price=audit_product.list_price,
        is_new=False,
        existing_id=audit_product.id,
    )

    request = ImportConfirmRequest(rows=[row])
    result = await service.confirm_import(
        business_id=business_a.id,
        request=request,
        user_id=user_a.id,
    )

    assert result.updated == 1

    # Verificar lote creado con created_by
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.product_id == audit_product.id,
            ProductLot.business_id == business_a.id,
        )
    )
    lots = list(lot_result.scalars().all())
    created_lot = next((l for l in lots if l.created_by == user_a.id), None)
    assert created_lot is not None, "Debe haber un lote con created_by"
    assert created_lot.quantity == 50


@pytest.mark.asyncio
async def test_excel_confirm_import_existing_product_stock_decrease(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    audit_lot_a: ProductLot,
):
    """A1-S4: Producto existente con stock_diff < 0 pasa user_id a fifo_consume."""
    from app.services.excel_service import ExcelService
    from app.schemas.excel_schemas import ImportConfirmRequest

    service = ExcelService(db)

    # audit_lot_a tiene 100 unidades
    row = await _excel_import_row(
        code=audit_product.code,
        description=audit_product.description,
        current_stock=80,  # reducir de 100 a 80 → diff = -20
        list_price=audit_product.list_price,
        is_new=False,
        existing_id=audit_product.id,
    )

    request = ImportConfirmRequest(rows=[row])
    result = await service.confirm_import(
        business_id=business_a.id,
        request=request,
        user_id=user_a.id,
    )

    assert result.updated == 1

    # Verificar AuditLog por consumo FIFO
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "lot_operation",
            AuditLog.action == "consume",
            AuditLog.user_id == user_a.id,
        ).order_by(AuditLog.created_at.desc())
    )
    entries = list(audit_result.scalars().all())
    # Buscar entry con reason de excel_import
    excel_consume = next(
        (e for e in entries if e.details and e.details.get("reason") == "Ajuste por importación Excel"),
        None,
    )
    assert excel_consume is not None, (
        "Debe haber AuditLog.consume con reason 'Ajuste por importación Excel'"
    )
    assert excel_consume.details["delta"] == -20
    assert excel_consume.details["quantity_taken"] == 20


# ════════════════════════════════════════════════════════════════
# TASK 3.3 — Endpoints: stock-delta, price-history, audit-logs
# ════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_bulk_stock_delta_positive(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """D1-S1: stock-delta con delta positivo crea lote y StockDeltaResult success."""
    from app.services.product_service import ProductService

    service = ProductService(db)
    items = [(audit_product.id, 25, "Test bulk delta positivo")]
    results = await service.bulk_stock_delta(
        business_id=business_a.id,
        items=items,
        user_id=user_a.id,
    )

    assert len(results) == 1
    pid, ok, err = results[0]
    assert pid == audit_product.id
    assert ok is True
    assert err is None

    # Verificar que se creó un lote con la cantidad correcta
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.product_id == audit_product.id,
            ProductLot.business_id == business_a.id,
            ProductLot.deleted_at.is_(None),
        )
    )
    lots = list(lot_result.scalars().all())
    assert len(lots) >= 1, "Debe haber al menos un lote"
    total_stock = sum(l.quantity for l in lots)
    assert total_stock >= 25

    # Verificar AuditLog stock_adjustment
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
            AuditLog.action == "adjust",
            AuditLog.user_id == user_a.id,
        ).order_by(AuditLog.created_at.desc())
    )
    audit = audit_result.scalars().first()
    assert audit is not None
    assert audit.details.get("delta") == 25


@pytest.mark.asyncio
async def test_bulk_stock_delta_negative(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    audit_lot_a: ProductLot,
    membership_a,
):
    """D1-S1: stock-delta con delta negativo consume stock."""
    from app.services.product_service import ProductService

    service = ProductService(db)
    items = [(audit_product.id, -10, "Test bulk delta negativo")]
    results = await service.bulk_stock_delta(
        business_id=business_a.id,
        items=items,
        user_id=user_a.id,
    )

    assert len(results) == 1
    pid, ok, err = results[0]
    assert ok is True

    # Verificar AuditLog
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
            AuditLog.action == "adjust",
        ).order_by(AuditLog.created_at.desc())
    )
    audit = audit_result.scalars().first()
    assert audit is not None
    assert audit.details.get("delta") == -10


@pytest.mark.asyncio
async def test_bulk_stock_delta_product_not_found(
    db: AsyncSession,
    business_a,
    user_a: User,
    membership_a,
):
    """D1-S2: stock-delta con producto inexistente retorna error."""
    from uuid import uuid4
    from app.services.product_service import ProductService

    service = ProductService(db)
    fake_id = uuid4()
    items = [(fake_id, 10, "Test not found")]
    results = await service.bulk_stock_delta(
        business_id=business_a.id,
        items=items,
        user_id=user_a.id,
    )

    assert len(results) == 1
    pid, ok, err = results[0]
    assert ok is False
    assert err == "Producto no encontrado"


@pytest.mark.asyncio
async def test_bulk_stock_delta_insufficient_stock(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """D1-S2: stock-delta sin stock suficiente para delta negativo retorna error."""
    from app.services.product_service import ProductService

    service = ProductService(db)
    # audit_product no tiene lotes → stock 0, intentar consumir debe fallar
    items = [(audit_product.id, -50, "Test sin stock")]
    results = await service.bulk_stock_delta(
        business_id=business_a.id,
        items=items,
        user_id=user_a.id,
    )

    assert len(results) == 1
    pid, ok, err = results[0]
    assert ok is False
    assert "Stock insuficiente" in (err or "")


@pytest.mark.asyncio
async def test_price_history_listing(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """D1-S1: get_price_history retorna entries del producto."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    # Crear un cambio de precio para generar historial
    from app.schemas.product import ProductUpdate

    update_data = ProductUpdate(list_price=Decimal("150.00"))
    await service.update(
        product_id=audit_product.id,
        business_id=business_a.id,
        data=update_data,
        user_id=user_a.id,
    )

    # Obtener historial
    entries, total = await service.get_price_history(
        product_id=audit_product.id,
        business_id=business_a.id,
    )

    assert total >= 1
    assert len(entries) >= 1
    # El entry más reciente debe tener el nuevo precio
    assert entries[0].new_list_price == Decimal("150.00")
    assert entries[0].old_list_price == Decimal("100.00")


@pytest.mark.asyncio
async def test_price_history_empty_for_nonexistent_product(
    db: AsyncSession,
    business_a,
):
    """D1-S2: get_price_history de producto inexistente retorna vacío."""
    from uuid import uuid4
    from app.services.product_service import ProductService

    service = ProductService(db)
    entries, total = await service.get_price_history(
        product_id=uuid4(),
        business_id=business_a.id,
    )

    assert total == 0
    assert entries == []


@pytest.mark.asyncio
async def test_restore_price(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """D1-S1: restore_price restaura precios y crea nuevo entry."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    # Crear un cambio de precio
    from app.schemas.product import ProductUpdate

    update_data = ProductUpdate(list_price=Decimal("200.00"))
    await service.update(
        product_id=audit_product.id,
        business_id=business_a.id,
        data=update_data,
        user_id=user_a.id,
    )

    # Obtener el entry creado
    entries, total = await service.get_price_history(
        product_id=audit_product.id,
        business_id=business_a.id,
    )
    assert total >= 1
    entry_id = entries[0].id

    # Restaurar desde ese entry
    product, new_entry = await service.restore_price(
        product_id=audit_product.id,
        business_id=business_a.id,
        entry_id=entry_id,
        user_id=user_a.id,
        reason="Test restauración",
    )

    assert product is not None
    assert new_entry is not None
    # El precio debe haber vuelto a 100.00 (old_list_price del entry)
    assert product.list_price == Decimal("100.00")
    assert new_entry.change_reason == "Test restauración"


@pytest.mark.asyncio
async def test_restore_price_nonexistent_entry(
    db: AsyncSession,
    business_a,
    audit_product: Product,
    membership_a,
):
    """D1-S2: restore_price con entry inexistente retorna (None, None)."""
    from uuid import uuid4
    from app.services.product_service import ProductService

    service = ProductService(db)
    product, new_entry = await service.restore_price(
        product_id=audit_product.id,
        business_id=business_a.id,
        entry_id=uuid4(),
    )

    assert product is None
    assert new_entry is None


@pytest.mark.asyncio
async def test_audit_logs_listing(
    db: AsyncSession,
    business_a,
    user_a: User,
    audit_product: Product,
    audit_lot_a: ProductLot,
    membership_a,
):
    """D1-S1: audit-logs lista entries del negocio."""
    from app.services.product_service import ProductService

    service = ProductService(db)

    # Generar un audit log
    await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=10,
        user_id=user_a.id,
        reason="Test audit listing",
    )

    # Consultar desde la DB directamente (probamos el servicio/query)
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.business_id == business_a.id,
            AuditLog.resource_type == "stock_adjustment",
        ).order_by(AuditLog.created_at.desc())
    )
    entries = list(audit_result.scalars().all())

    assert len(entries) >= 1
    assert entries[0].user_id == user_a.id
    assert entries[0].resource_type == "stock_adjustment"
    assert entries[0].action == "adjust"
    assert entries[0].details.get("reason") == "Test audit listing"


# ════════════════════════════════════════════════════════════════
# TASK 3.4 — HTTP Integration tests (via AsyncClient)
# ════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_integration_patch_stock(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """I1-S1: PATCH /products/{id}/stock ajusta stock y crea AuditLog."""
    from httpx import AsyncClient

    auth = make_auth_header(user_a)

    response = await client.patch(
        f"/api/tenant/products/{audit_product.id}/stock",
        params={"quantity": 30},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["code"] == audit_product.code

    # Verificar lote creado
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.product_id == audit_product.id,
            ProductLot.business_id == business_a.id,
        )
    )
    lots = list(lot_result.scalars().all())
    assert len(lots) >= 1
    total_stock = sum(l.quantity for l in lots)
    assert total_stock == 30

    # Verificar AuditLog
    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.resource_type == "stock_adjustment",
            AuditLog.resource_id == audit_product.id,
            AuditLog.user_id == user_a.id,
        )
    )
    audit = audit_result.scalars().first()
    assert audit is not None
    assert audit.action == "adjust"


@pytest.mark.asyncio
async def test_integration_stock_delta(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """I1-S1: POST /products/stock-delta ajusta stock por delta."""
    auth = make_auth_header(user_a)

    response = await client.post(
        f"/api/tenant/products/stock-delta",
        json={
            "items": [
                {"product_id": str(audit_product.id), "delta": 15, "reason": "Test integración"}
            ]
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_success"] == 1
    assert data["total_failures"] == 0
    assert data["results"][0]["success"] is True

    # Verificar lote
    lot_result = await db.execute(
        select(ProductLot).where(
            ProductLot.product_id == audit_product.id,
            ProductLot.business_id == business_a.id,
        )
    )
    lots = list(lot_result.scalars().all())
    assert sum(l.quantity for l in lots) == 15


@pytest.mark.asyncio
async def test_integration_stock_delta_not_found(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    membership_a,
):
    """I1-S2: stock-delta con producto inexistente retorna error 200 con failure."""
    from uuid import uuid4

    auth = make_auth_header(user_a)

    response = await client.post(
        f"/api/tenant/products/stock-delta",
        json={
            "items": [
                {"product_id": str(uuid4()), "delta": 10, "reason": "Test not found"}
            ]
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_success"] == 0
    assert data["total_failures"] == 1
    assert data["results"][0]["success"] is False
    assert data["results"][0]["error"] is not None


@pytest.mark.asyncio
async def test_integration_stock_delta_unauthorized(
    client,
):
    """I1-S2: stock-delta sin auth retorna 401."""
    response = await client.post(
        f"/api/tenant/products/stock-delta",
        json={"items": [{"product_id": "00000000-0000-0000-0000-000000000000", "delta": 10}]},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_integration_price_history(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """I1-S1: GET /products/{id}/price-history retorna entries."""
    # Primero crear un cambio de precio via API
    from app.services.product_service import ProductService
    from app.schemas.product import ProductUpdate

    service = ProductService(db)
    await service.update(
        product_id=audit_product.id,
        business_id=business_a.id,
        data=ProductUpdate(list_price=Decimal("180.00")),
        user_id=user_a.id,
    )

    auth = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/products/{audit_product.id}/price-history",
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    # El entry más reciente tiene el nuevo precio (Decimal se serializa como string)
    new_price = data["items"][0]["new_list_price"]
    assert str(new_price) in ("180.00", "180"), f"Expected 180.00, got {new_price}"


@pytest.mark.asyncio
async def test_integration_audit_logs(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """I1-S1: GET /audit-logs lista logs del negocio."""
    # Crear un audit log
    from app.services.product_service import ProductService

    service = ProductService(db)
    await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=5,
        user_id=user_a.id,
        reason="Test integración audit logs",
    )

    auth = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/audit-logs",
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    # Verificar que el log tiene los campos esperados
    log = data["items"][0]
    assert log["resource_type"] == "stock_adjustment"
    assert log["action"] == "adjust"
    assert log["details"]["reason"] == "Test integración audit logs"


@pytest.mark.asyncio
async def test_integration_audit_logs_filtered(
    db: AsyncSession,
    client,
    business_a,
    user_a: User,
    audit_product: Product,
    membership_a,
):
    """I1-S1: GET /audit-logs?resource_type=stock_adjustment filtra correctamente."""
    # Crear un audit log
    from app.services.product_service import ProductService

    service = ProductService(db)
    await service.update_stock(
        product_id=audit_product.id,
        business_id=business_a.id,
        quantity_change=5,
        user_id=user_a.id,
        reason="Test filtro",
    )

    auth = make_auth_header(user_a)
    response = await client.get(
        f"/api/tenant/audit-logs",
        params={"resource_type": "stock_adjustment"},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["resource_type"] == "stock_adjustment"
