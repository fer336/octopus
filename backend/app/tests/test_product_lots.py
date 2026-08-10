"""
Tests para el sistema de Lotes de Producto (Product Lots).

Cubre:
- ProductLotService: create, list_by_product, fifo_consume
- FIFO: lote único, múltiples lotes, stock insuficiente, orden por vencimiento, NULLS LAST
- Integración VoucherService: crear remito descuenta lote, anular restaura stock
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.payment_method import PaymentMethodCatalog
from app.models.cash_register import CashRegister, CashRegisterStatus
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.models.client import Client
from app.models.business import Business
from app.models.user import User
from app.schemas.product_lot import ProductLotCreate
from app.services.product_lot_service import ProductLotService
from app.services.voucher_service import VoucherService
from app.tests.conftest import make_auth_header

import pytest_asyncio


# ── Fixtures ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def product(db: AsyncSession, business_a: Business) -> Product:
    """Crea un producto de prueba."""
    p = Product(
        business_id=business_a.id,
        code="TEST-LOT-001",
        description="Producto para test de lotes",
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
async def client_for_voucher(
    db: AsyncSession, business_a: Business
) -> Client:
    """Crea un cliente de prueba para vouchers."""
    c = Client(
        business_id=business_a.id,
        name="Cliente Test Lotes",
        client_type_id=None,
        document_type="DNI",
        document_number="12345678",
        tax_condition="Consumidor Final",
    )
    # client_type_id puede ser None si la columna permite NULL,
    # pero SQLite lanza NOT NULL constraint. Buscar un tipo existente.
    from app.models.client_type import ClientType
    result = await db.execute(select(ClientType).limit(1))
    existing_type = result.scalar_one_or_none()
    if existing_type:
        c.client_type_id = existing_type.id
    elif business_a.id:
        # Crear un tipo por defecto
        ct = ClientType(
            business_id=business_a.id,
            name="Consumidor Final",
        )
        db.add(ct)
        await db.commit()
        c.client_type_id = ct.id

    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def lot_a(
    db: AsyncSession, product: Product, business_a: Business
) -> ProductLot:
    """Lote que vence en 90 días."""
    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        code="LOTE-A",
        quantity=50,
        initial_quantity=50,
        expiration_date=date.today() + timedelta(days=90),
        cost_price=Decimal("50.00"),
        received_date=date.today() - timedelta(days=30),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@pytest_asyncio.fixture
async def lot_b(
    db: AsyncSession, product: Product, business_a: Business
) -> ProductLot:
    """Lote que vence en 30 días (vence antes que A)."""
    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        code="LOTE-B",
        quantity=30,
        initial_quantity=30,
        expiration_date=date.today() + timedelta(days=30),
        cost_price=Decimal("45.00"),
        received_date=date.today() - timedelta(days=15),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@pytest_asyncio.fixture
async def lot_c_no_expiry(
    db: AsyncSession, product: Product, business_a: Business
) -> ProductLot:
    """Lote sin vencimiento (NULL expiration_date)."""
    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        code="LOTE-C-NO-EXP",
        quantity=20,
        initial_quantity=20,
        expiration_date=None,
        cost_price=Decimal("40.00"),
        received_date=date.today() - timedelta(days=5),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


# ── Tests Unitarios: ProductLotService ───────────────────────────

@pytest.mark.asyncio
async def test_create_lot(db: AsyncSession, product: Product, business_a: Business):
    """Crear un lote y verificar quantity e initial_quantity."""
    service = ProductLotService(db)
    data = ProductLotCreate(
        quantity=100,
        expiration_date=date.today() + timedelta(days=365),
        cost_price=Decimal("75.50"),
        code="LOTE-MANU-001",
    )
    lot = await service.create(product.id, business_a.id, data)

    assert lot.id is not None
    assert lot.product_id == product.id
    assert lot.business_id == business_a.id
    assert lot.quantity == 100
    assert lot.initial_quantity == 100  # default = quantity
    assert lot.code == "LOTE-MANU-001"
    assert lot.cost_price == Decimal("75.50")
    assert lot.expiration_date == date.today() + timedelta(days=365)
    assert lot.received_date == date.today()


@pytest.mark.asyncio
async def test_create_lot_with_initial_quantity(
    db: AsyncSession, product: Product, business_a: Business
):
    """Crear lote con initial_quantity explícito."""
    service = ProductLotService(db)
    data = ProductLotCreate(
        quantity=10,
        initial_quantity=50,
    )
    lot = await service.create(product.id, business_a.id, data)

    assert lot.quantity == 10
    assert lot.initial_quantity == 50


@pytest.mark.asyncio
async def test_list_lots_by_product(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot
):
    """Listar lotes de un producto."""
    service = ProductLotService(db)
    lots = await service.list_by_product(product.id, business_a.id)

    assert len(lots) >= 1
    lot_ids = [str(lot.id) for lot in lots]
    assert str(lot_a.id) in lot_ids


@pytest.mark.asyncio
async def test_list_lots_returns_all_active_lots(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot, lot_b: ProductLot
):
    """Listar retorna todos los lotes activos."""
    service = ProductLotService(db)
    lots = await service.list_by_product(product.id, business_a.id)

    assert len(lots) >= 2
    lot_ids = [str(lot.id) for lot in lots]
    assert str(lot_a.id) in lot_ids
    assert str(lot_b.id) in lot_ids


@pytest.mark.asyncio
async def test_fifo_consume_single_lot(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot
):
    """FIFO consume de un solo lote."""
    service = ProductLotService(db)
    last_lot_id, consumptions = await service.fifo_consume(
        product.id, business_a.id, 10
    )

    assert len(consumptions) == 1
    assert consumptions[0]["taken"] == 10
    assert str(consumptions[0]["lot_id"]) == str(lot_a.id)
    assert str(last_lot_id) == str(lot_a.id)

    # Verificar que el lote se descontó
    await db.refresh(lot_a)
    assert lot_a.quantity == 40


@pytest.mark.asyncio
async def test_fifo_consume_multiple_lots(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot, lot_b: ProductLot
):
    """FIFO cruza múltiples lotes, consumiendo del que vence primero."""
    service = ProductLotService(db)

    # Consumir 60 unidades: 30 del lote B (vence antes) + 30 del lote A
    last_lot_id, consumptions = await service.fifo_consume(
        product.id, business_a.id, 60
    )

    # Debería consumir: 30 de lot_b, 30 de lot_a
    assert len(consumptions) == 2

    # Primer consumo: lot_b (vence en 30d)
    assert consumptions[0]["taken"] == 30
    assert str(consumptions[0]["lot_id"]) == str(lot_b.id)

    # Segundo consumo: lot_a (vence en 90d)
    assert consumptions[1]["taken"] == 30
    assert str(consumptions[1]["lot_id"]) == str(lot_a.id)

    # last_lot_id es el último lote consumido
    assert str(last_lot_id) == str(lot_a.id)

    # Verificar stocks
    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0
    assert lot_a.quantity == 20


@pytest.mark.asyncio
async def test_fifo_consume_insufficient_stock(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot
):
    """FIFO lanza error si no hay stock suficiente."""
    service = ProductLotService(db)

    with pytest.raises(ValueError, match="Stock insuficiente"):
        await service.fifo_consume(product.id, business_a.id, 999)


@pytest.mark.asyncio
async def test_fifo_order_by_expiration(
    db: AsyncSession, product: Product, business_a: Business, lot_a: ProductLot, lot_b: ProductLot
):
    """FIFO consume primero el lote que vence antes."""
    service = ProductLotService(db)

    # Consumir solo 20 unidades — debe tomar del lote B (vence en 30d)
    last_lot_id, consumptions = await service.fifo_consume(
        product.id, business_a.id, 20
    )

    assert len(consumptions) == 1
    assert str(consumptions[0]["lot_id"]) == str(lot_b.id)

    await db.refresh(lot_b)
    assert lot_b.quantity == 10  # 30 - 20


@pytest.mark.asyncio
async def test_fifo_nulls_last(
    db: AsyncSession, product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot, lot_c_no_expiry: ProductLot,
):
    """FIFO consume lotes sin vencimiento (NULL) después de los que tienen fecha."""
    service = ProductLotService(db)

    # Primero agotar lot_a y lot_b:
    # lot_b = 30, lot_a = 50, lot_c = 20. Total = 100.
    # Consumir 85: debería tomar 30 de lot_b + 50 de lot_a + 5 de lot_c
    last_lot_id, consumptions = await service.fifo_consume(
        product.id, business_a.id, 85
    )

    assert len(consumptions) == 3

    # Primer consumo: lot_b (vence en 30d)
    assert consumptions[0]["taken"] == 30
    assert str(consumptions[0]["lot_id"]) == str(lot_b.id)

    # Segundo consumo: lot_a (vence en 90d)
    assert consumptions[1]["taken"] == 50
    assert str(consumptions[1]["lot_id"]) == str(lot_a.id)

    # Tercer consumo: lot_c (NULL expiration — se consume al final)
    assert consumptions[2]["taken"] == 5
    assert str(consumptions[2]["lot_id"]) == str(lot_c_no_expiry.id)

    # Verificar lot_c se descontó correctamente
    await db.refresh(lot_c_no_expiry)
    assert lot_c_no_expiry.quantity == 15


@pytest.mark.asyncio
async def test_fifo_consume_zero_quantity_raises_error(
    db: AsyncSession, product: Product, business_a: Business,
):
    """FIFO rechaza cantidad 0 o negativa."""
    service = ProductLotService(db)

    with pytest.raises(ValueError, match="positiva"):
        await service.fifo_consume(product.id, business_a.id, 0)

    with pytest.raises(ValueError, match="positiva"):
        await service.fifo_consume(product.id, business_a.id, -5)


@pytest.mark.asyncio
async def test_get_total_stock(
    db: AsyncSession, product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
):
    """get_total_stock suma correctamente las cantidades."""
    service = ProductLotService(db)

    total = await service.get_total_stock(product.id, business_a.id)
    assert total == 80  # 50 + 30


# ── Tests de Integración: VoucherService ─────────────────────────

@pytest.mark.asyncio
async def test_voucher_creates_lot_deduction(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Crear un remito descuenta stock del lote correcto (FIFO)."""
    headers = make_auth_header(user_a)

    today = str(date.today())

    # Crear remito con 20 unidades del producto
    # FIFO debe consumir del lote B (vence antes): 20 unidades
    response = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 20,
                    "unit_price": 100.00,
                }
            ],
        },
    )

    assert response.status_code in (200, 201), f"Error: {response.text}"
    data = response.json()

    # Verificar que el voucher se creó
    assert data["voucher_type"] == "receipt"
    assert len(data["items"]) == 1

    # Verificar que el item tiene product_lot_id asignado
    item = data["items"][0]
    assert item["product_id"] == str(product.id)
    assert item["product_lot_id"] is not None, (
        "El item debe tener un product_lot_id asignado"
    )

    # Verificar que el lote B se descontó (FIFO: vence antes)
    await db.refresh(lot_b)
    assert lot_b.quantity == 10, "El lote B debería tener 10 unidades restantes"

    # Verificar que el lote A no se tocó
    await db.refresh(lot_a)
    assert lot_a.quantity == 50, "El lote A no debería haber sido afectado"

    # El product_lot_id del item debe ser el del lote B
    assert item["product_lot_id"] == str(lot_b.id)


