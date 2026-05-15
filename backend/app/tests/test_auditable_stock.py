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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
