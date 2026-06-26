"""
Tests para: packaging fields (F1a) y detección de duplicados (F1b)
en el pipeline de importación Excel.

Cubre:
  3.1  _parse_bool_cell: casos truthy, falsy y blank → True por defecto
  3.2  confirm_import persiste quantity_per_package + sell_per_unit (nuevo y existente)
  3.3  preview_import intra-file duplicate: segunda fila mismo código → status="repetido"
  3.4  preview_import DB duplicate: supplier_code ya en DB → status="repetido"
  3.5  confirm_import omite filas "repetido"; result.skipped_duplicates == count esperado
  3.6  quantity_per_package = 0 y negativo → fila rechazada con error de validación
"""

import io
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import openpyxl
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.excel_schemas import (
    ImportConfirmRequest,
    ProductImportRow,
)
from app.services.excel_service import ExcelService, _parse_bool_cell


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_xlsx(headers: list[str], rows: list[list]) -> bytes:
    """Construye un archivo .xlsx en memoria con los headers y filas dados."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _db_no_products() -> MagicMock:
    """
    Retorna un mock de AsyncSession que simula:
      - execute #1: SELECT categories → []
      - execute #2: SELECT suppliers → []
      - execute #3: SELECT supplier_codes (batch F1b) → empty (no existing codes)
      Luego cada fila hace un execute adicional para buscar producto existente.
    """
    db = MagicMock(spec=AsyncSession)
    empty_list_result = MagicMock()
    empty_list_result.scalars.return_value.all.return_value = []
    empty_all_result = MagicMock()
    empty_all_result.all.return_value = []
    none_result = MagicMock()
    none_result.scalar_one_or_none.return_value = None
    # Orden: categories, suppliers, supplier_codes_batch, per-row product lookup(s)
    db.execute = AsyncMock(side_effect=[
        empty_list_result,   # categories
        empty_list_result,   # suppliers
        empty_all_result,    # supplier_codes batch query
        none_result,         # producto existente fila 1
    ])
    return db


def _db_no_products_two_rows() -> MagicMock:
    """
    Mock para preview con 2 filas normales (sin duplicados DB ni intra-archivo
    cuando los supplier_codes son distintos).
    """
    db = MagicMock(spec=AsyncSession)
    empty_list_result = MagicMock()
    empty_list_result.scalars.return_value.all.return_value = []
    empty_all_result = MagicMock()
    empty_all_result.all.return_value = []
    none_result = MagicMock()
    none_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[
        empty_list_result,   # categories
        empty_list_result,   # suppliers
        empty_all_result,    # supplier_codes batch query
        none_result,         # producto existente fila 1
        none_result,         # producto existente fila 2
    ])
    return db


def _make_product_row(
    *,
    row_number: int = 2,
    code: str = "TST-001",
    supplier_code: str | None = None,
    description: str = "Producto de prueba",
    list_price: Decimal = Decimal("1000"),
    quantity_per_package: Decimal | None = None,
    sell_per_unit: bool = True,
    sell_per_unit_mapped: bool = False,
    is_new: bool = True,
    has_errors: bool = False,
    status: str = "nuevo",
) -> ProductImportRow:
    """Crea una ProductImportRow con valores por defecto razonables."""
    return ProductImportRow(
        row_number=row_number,
        code=code,
        supplier_code=supplier_code,
        description=description,
        list_price=list_price,
        discount_1=Decimal("0"),
        discount_2=Decimal("0"),
        discount_3=Decimal("0"),
        extra_cost=Decimal("0"),
        profit_margin=Decimal("0"),
        iva_rate=Decimal("21"),
        current_stock=0,
        minimum_stock=0,
        unit="unidad",
        quantity_per_package=quantity_per_package,
        sell_per_unit=sell_per_unit,
        sell_per_unit_mapped=sell_per_unit_mapped,
        is_new=is_new,
        has_errors=has_errors,
        status=status,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# 3.1 — _parse_bool_cell unit tests
# ---------------------------------------------------------------------------


class TestParseBoolCell:
    """Cobertura de _parse_bool_cell: truthy, falsy y blank."""

    # -- Casos truthy --

    def test_si_con_acento_es_true(self):
        assert _parse_bool_cell("sí") is True

    def test_si_sin_acento_es_true(self):
        assert _parse_bool_cell("si") is True

    def test_s_minuscula_es_true(self):
        assert _parse_bool_cell("s") is True

    def test_true_string_es_true(self):
        assert _parse_bool_cell("true") is True

    def test_true_string_mayuscula_es_true(self):
        assert _parse_bool_cell("TRUE") is True

    def test_uno_string_es_true(self):
        assert _parse_bool_cell("1") is True

    def test_x_es_true(self):
        assert _parse_bool_cell("x") is True

    def test_entero_1_es_true(self):
        assert _parse_bool_cell(1) is True

    def test_bool_true_es_true(self):
        assert _parse_bool_cell(True) is True

    # -- Casos falsy --

    def test_no_es_false(self):
        assert _parse_bool_cell("no") is False

    def test_n_es_false(self):
        assert _parse_bool_cell("n") is False

    def test_false_string_es_false(self):
        assert _parse_bool_cell("false") is False

    def test_false_string_mayuscula_es_false(self):
        assert _parse_bool_cell("FALSE") is False

    def test_cero_string_es_false(self):
        assert _parse_bool_cell("0") is False

    def test_entero_0_es_false(self):
        assert _parse_bool_cell(0) is False

    def test_bool_false_es_false(self):
        assert _parse_bool_cell(False) is False

    def test_cadena_vacia_es_false(self):
        """Cadena vacía explícita → False (no es blank, es vacío)."""
        assert _parse_bool_cell("") is False

    # -- Casos blank → True por defecto --

    def test_none_es_true(self):
        """None (columna ausente) → True por defecto."""
        assert _parse_bool_cell(None) is True

    def test_nan_float_es_true(self):
        """float NaN (celda vacía en pandas) → True por defecto."""
        import math
        assert _parse_bool_cell(float("nan")) is True

    def test_solo_espacios_es_true(self):
        """Cadena con solo espacios (stripped a vacío) → True."""
        assert _parse_bool_cell("   ") is True


# ---------------------------------------------------------------------------
# 3.2 — confirm_import persiste quantity_per_package + sell_per_unit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConfirmImportPackagingFields:
    """confirm_import debe persistir quantity_per_package y sell_per_unit."""

    async def test_nuevo_producto_persiste_packaging_fields(self):
        """Para producto nuevo, confirm_import debe setear quantity_per_package y sell_per_unit."""
        db = MagicMock(spec=AsyncSession)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        # Sin categorías ni proveedores existentes, sin producto existente
        empty_result = MagicMock()
        empty_result.scalars.return_value.all.return_value = []
        none_result = MagicMock()
        none_result.scalar_one_or_none.return_value = None
        # execute calls in confirm: _resolve_category (ALL cats), _resolve_supplier (ALL sups),
        # brand lookup — here they won't be triggered since ids are pre-resolved.
        # The row is is_new=True with no category_is_new/supplier_is_new, so no DB calls needed.
        db.execute = AsyncMock(return_value=empty_result)

        business_id = uuid4()
        row = _make_product_row(
            code="PKG-001",
            quantity_per_package=Decimal("20"),
            sell_per_unit=False,
            is_new=True,
            status="nuevo",
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_id=business_id, request=request)

        assert result.created == 1
        assert result.updated == 0

        # Verificar que db.add fue llamado con un Product que tiene los campos correctos
        added_products = [
            call.args[0]
            for call in db.add.call_args_list
            if isinstance(call.args[0], Product)
        ]
        assert len(added_products) == 1
        product = added_products[0]
        assert product.quantity_per_package == Decimal("20")
        assert product.sell_per_unit is False

    async def test_producto_existente_actualiza_packaging_fields(self):
        """Para producto existente, confirm_import debe actualizar quantity_per_package y sell_per_unit."""
        db = MagicMock(spec=AsyncSession)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        existing_product = MagicMock(spec=Product)
        existing_product.id = uuid4()
        existing_product.lots = []
        existing_product.calculate_prices = MagicMock()

        from sqlalchemy.orm import selectinload
        product_result = MagicMock()
        product_result.scalar_one_or_none.return_value = existing_product

        empty_result = MagicMock()
        empty_result.scalars.return_value.all.return_value = []

        # No category_is_new ni supplier_is_new en el row, is_new=False
        # confirm_import buscará el producto por existing_id usando selectinload
        db.execute = AsyncMock(return_value=product_result)

        business_id = uuid4()
        existing_id = existing_product.id
        row = _make_product_row(
            code="PKG-001",
            quantity_per_package=Decimal("10"),
            sell_per_unit=True,
            sell_per_unit_mapped=True,
            is_new=False,
            status="actualizar",
        )
        # Para la rama is_new=False necesitamos existing_id
        row = row.model_copy(update={"existing_id": existing_id})
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_id=business_id, request=request)

        assert result.updated == 1
        assert existing_product.quantity_per_package == Decimal("10")
        assert existing_product.sell_per_unit is True


# ---------------------------------------------------------------------------
# 3.3 — preview_import intra-file duplicate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewImportIntraFileDuplicate:
    """Dos filas con mismo supplier_code → la segunda queda status='repetido'."""

    async def test_segunda_fila_misma_supplier_code_es_repetido(self):
        db = MagicMock(spec=AsyncSession)
        empty_list_result = MagicMock()
        empty_list_result.scalars.return_value.all.return_value = []
        empty_all_result = MagicMock()
        empty_all_result.all.return_value = []
        none_result = MagicMock()
        none_result.scalar_one_or_none.return_value = None

        # Primera fila requiere un lookup de producto existente; la segunda es duplicada intra-file
        # y hace `continue` antes del lookup → solo 1 execute de producto
        db.execute = AsyncMock(side_effect=[
            empty_list_result,  # categories
            empty_list_result,  # suppliers
            empty_all_result,   # supplier_codes batch
            none_result,        # producto existente fila 1
            # fila 2: es duplicado intra-file, no llega al lookup
        ])

        business_id = uuid4()
        # Ambas filas tienen supplier_code="PROV-001" (intra-file duplicate)
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista", "codigo_proveedor"],
            [
                ["TST-001", "Producto A", "1000", "PROV-001"],
                ["TST-002", "Producto B", "2000", "PROV-001"],  # duplicado
            ],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content)

        assert result.total_rows == 2
        assert result.duplicate_rows == 1

        # Primera fila: normal (status "nuevo")
        fila_1 = next(r for r in result.rows if r.code == "TST-001")
        assert fila_1.status == "nuevo"
        assert fila_1.has_errors is False

        # Segunda fila: repetido
        fila_2 = next(r for r in result.rows if r.code == "TST-002")
        assert fila_2.status == "repetido"

    async def test_primera_fila_duplicado_es_normal(self):
        """La primera aparición de un supplier_code siempre es procesada normalmente."""
        db = MagicMock(spec=AsyncSession)
        empty_list_result = MagicMock()
        empty_list_result.scalars.return_value.all.return_value = []
        empty_all_result = MagicMock()
        empty_all_result.all.return_value = []
        none_result = MagicMock()
        none_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[
            empty_list_result,
            empty_list_result,
            empty_all_result,
            none_result,  # producto fila 1
        ])

        business_id = uuid4()
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista", "codigo_proveedor"],
            [
                ["TST-001", "Producto A", "1000", "PROV-001"],
                ["TST-002", "Producto B", "2000", "PROV-001"],
            ],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content)

        fila_1 = next(r for r in result.rows if r.code == "TST-001")
        assert fila_1.status != "repetido"
        assert fila_1.has_errors is False


# ---------------------------------------------------------------------------
# 3.4 — preview_import DB duplicate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewImportDBDuplicate:
    """supplier_code ya existe en DB para ese supplier → status='repetido'."""

    async def test_supplier_code_en_db_es_repetido(self):
        db = MagicMock(spec=AsyncSession)

        # supplier con id conocido
        supplier_id = uuid4()
        supplier_mock = MagicMock()
        supplier_mock.id = supplier_id
        supplier_mock.name = "Proveedor Test"

        empty_list_result = MagicMock()
        empty_list_result.scalars.return_value.all.return_value = []

        supplier_list_result = MagicMock()
        supplier_list_result.scalars.return_value.all.return_value = [supplier_mock]

        # El batch de supplier_codes incluye (supplier_id, "PROV-DUP") → el row quedará repetido
        existing_code_row = MagicMock()
        existing_code_row.supplier_id = supplier_id
        existing_code_row.supplier_code = "PROV-DUP"
        db_codes_result = MagicMock()
        db_codes_result.all.return_value = [existing_code_row]

        # La fila no llega al lookup de producto existente porque es duplicada
        db.execute = AsyncMock(side_effect=[
            empty_list_result,      # categories
            supplier_list_result,   # suppliers
            db_codes_result,        # supplier_codes batch → contiene PROV-DUP
            # no hay lookup de producto porque continua con 'repetido'
        ])

        business_id = uuid4()
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista", "codigo_proveedor", "proveedor"],
            [["TST-001", "Producto A", "1000", "PROV-DUP", "Proveedor Test"]],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content)

        assert result.duplicate_rows == 1
        assert len(result.rows) == 1
        fila = result.rows[0]
        assert fila.status == "repetido"
        assert fila.has_errors is False


# ---------------------------------------------------------------------------
# 3.5 — confirm_import omite filas "repetido"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConfirmImportSkipsRepetido:
    """confirm_import debe omitir filas con status='repetido' y contarlas en skipped_duplicates."""

    async def test_filas_repetidas_no_se_crean(self):
        db = MagicMock(spec=AsyncSession)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.execute = AsyncMock()

        business_id = uuid4()
        rows = [
            _make_product_row(row_number=2, code="TST-001", is_new=True, status="nuevo"),
            _make_product_row(row_number=3, code="TST-002", is_new=True, status="repetido"),
            _make_product_row(row_number=4, code="TST-003", is_new=True, status="repetido"),
        ]
        request = ImportConfirmRequest(rows=rows)
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_id=business_id, request=request)

        assert result.created == 1
        assert result.skipped_duplicates == 2

    async def test_skipped_duplicates_exacto(self):
        """skipped_duplicates debe ser exactamente el número de filas con status='repetido'."""
        db = MagicMock(spec=AsyncSession)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.execute = AsyncMock()

        business_id = uuid4()
        rows = [
            _make_product_row(row_number=2, code="A-001", is_new=True, status="repetido"),
            _make_product_row(row_number=3, code="A-002", is_new=True, status="repetido"),
            _make_product_row(row_number=4, code="A-003", is_new=True, status="repetido"),
        ]
        request = ImportConfirmRequest(rows=rows)
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_id=business_id, request=request)

        assert result.created == 0
        assert result.skipped_duplicates == 3

    async def test_sin_repetidos_skipped_es_cero(self):
        """Sin filas repetidas, skipped_duplicates debe ser 0."""
        db = MagicMock(spec=AsyncSession)
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.execute = AsyncMock()

        business_id = uuid4()
        rows = [
            _make_product_row(row_number=2, code="B-001", is_new=True, status="nuevo"),
        ]
        request = ImportConfirmRequest(rows=rows)
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_id=business_id, request=request)

        assert result.skipped_duplicates == 0


# ---------------------------------------------------------------------------
# 3.6 — quantity_per_package = 0 o negativo → fila con error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewImportQuantityPerPackageValidation:
    """quantity_per_package = 0 o negativo debe resultar en fila con error."""

    async def _preview_with_qty(self, qty_value) -> object:
        """Helper para hacer preview con una fila con cantidad_por_compra dada."""
        db = MagicMock(spec=AsyncSession)
        empty_list_result = MagicMock()
        empty_list_result.scalars.return_value.all.return_value = []
        empty_all_result = MagicMock()
        empty_all_result.all.return_value = []
        none_result = MagicMock()
        none_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[
            empty_list_result,
            empty_list_result,
            empty_all_result,
            # Si la validación falla, se catch en except y no llega al lookup
            # Si pasa, hace el lookup
            none_result,
        ])

        business_id = uuid4()
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista", "cantidad_por_compra"],
            [["TST-001", "Producto A", "1000", qty_value]],
        )
        svc = ExcelService(db=db)
        return await svc.preview_import(business_id, content)

    async def test_cantidad_cero_rechaza_fila(self):
        """cantidad_por_compra = 0 debe generar una fila con has_errors=True."""
        result = await self._preview_with_qty(0)
        assert result.rows_with_errors == 1
        fila = result.rows[0]
        assert fila.has_errors is True
        assert fila.error_message is not None
        assert result.valid_rows == 0

    async def test_cantidad_negativa_rechaza_fila(self):
        """cantidad_por_compra < 0 debe generar una fila con has_errors=True."""
        result = await self._preview_with_qty(-5)
        assert result.rows_with_errors == 1
        fila = result.rows[0]
        assert fila.has_errors is True
        assert fila.error_message is not None
        assert result.valid_rows == 0

    async def test_cantidad_positiva_es_valida(self):
        """cantidad_por_compra > 0 no debe generar error."""
        result = await self._preview_with_qty(10)
        assert result.rows_with_errors == 0
        assert result.valid_rows == 1
        fila = result.rows[0]
        assert fila.has_errors is False
        assert fila.quantity_per_package == Decimal("10")