@pytest.mark.asyncio
async def test_voucher_creates_lot_deduction_crosses_lots(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Crear un remito que consume de múltiples lotes (FIFO cruza)."""
    headers = make_auth_header(user_a)
    today = str(date.today())

    # Crear remito con 60 unidades: 30 del lote B + 30 del lote A
    response = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 60,
                    "unit_price": 100.00,
                }
            ],
        },
    )

    assert response.status_code in (200, 201), f"Error: {response.text}"
    data = response.json()

    # Verificar stocks
    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0, "Lote B debería estar vacío"
    assert lot_a.quantity == 20, "Lote A debería tener 20 restantes"

    # product_lot_id debe ser el del último lote consumido (lot_a)
    item = data["items"][0]
    assert item["product_lot_id"] == str(lot_a.id)


@pytest.mark.asyncio
async def test_voucher_reverts_lot(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Anular un comprobante (soft delete) solo afecta registros, NO revierte stock.

    En la lógica actual del sistema, soft_delete de un remito normal no devuelve
    la mercadería al lote (los bienes ya salieron físicamente). La reversión de
    stock solo ocurre para devoluciones explícitas (is_return_receipt).
    """
    headers = make_auth_header(user_a)
    today = str(date.today())

    # Crear remito
    create_resp = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 20,
                    "unit_price": 100.00,
                }
            ],
        },
    )
    assert create_resp.status_code in (200, 201)
    voucher_id = create_resp.json()["id"]

    # Verificar stock antes de anular
    await db.refresh(lot_b)
    assert lot_b.quantity == 10  # 30 - 20

    # Anular el comprobante
    delete_resp = await client.delete(
        f"/api/tenant/vouchers/{voucher_id}/delete?reason=test",
        headers=headers,
    )
    assert delete_resp.status_code == 200

    # Soft delete NO revierte stock para remitos comunes
    await db.refresh(lot_b)
    assert lot_b.quantity == 10, (
        "Soft delete de remito NO debe revertir stock. "
        f"Esperado: 10, actual: {lot_b.quantity}"
    )

    # El comprobante queda marcado como eliminado
    from uuid import UUID
    from sqlalchemy import select
    result = await db.execute(select(Voucher).where(Voucher.id == UUID(voucher_id)))
    deleted_voucher = result.scalar_one()
    assert deleted_voucher.deleted_at is not None
    assert deleted_voucher.deletion_reason == "test"


