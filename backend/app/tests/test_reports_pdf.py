"""
Tests de integración para exportación de reportes PDF, Excel y CSV.
"""

import io
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from openpyxl import load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.client import Client
from app.models.client_type import ClientType
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.supplier import Supplier
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.schemas.report_schemas import (
    ClientAccountsReportFilters,
    InventoryCountReportFilters,
    SalesReportFilters,
    StockReportFilters,
    TopProductsReportFilters,
)
from app.services.reporting.client_accounts_report_service import ClientAccountsReportService
from app.services.reporting.inventory_count_report_service import InventoryCountReportService
from app.services.reporting.sales_report_service import SalesReportService
from app.services.reporting.stock_report_service import StockReportService
from app.services.reporting.top_products_report_service import TopProductsReportService
from app.tests.conftest import make_auth_header


async def _create_category(db: AsyncSession, business_id, name: str = "Grifería") -> Category:
    """Crea una categoría mínima para reportes."""
    category = Category(business_id=business_id, name=name)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def _create_supplier(db: AsyncSession, business_id, name: str = "Proveedor Norte") -> Supplier:
    """Crea un proveedor mínimo para reportes."""
    supplier = Supplier(business_id=business_id, name=name, cuit="30-12345678-9")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


async def _create_product(
    db: AsyncSession,
    business_id,
    *,
    code: str = "PRD-001",
    description: str = "Producto test reporte",
    category_id=None,
    supplier_id=None,
    stock: int = 5,
    minimum_stock: int = 10,
    sale_price: Decimal = Decimal("145.20"),
    is_active: bool = True,
) -> Product:
    """Crea un producto con lote para alimentar el stock calculado."""
    product = Product(
        business_id=business_id,
        category_id=category_id,
        supplier_id=supplier_id,
        code=code,
        supplier_code=f"SUP-{code}",
        description=description,
        minimum_stock=minimum_stock,
        cost_price=Decimal("100.00"),
        list_price=Decimal("120.00"),
        net_price=Decimal("120.00"),
        sale_price=sale_price,
        iva_rate=Decimal("21.00"),
        is_active=is_active,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    lot = ProductLot(
        product_id=product.id,
        business_id=business_id,
        quantity=stock,
        initial_quantity=stock,
        received_date=date.today(),
    )
    db.add(lot)
    await db.commit()
    await db.refresh(product, attribute_names=["lots", "category", "supplier"])
    return product


async def _create_client_type(db: AsyncSession, business_id) -> ClientType:
    """Crea un tipo de cliente mínimo."""
    client_type = ClientType(business_id=business_id, name=f"Consumidor Final {uuid4()}")
    db.add(client_type)
    await db.commit()
    await db.refresh(client_type)
    return client_type


async def _create_client(
    db: AsyncSession,
    business_id,
    *,
    name: str = "Cliente Reporte",
    balance: Decimal = Decimal("0.00"),
) -> Client:
    """Crea un cliente mínimo con saldo configurable."""
    client_type = await _create_client_type(db, business_id)
    customer = Client(
        business_id=business_id,
        client_type_id=client_type.id,
        name=name,
        document_type="DNI",
        document_number="12345678",
        tax_condition="Consumidor Final",
        current_balance=balance,
        credit_limit=Decimal("50000.00"),
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


async def _create_confirmed_voucher(
    db: AsyncSession,
    business_id,
    product: Product,
    client: Client,
    *,
    voucher_date: date = date(2026, 1, 15),
    voucher_type: VoucherType = VoucherType.INVOICE_B,
    number: str = "00000001",
    total: Decimal = Decimal("242.00"),
) -> Voucher:
    """Crea un comprobante confirmado con un ítem vendido."""
    voucher = Voucher(
        business_id=business_id,
        client_id=client.id,
        voucher_type=voucher_type,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number=number,
        date=voucher_date,
        subtotal=Decimal("200.00"),
        iva_amount=Decimal("42.00"),
        total=total,
    )
    db.add(voucher)
    await db.commit()
    await db.refresh(voucher)

    item = VoucherItem(
        voucher_id=voucher.id,
        product_id=product.id,
        code=product.code,
        description=product.description,
        quantity=Decimal("2.00"),
        unit_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
        iva_amount=Decimal("42.00"),
        subtotal=Decimal("200.00"),
        total=total,
        line_number=1,
    )
    db.add(item)
    await db.commit()
    return voucher


def _xlsx_headers(content: bytes) -> list[str]:
    """Lee los encabezados del primer worksheet exportado."""
    workbook = load_workbook(io.BytesIO(content))
    sheet = workbook.active
    return [cell.value for cell in sheet[1]]


@pytest.mark.asyncio
async def test_stock_report_provider_builds_shared_dataset_with_totals(
    db: AsyncSession,
    business_a,
    user_a: User,
):
    """El proveedor de stock debe devolver filas y totales desde una única fuente."""
    category = await _create_category(db, business_a.id)
    supplier = await _create_supplier(db, business_a.id)
    await _create_product(
        db,
        business_a.id,
        category_id=category.id,
        supplier_id=supplier.id,
        stock=3,
        minimum_stock=5,
    )

    dataset = await StockReportService(db).build_dataset(
        business_a.id,
        StockReportFilters(low_stock_only=True),
        generated_by=user_a.email,
    )

    assert dataset.title == "Reporte de Stock"
    assert dataset.headers[:3] == ["Código", "Cód. Prov.", "Descripción"]
    assert dataset.rows[0]["Código"] == "PRD-001"
    assert dataset.rows[0]["Stock"] == 3
    assert dataset.totals["Ítems"] == 1
    assert dataset.totals["Stock bajo"] == 1


@pytest.mark.asyncio
async def test_stock_report_provider_returns_empty_dataset_for_no_matches(
    db: AsyncSession,
    business_a,
):
    """Los filtros sin resultados deben producir tabla vacía y totales cero."""
    await _create_product(db, business_a.id, description="No coincide")

    dataset = await StockReportService(db).build_dataset(
        business_a.id,
        StockReportFilters(search="inexistente"),
    )

    assert dataset.rows == []
    assert dataset.totals["Ítems"] == 0
    assert dataset.totals["Unidades"] == 0
    assert dataset.totals["Valor stock"] == 0.0


@pytest.mark.asyncio
async def test_sales_report_provider_preserves_date_and_receipt_filters(
    db: AsyncSession,
    business_a,
):
    """Ventas debe filtrar por período inclusivo y excluir remitos si se solicita."""
    product = await _create_product(db, business_a.id)
    customer = await _create_client(db, business_a.id)
    await _create_confirmed_voucher(db, business_a.id, product, customer, number="00000001")
    await _create_confirmed_voucher(
        db,
        business_a.id,
        product,
        customer,
        voucher_date=date(2026, 1, 16),
        voucher_type=VoucherType.RECEIPT,
        number="00000002",
    )

    dataset = await SalesReportService(db).build_dataset(
        business_a.id,
        SalesReportFilters(
            date_from=date(2026, 1, 1),
            date_to=date(2026, 1, 31),
            include_receipts=False,
        ),
    )

    assert [row["Tipo"] for row in dataset.rows] == ["invoice_b"]
    assert dataset.totals["Comprobantes"] == 1
    assert dataset.totals["Total"] == 242.0


@pytest.mark.asyncio
async def test_top_products_report_provider_respects_limit_and_order(
    db: AsyncSession,
    business_a,
):
    """Productos más vendidos debe respetar límite y ordenar por importe descendente."""
    customer = await _create_client(db, business_a.id)
    product_a = await _create_product(db, business_a.id, code="PRD-A", description="Producto A")
    product_b = await _create_product(db, business_a.id, code="PRD-B", description="Producto B")
    await _create_confirmed_voucher(db, business_a.id, product_a, customer, total=Decimal("242.00"))
    await _create_confirmed_voucher(
        db,
        business_a.id,
        product_b,
        customer,
        number="00000002",
        total=Decimal("484.00"),
    )

    dataset = await TopProductsReportService(db).build_dataset(
        business_a.id,
        TopProductsReportFilters(limit=1),
    )

    assert len(dataset.rows) == 1
    assert dataset.rows[0]["Código"] == "PRD-B"
    assert dataset.totals["Filas"] == 1
    assert dataset.totals["Cantidad"] == 2.0


@pytest.mark.asyncio
async def test_client_accounts_report_provider_filters_balances(
    db: AsyncSession,
    business_a,
):
    """Cuentas corrientes debe excluir clientes en cero cuando only_with_balance es true."""
    await _create_client(db, business_a.id, name="Cliente Deudor", balance=Decimal("1500.00"))
    await _create_client(db, business_a.id, name="Cliente Cero", balance=Decimal("0.00"))
    await _create_client(db, business_a.id, name="Cliente A Favor", balance=Decimal("-200.00"))

    dataset = await ClientAccountsReportService(db).build_dataset(
        business_a.id,
        ClientAccountsReportFilters(only_with_balance=True),
    )

    assert [row["Cliente"] for row in dataset.rows] == ["Cliente Deudor", "Cliente A Favor"]
    assert dataset.totals["Clientes"] == 2
    assert dataset.totals["Deuda"] == 1500.0
    assert dataset.totals["A favor"] == 200.0


@pytest.mark.asyncio
async def test_inventory_count_report_provider_reuses_count_sheet_rows(
    db: AsyncSession,
    business_a,
    user_a: User,
):
    """Conteo de inventario debe usar los productos activos de la planilla existente."""
    category = await _create_category(db, business_a.id)
    supplier = await _create_supplier(db, business_a.id)
    await _create_product(
        db,
        business_a.id,
        code="CNT-001",
        description="Producto para conteo",
        category_id=category.id,
        supplier_id=supplier.id,
        stock=8,
    )
    await _create_product(
        db,
        business_a.id,
        code="CNT-INACTIVE",
        category_id=category.id,
        supplier_id=supplier.id,
        is_active=False,
    )

    dataset = await InventoryCountReportService(db).build_dataset(
        business_a.id,
        InventoryCountReportFilters(supplier_id=supplier.id),
        generated_by=user_a.email,
    )

    assert dataset.title == "Planilla de Conteo de Inventario"
    assert dataset.headers == [
        "Código",
        "Descripción",
        "Categoría",
        "Proveedor",
        "Stock Sistema",
        "Conteo Físico",
        "A Pedir",
    ]
    assert dataset.rows == [
        {
            "Código": "CNT-001",
            "Descripción": "Producto para conteo",
            "Categoría": "Grifería",
            "Proveedor": "Proveedor Norte",
            "Stock Sistema": 8,
            "Conteo Físico": "",
            "A Pedir": "",
        }
    ]
    assert dataset.totals["Productos"] == 1
    assert dataset.orientation == "landscape"


@pytest.mark.asyncio
async def test_inventory_count_report_provider_returns_empty_dataset_for_valid_empty_filter(
    db: AsyncSession,
    business_a,
):
    """Un filtro válido sin productos debe generar tabla vacía con total cero."""
    supplier = await _create_supplier(db, business_a.id)

    dataset = await InventoryCountReportService(db).build_dataset(
        business_a.id,
        InventoryCountReportFilters(supplier_id=supplier.id),
    )

    assert dataset.rows == []
    assert dataset.totals["Productos"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "expected_filename", "expected_header"),
    [
        ("/api/tenant/reports/stock", "reporte_stock_", "Código"),
        ("/api/tenant/reports/sales", "reporte_ventas_", "Fecha"),
        ("/api/tenant/reports/top-products", "reporte_productos_", "Código"),
        ("/api/tenant/reports/client-accounts", "reporte_cuentas_corrientes_", "Cliente"),
    ],
)
async def test_report_endpoints_export_pdf_xlsx_and_csv(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a,
    membership_a,
    path: str,
    expected_filename: str,
    expected_header: str,
):
    """Cada reporte PR1 debe descargarse en PDF, Excel y CSV con el mismo contrato."""
    product = await _create_product(db, business_a.id)
    customer = await _create_client(db, business_a.id, balance=Decimal("100.00"))
    await _create_confirmed_voucher(db, business_a.id, product, customer)

    pdf_response = await client.get(path, headers=make_auth_header(user_a))
    assert pdf_response.status_code == 200, pdf_response.text
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert expected_filename in pdf_response.headers.get("content-disposition", "")
    assert pdf_response.content.startswith(b"%PDF")

    xlsx_response = await client.get(f"{path}?format=xlsx", headers=make_auth_header(user_a))
    assert xlsx_response.status_code == 200, xlsx_response.text
    assert xlsx_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert _xlsx_headers(xlsx_response.content)[0] == expected_header

    csv_response = await client.get(f"{path}?format=csv", headers=make_auth_header(user_a))
    assert csv_response.status_code == 200, csv_response.text
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert csv_response.text.splitlines()[0].startswith(expected_header)


@pytest.mark.asyncio
async def test_inventory_count_report_endpoint_exports_pdf_xlsx_and_csv(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a,
    membership_a,
):
    """El hub de reportes debe descargar conteo de inventario en los tres formatos."""
    category = await _create_category(db, business_a.id)
    supplier = await _create_supplier(db, business_a.id)
    await _create_product(
        db,
        business_a.id,
        code="CNT-002",
        description="Producto exportable",
        category_id=category.id,
        supplier_id=supplier.id,
        stock=11,
    )
    path = f"/api/tenant/reports/inventory-count?supplier_id={supplier.id}"

    pdf_response = await client.get(path, headers=make_auth_header(user_a))
    assert pdf_response.status_code == 200, pdf_response.text
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert "reporte_planilla_conteo_" in pdf_response.headers.get("content-disposition", "")
    assert pdf_response.content.startswith(b"%PDF")

    xlsx_response = await client.get(f"{path}&format=xlsx", headers=make_auth_header(user_a))
    assert xlsx_response.status_code == 200, xlsx_response.text
    assert xlsx_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert _xlsx_headers(xlsx_response.content) == [
        "Código",
        "Descripción",
        "Categoría",
        "Proveedor",
        "Stock Sistema",
        "Conteo Físico",
        "A Pedir",
    ]

    csv_response = await client.get(f"{path}&format=csv", headers=make_auth_header(user_a))
    assert csv_response.status_code == 200, csv_response.text
    assert csv_response.headers["content-type"].startswith("text/csv")
    lines = csv_response.text.splitlines()
    assert lines[0] == "Código,Descripción,Categoría,Proveedor,Stock Sistema,Conteo Físico,A Pedir"
    assert lines[1].startswith("CNT-002,Producto exportable,Grifería,Proveedor Norte,11,")


@pytest.mark.asyncio
async def test_inventory_count_report_requires_supplier_or_category_filter(
    client: AsyncClient,
    user_a: User,
    business_a,
    membership_a,
):
    """La ruta de reportes debe rechazar planillas de conteo sin filtros."""
    response = await client.get(
        "/api/tenant/reports/inventory-count",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400
    assert "proveedor o una categoría" in response.text


@pytest.mark.asyncio
async def test_compatibility_stock_pdf_alias_still_works(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a,
    membership_a,
):
    """El alias histórico /stock/pdf debe seguir disponible para el frontend existente."""
    await _create_product(db, business_a.id)

    response = await client.get(
        "/api/tenant/reports/stock/pdf",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_unknown_report_filter_returns_400(
    client: AsyncClient,
    user_a: User,
    business_a,
    membership_a,
):
    """Los filtros desconocidos deben rechazarse antes de generar archivos."""
    response = await client.get(
        "/api/tenant/reports/sales?unknown_filter=1",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400
    assert "Filtro no permitido" in response.text


@pytest.mark.asyncio
async def test_invalid_report_date_range_returns_400(
    client: AsyncClient,
    user_a: User,
    business_a,
    membership_a,
):
    """Un rango de fechas inválido debe devolver HTTP 400 sin archivo."""
    response = await client.get(
        "/api/tenant/reports/sales?date_from=2026-02-01&date_to=2026-01-01",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400
    assert not response.content.startswith(b"%PDF")