@pytest.mark.asyncio
async def test_cancel_receipt_restores_consumed_lots_without_soft_delete(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Anular un remito normal restaura cada lote consumido y conserva historial."""
    headers = make_auth_header(user_a)
    today = str(date.today())

    create_resp = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 60,
                    "unit_price": 100.00,
                }
            ],
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    voucher_id = create_resp.json()["id"]

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0
    assert lot_a.quantity == 20

    cancel_resp = await client.post(
        f"/api/tenant/vouchers/{voucher_id}/cancel?reason=error%20de%20carga",
        headers=headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    assert cancel_resp.json()["status"] == VoucherStatus.CANCELLED.value

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 30
    assert lot_a.quantity == 50

    from uuid import UUID
    result = await db.execute(select(Voucher).where(Voucher.id == UUID(voucher_id)))
    cancelled_voucher = result.scalar_one()
    assert cancelled_voucher.status == VoucherStatus.CANCELLED
    assert cancelled_voucher.deleted_at is None


@pytest.mark.asyncio
async def test_cancel_invoiced_receipt_rejected_keeps_lots_consumed(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """No se puede anular un remito normal que ya quedó vinculado a una factura."""
    headers = make_auth_header(user_a)
    today = str(date.today())

    create_resp = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 60,
                    "unit_price": 100.00,
                }
            ],
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    voucher_id = create_resp.json()["id"]

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0
    assert lot_a.quantity == 20

    invoice = Voucher(
        business_id=business_a.id,
        client_id=client_for_voucher.id,
        created_by=user_a.id,
        voucher_type=VoucherType.INVOICE_B,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="99999999",
        date=date.today(),
        subtotal=Decimal("6000.00"),
        iva_amount=Decimal("1260.00"),
        total=Decimal("7260.00"),
    )
    db.add(invoice)
    await db.flush()

    from uuid import UUID
    receipt = await db.get(Voucher, UUID(voucher_id))
    receipt.invoiced_voucher_id = invoice.id
    await db.commit()

    cancel_resp = await client.post(
        f"/api/tenant/vouchers/{voucher_id}/cancel?reason=error%20de%20carga",
        headers=headers,
    )
    assert cancel_resp.status_code == 400, cancel_resp.text
    assert cancel_resp.json()["detail"] == "No se puede anular un remito ya facturado"

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0
    assert lot_a.quantity == 20


@pytest.mark.asyncio
async def test_cancel_invoice_x_restores_consumed_lots_without_soft_delete(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot, lot_b: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Anular Comprobante X restaura lotes y conserva el comprobante visible."""
    business_a.srx_enabled = True
    payment_method = PaymentMethodCatalog(
        business_id=business_a.id,
        name="Efectivo",
        code="CASH",
        is_active=True,
        requires_reference=False,
    )
    cash_register = CashRegister(
        business_id=business_a.id,
        opened_by=user_a.id,
        status=CashRegisterStatus.OPEN,
        opening_amount=Decimal("0"),
        opened_at=datetime.utcnow(),
    )
    db.add(payment_method)
    db.add(cash_register)
    await db.commit()
    await db.refresh(payment_method)

    headers = make_auth_header(user_a)
    today = str(date.today())

    create_resp = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "invoice_x",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 60,
                    "unit_price": 100.00,
                }
            ],
            "payments": [
                {
                    "payment_method_id": str(payment_method.id),
                    "amount": 7260.00,
                }
            ],
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    voucher_id = create_resp.json()["id"]

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 0
    assert lot_a.quantity == 20

    cancel_resp = await client.post(
        f"/api/tenant/vouchers/{voucher_id}/cancel?reason=error%20de%20carga",
        headers=headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    assert cancel_resp.json()["status"] == VoucherStatus.CANCELLED.value

    await db.refresh(lot_b)
    await db.refresh(lot_a)
    assert lot_b.quantity == 30
    assert lot_a.quantity == 50

    from uuid import UUID
    result = await db.execute(select(Voucher).where(Voucher.id == UUID(voucher_id)))
    cancelled_voucher = result.scalar_one()
    assert cancelled_voucher.voucher_type == VoucherType.INVOICE_X
    assert cancelled_voucher.status == VoucherStatus.CANCELLED
    assert cancelled_voucher.deleted_at is None


@pytest.mark.asyncio
async def test_voucher_insufficient_stock_returns_error(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot,
    client_for_voucher: Client,
    user_a: User, membership_a,
):
    """Crear un remito con stock insuficiente devuelve error 400."""
    headers = make_auth_header(user_a)
    today = str(date.today())

    # Intentar vender más stock del disponible (solo hay 50 en lot_a)
    response = await client.post(
        "/api/tenant/vouchers",
        headers=headers,
        json={
            "voucher_type": "receipt",
            "date": today,
            "client_id": str(client_for_voucher.id),
            "items": [
                {
                    "product_id": str(product.id),
                    "quantity": 999,
                    "unit_price": 100.00,
                }
            ],
        },
    )

    assert response.status_code == 400, (
        f"Debería devolver 400 por stock insuficiente. "
        f"Status: {response.status_code}, Body: {response.text}"
    )


# ── Tests de Sincronización de Precio desde Lote ─────────────────

@pytest.mark.asyncio
async def test_sync_price_preview_returns_prices_without_persisting(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot,
    user_a: User, membership_a,
):
    """Preview (confirm=false) retorna precios calculados pero NO persiste cambios."""
    headers = make_auth_header(user_a)

    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(lot_a.id),
            "confirm": False,
        },
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    # Debe incluir preview de precios
    assert data["lot_id"] == str(lot_a.id)
    assert Decimal(str(data["reference_price"])) == lot_a.cost_price  # usa cost_price como list_price
    assert Decimal(str(data["preview_list_price"])) == lot_a.cost_price
    assert float(data["preview_net_price"]) > 0
    assert float(data["preview_sale_price"]) > 0
    assert data["confirmed"] is False
    assert data["price_history_id"] is None

    # Verificar que NO se persiste — el producto mantiene su precio original
    await db.refresh(product)
    assert product.list_price == 100  # original del fixture
    assert product.sale_price == 121  # original del fixture


@pytest.mark.asyncio
async def test_sync_price_confirm_uses_cost_price_and_creates_history(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot,
    user_a: User, membership_a,
):
    """Confirm=true usa cost_price del lote, actualiza producto y crea PriceHistory."""
    from app.models.price_history import PriceHistory
    from sqlalchemy import select

    headers = make_auth_header(user_a)
    original_list = product.list_price
    original_net = product.net_price
    original_sale = product.sale_price

    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(lot_a.id),
            "confirm": True,
        },
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert data["confirmed"] is True
    assert Decimal(str(data["reference_price"])) == lot_a.cost_price
    assert Decimal(str(data["preview_list_price"])) == lot_a.cost_price
    assert data["price_history_id"] is not None

    # Verificar que el producto se actualizó
    await db.refresh(product)
    assert product.list_price == lot_a.cost_price  # 50.00

    # Verificar que se creó PriceHistory
    result = await db.execute(
        select(PriceHistory).where(PriceHistory.product_id == product.id)
    )
    entries = result.scalars().all()
    assert len(entries) >= 1

    # Buscar la entry más reciente con la razón de sincronización
    ph = entries[-1]
    assert ph.old_list_price == original_list
    assert ph.new_list_price == lot_a.cost_price
    assert ph.change_reason == "Sincronizado desde lote"


@pytest.mark.asyncio
async def test_sync_price_confirm_with_reference_price(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    lot_a: ProductLot,
    user_a: User, membership_a,
):
    """Confirm=true con reference_price explícito usa ese valor en vez de cost_price."""
    headers = make_auth_header(user_a)
    reference = 75.00

    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(lot_a.id),
            "reference_price": reference,
            "confirm": True,
        },
    )

    assert response.status_code == 200, f"Error: {response.text}"
    data = response.json()

    assert data["confirmed"] is True
    assert Decimal(str(data["reference_price"])) == Decimal(str(reference))
    assert Decimal(str(data["preview_list_price"])) == Decimal(str(reference))

    # Verificar que el producto se actualizó con el reference_price (no con cost_price)
    await db.refresh(product)
    assert product.list_price == Decimal(str(reference))  # 75.00, no 50.00


@pytest.mark.asyncio
async def test_sync_price_no_cost_and_no_reference_returns_400(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    user_a: User, membership_a,
):
    """Lote sin cost_price y sin reference_price devuelve 400."""
    from decimal import Decimal

    # Crear un lote sin cost_price
    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        code="NO-COST",
        quantity=10,
        initial_quantity=10,
        cost_price=None,  # Sin costo
        expiration_date=date.today() + timedelta(days=60),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(lot)

    headers = make_auth_header(user_a)

    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(lot.id),
            "confirm": False,
        },
    )

    assert response.status_code == 400, (
        f"Debería devolver 400 cuando no hay precio disponible. "
        f"Status: {response.status_code}, Body: {response.text}"
    )
    assert "precio" in response.text.lower() or "costo" in response.text.lower()


@pytest.mark.asyncio
async def test_sync_price_lot_from_wrong_product_returns_400(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    user_a: User, membership_a,
):
    """Lote que no pertenece al producto especificado devuelve 400."""
    # Crear otro producto
    other = Product(
        business_id=business_a.id,
        code="OTHER-PROD",
        description="Otro producto",
        list_price=200,
        sale_price=242,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)

    # Crear lote para el otro producto
    other_lot = ProductLot(
        product_id=other.id,
        business_id=business_a.id,
        code="OTHER-LOT",
        quantity=10,
        initial_quantity=10,
        cost_price=30,
    )
    db.add(other_lot)
    await db.commit()

    headers = make_auth_header(user_a)

    # Intentar sincronizar product con un lote de otro producto
    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(other_lot.id),
            "confirm": False,
        },
    )

    assert response.status_code == 400, (
        f"Debería devolver 400 por lote de otro producto. "
        f"Status: {response.status_code}, Body: {response.text}"
    )


@pytest.mark.asyncio
async def test_sync_price_nonexistent_lot_returns_404(
    db: AsyncSession, client: AsyncClient,
    product: Product, business_a: Business,
    user_a: User, membership_a,
):
    """Lote inexistente devuelve 404."""
    headers = make_auth_header(user_a)

    response = await client.post(
        f"/api/tenant/products/{product.id}/sync-price-from-lot",
        headers=headers,
        json={
            "lot_id": str(uuid4()),
            "confirm": False,
        },
    )

    assert response.status_code == 404, (
        f"Debería devolver 404 para lote inexistente. "
        f"Status: {response.status_code}, Body: {response.text}"
    )
