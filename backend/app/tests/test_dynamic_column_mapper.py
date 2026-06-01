"""
Tests for the dynamic-column-mapper feature (PR 1 — backend slice).

Covers:
  5.1  detect_columns: valid xlsx → headers + max-3 sample rows; zero-data xlsx → empty samples
  5.2  preview_import with column_mapping: rename produces correct canonical df keys
  5.3  preview_import legacy path (mapping=None) stays byte-identical
  5.4  bonificaciones mapping: column mapped to 'discounts' routes to existing bonificaciones parser
  5.5  auto-create category at confirm: existing matched case-insensitively; unknown created; empty → null
  5.6  auto-create supplier at confirm: same three sub-cases
  5.7  POST /products/import/detect: valid xlsx → ImportDetectResponse shape; invalid file → 422
  5.8  POST /products/import/preview: with column_mapping → valid preview; without → legacy behavior
"""

import io
import json
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import openpyxl
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.category import Category
from app.models.supplier import Supplier
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.excel_schemas import (
    ImportConfirmRequest,
    ImportDetectResponse,
    ProductImportRow,
)
from app.services.excel_service import FIELD_TO_EXCEL_KEY, ExcelService
from app.tests.conftest import make_auth_header


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_xlsx(headers: list[str], rows: list[list]) -> bytes:
    """Build an in-memory .xlsx with given headers and data rows."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_service(db=None) -> ExcelService:
    if db is None:
        db = MagicMock(spec=AsyncSession)
    return ExcelService(db=db)


# ---------------------------------------------------------------------------
# 5.1 — detect_columns unit tests
# ---------------------------------------------------------------------------


class TestDetectColumns:
    """Unit tests for ExcelService.detect_columns (no DB required)."""

    def test_returns_correct_headers(self):
        content = _make_xlsx(
            ["Ref", "Desc", "Price", "Cat", "Prov"],
            [["A1", "Product A", 100.0, "Tools", "DistA"]],
        )
        svc = _make_service()
        result = svc.detect_columns(content)

        assert result.columns == ["Ref", "Desc", "Price", "Cat", "Prov"]

    def test_sample_rows_max_three(self):
        headers = ["code", "name"]
        data_rows = [[f"C{i}", f"Name {i}"] for i in range(10)]
        content = _make_xlsx(headers, data_rows)
        svc = _make_service()
        result = svc.detect_columns(content)

        assert len(result.sample_rows) == 3

    def test_total_rows_matches_data(self):
        content = _make_xlsx(["h1", "h2"], [["a", "b"], ["c", "d"], ["e", "f"]])
        svc = _make_service()
        result = svc.detect_columns(content)

        assert result.total_rows == 3

    def test_zero_data_rows_returns_empty_sample(self):
        content = _make_xlsx(["Col1", "Col2"], [])
        svc = _make_service()
        result = svc.detect_columns(content)

        assert result.columns == ["Col1", "Col2"]
        assert result.sample_rows == []
        assert result.total_rows == 0

    def test_returns_import_detect_response_instance(self):
        content = _make_xlsx(["X"], [["val"]])
        svc = _make_service()
        result = svc.detect_columns(content)

        assert isinstance(result, ImportDetectResponse)

    def test_cell_values_are_stringified(self):
        content = _make_xlsx(["num", "flag"], [[42, True]])
        svc = _make_service()
        result = svc.detect_columns(content)

        # All sample cell values must be strings or None
        for row in result.sample_rows:
            for cell in row:
                assert cell is None or isinstance(cell, str)

    def test_invalid_content_raises_value_error(self):
        svc = _make_service()
        with pytest.raises(ValueError, match="Error al leer"):
            svc.detect_columns(b"not-an-excel-file")


class TestExcelNumberParsing:
    """Unit tests for regional numeric formats used in product Excel imports."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            # Argentine thousands separator (dot between groups of 3 digits)
            ("7.000", Decimal("7000")),
            ("1.234.567", Decimal("1234567")),
            ("1.500", Decimal("1500")),
            ("12.345", Decimal("12345")),
            # Argentine decimal comma
            ("1.234,56", Decimal("1234.56")),
            ("7,5", Decimal("7.5")),
            ("0,75", Decimal("0.75")),
            # Native float → unchanged
            (7.0, Decimal("7.0")),
            (10.5, Decimal("10.5")),
            # Strings with dot as actual decimal (not thousands)
            ("10.5", Decimal("10.5")),
            ("7.5", Decimal("7.5")),
            ("0.5", Decimal("0.5")),
            # 4+ digits after dot → decimal, not thousands
            ("1.2345", Decimal("1.2345")),
        ],
    )
    def test_dot_is_thousands_separator_for_excel_imports(self, raw, expected):
        assert ExcelService._safe_decimal(raw) == expected


# ---------------------------------------------------------------------------
# 5.2 — preview_import with column_mapping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewImportWithMapping:
    """Tests for preview_import when column_mapping is supplied."""

    async def _preview(self, db, headers, rows, mapping):
        business_id = uuid4()
        content = _make_xlsx(headers, rows)

        # Mock DB queries: no existing categories, no suppliers, no existing products
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[mock_result, mock_result, mock_scalar])

        svc = ExcelService(db=db)
        return await svc.preview_import(business_id, content, column_mapping=mapping)

    async def test_mapped_headers_produce_valid_preview(self):
        db = MagicMock(spec=AsyncSession)
        mapping = {
            "Ref": "code",
            "Desc": "description",
            "PrecioLista": "list_price",
        }
        result = await self._preview(
            db,
            headers=["Ref", "Desc", "PrecioLista"],
            rows=[["TST-001", "Test product", 1000.0]],
            mapping=mapping,
        )

        assert result.total_rows == 1
        assert result.valid_rows == 1
        assert result.rows[0].code == "TST-001"
        assert result.rows[0].description == "Test product"
        assert result.rows[0].list_price == Decimal("1000.0")

    async def test_field_to_excel_key_contains_all_required_fields(self):
        required = {"code", "description", "list_price", "discounts", "category", "supplier"}
        assert required.issubset(FIELD_TO_EXCEL_KEY.keys())

    async def test_unknown_field_id_in_mapping_is_silently_skipped(self):
        """Columns mapped to unknown field ids should not crash."""
        db = MagicMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[mock_result, mock_result, mock_scalar])

        business_id = uuid4()
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista", "garbage_col"],
            [["C1", "Prod 1", 500.0, "ignored"]],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(
            business_id,
            content,
            column_mapping={"garbage_col": "nonexistent_field_id"},
        )

        # The three required canonical columns are already present, so preview succeeds
        assert result.valid_rows == 1


# ---------------------------------------------------------------------------
# 5.3 — preview_import legacy path (no mapping)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewImportLegacyPath:
    """When column_mapping=None, behavior must be byte-identical to pre-change."""

    async def test_legacy_headers_produce_valid_preview(self):
        db = MagicMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[mock_result, mock_result, mock_scalar])

        business_id = uuid4()
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista"],
            [["L-001", "Legacy Product", 750.0]],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content)  # no mapping arg

        assert result.valid_rows == 1
        assert result.rows[0].code == "L-001"

    async def test_missing_required_columns_raises_value_error(self):
        db = MagicMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        business_id = uuid4()
        content = _make_xlsx(["wrong_col"], [["data"]])
        svc = ExcelService(db=db)

        with pytest.raises(ValueError, match="Faltan columnas requeridas"):
            await svc.preview_import(business_id, content)


# ---------------------------------------------------------------------------
# 5.4 — bonificaciones mapping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestBonificacionesMapping:
    async def test_discounts_field_mapped_and_parsed_correctly(self):
        db = MagicMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[mock_result, mock_result, mock_scalar])

        business_id = uuid4()
        # File has header "Descuentos" mapped to field_id "discounts" → "bonificaciones"
        mapping = {
            "Codigo": "code",
            "Nombre": "description",
            "Precio": "list_price",
            "Descuentos": "discounts",
        }
        content = _make_xlsx(
            ["Codigo", "Nombre", "Precio", "Descuentos"],
            [["B-001", "Bonif Prod", 1000.0, "10+5+2"]],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content, column_mapping=mapping)

        row = result.rows[0]
        assert row.discount_1 == Decimal("10")
        assert row.discount_2 == Decimal("5")
        assert row.discount_3 == Decimal("2")
        assert row.discount_display == "10+5+2"

    async def test_frontend_field_ids_are_mapped_correctly(self):
        db = MagicMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_scalar = MagicMock()
        mock_scalar.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[mock_result, mock_result, mock_scalar])

        business_id = uuid4()
        mapping = {
            "Codigo": "code",
            "Nombre": "description",
            "Precio": "list_price",
            "Bonif": "bonificaciones",
            "IVA": "iva_rate",
            "Stock": "current_stock",
        }
        content = _make_xlsx(
            ["Codigo", "Nombre", "Precio", "Bonif", "IVA", "Stock"],
            [["B-002", "Frontend IDs", "7.000", "10+5", "21", "1.500"]],
        )
        svc = ExcelService(db=db)
        result = await svc.preview_import(business_id, content, column_mapping=mapping)

        row = result.rows[0]
        assert row.list_price == Decimal("7000")
        assert row.discount_1 == Decimal("10")
        assert row.discount_2 == Decimal("5")
        assert row.iva_rate == Decimal("21")
        assert row.current_stock == 1500


# ---------------------------------------------------------------------------
# 5.5 — auto-create category at confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConfirmImportCategoryAutoCreate:
    """Category resolution in confirm_import."""

    def _base_row(self, **kwargs) -> ProductImportRow:
        defaults = dict(
            row_number=2,
            code="P001",
            description="Some product",
            list_price=Decimal("100"),
            discount_1=Decimal("0"),
            discount_2=Decimal("0"),
            discount_3=Decimal("0"),
            extra_cost=Decimal("0"),
            profit_margin=Decimal("0"),
            iva_rate=Decimal("21"),
            current_stock=0,
            has_errors=False,
            is_new=True,
        )
        defaults.update(kwargs)
        return ProductImportRow(**defaults)

    async def test_existing_category_matched_case_insensitively(self, db: AsyncSession, business_a: Business):
        # Seed an existing category
        existing_cat = Category(name="Herramientas", business_id=business_a.id)
        db.add(existing_cat)
        await db.commit()
        await db.refresh(existing_cat)

        row = self._base_row(
            category_name="herramientas",  # lowercase
            category_is_new=False,
            category_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        assert result.errors == []

        # Verify the product was linked to the existing category, no new one created
        from sqlalchemy import select as sa_select
        cats = (await db.execute(sa_select(Category).where(Category.business_id == business_a.id))).scalars().all()
        assert len(cats) == 1
        assert cats[0].name == "Herramientas"

    async def test_unknown_category_auto_created(self, db: AsyncSession, business_a: Business):
        row = self._base_row(
            category_name="Gadgets",
            category_is_new=True,
            category_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        from sqlalchemy import select as sa_select
        cats = (await db.execute(sa_select(Category).where(Category.business_id == business_a.id))).scalars().all()
        cat_names = [c.name for c in cats]
        assert "Gadgets" in cat_names

    async def test_auto_created_category_is_scoped_to_business(self, db: AsyncSession, business_a: Business, business_b: Business):
        """Category created for business_a must NOT appear in business_b."""
        row = self._base_row(
            category_name="UniqueToA",
            category_is_new=True,
            category_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        await svc.confirm_import(business_a.id, request)

        from sqlalchemy import select as sa_select
        cats_b = (await db.execute(
            sa_select(Category).where(Category.business_id == business_b.id)
        )).scalars().all()
        assert all(c.name != "UniqueToA" for c in cats_b)

    async def test_empty_category_value_imports_with_null(self, db: AsyncSession, business_a: Business):
        row = self._base_row(
            category_name=None,
            category_is_new=False,
            category_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        assert result.errors == []


# ---------------------------------------------------------------------------
# 5.6 — auto-create supplier at confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestConfirmImportSupplierAutoCreate:
    """Supplier resolution in confirm_import (mirrors category tests)."""

    def _base_row(self, **kwargs) -> ProductImportRow:
        defaults = dict(
            row_number=2,
            code="S001",
            description="Supplier product",
            list_price=Decimal("200"),
            discount_1=Decimal("0"),
            discount_2=Decimal("0"),
            discount_3=Decimal("0"),
            extra_cost=Decimal("0"),
            profit_margin=Decimal("0"),
            iva_rate=Decimal("21"),
            current_stock=0,
            has_errors=False,
            is_new=True,
        )
        defaults.update(kwargs)
        return ProductImportRow(**defaults)

    async def test_existing_supplier_matched_case_insensitively(self, db: AsyncSession, business_a: Business):
        existing_sup = Supplier(name="DistribuidorX", business_id=business_a.id)
        db.add(existing_sup)
        await db.commit()

        row = self._base_row(
            supplier_name="distribuidorx",  # lowercase
            supplier_is_new=False,
            supplier_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        from sqlalchemy import select as sa_select
        sups = (await db.execute(sa_select(Supplier).where(Supplier.business_id == business_a.id))).scalars().all()
        assert len(sups) == 1

    async def test_unknown_supplier_auto_created(self, db: AsyncSession, business_a: Business):
        row = self._base_row(
            supplier_name="NuevoDist",
            supplier_is_new=True,
            supplier_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        from sqlalchemy import select as sa_select
        sups = (await db.execute(sa_select(Supplier).where(Supplier.business_id == business_a.id))).scalars().all()
        sup_names = [s.name for s in sups]
        assert "NuevoDist" in sup_names

    async def test_empty_supplier_value_imports_with_null(self, db: AsyncSession, business_a: Business):
        row = self._base_row(
            supplier_name=None,
            supplier_is_new=False,
            supplier_id=None,
        )
        request = ImportConfirmRequest(rows=[row])
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 1
        assert result.errors == []

    async def test_same_supplier_in_multiple_rows_not_duplicated(self, db: AsyncSession, business_a: Business):
        """Two rows with the same new supplier name should create only ONE supplier."""
        rows = [
            self._base_row(code="S001", supplier_name="SharedDist", supplier_is_new=True),
            self._base_row(code="S002", supplier_name="SharedDist", supplier_is_new=True),
        ]
        request = ImportConfirmRequest(rows=rows)
        svc = ExcelService(db=db)
        result = await svc.confirm_import(business_a.id, request)

        assert result.created == 2
        from sqlalchemy import select as sa_select
        sups = (await db.execute(
            sa_select(Supplier).where(
                Supplier.business_id == business_a.id,
                Supplier.name == "SharedDist",
            )
        )).scalars().all()
        assert len(sups) == 1


# ---------------------------------------------------------------------------
# 5.7 — Integration: POST /products/import/detect
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDetectEndpoint:
    async def test_valid_xlsx_returns_detect_response(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        content = _make_xlsx(
            ["Ref", "Desc", "Price"],
            [["R1", "Prod 1", 100], ["R2", "Prod 2", 200]],
        )
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/detect",
            files={"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "columns" in data
        assert "sample_rows" in data
        assert "total_rows" in data
        assert data["columns"] == ["Ref", "Desc", "Price"]
        assert data["total_rows"] == 2
        assert len(data["sample_rows"]) <= 3

    async def test_invalid_file_extension_returns_400(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/detect",
            files={"file": ("test.csv", b"col1,col2\n1,2", "text/csv")},
            headers=headers,
        )

        assert response.status_code == 400

    async def test_zero_row_xlsx_returns_empty_samples(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        content = _make_xlsx(["ColA", "ColB"], [])
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/detect",
            files={"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["sample_rows"] == []
        assert data["total_rows"] == 0


# ---------------------------------------------------------------------------
# 5.8 — Integration: POST /products/import/preview with column_mapping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPreviewEndpointWithMapping:
    async def test_with_column_mapping_returns_valid_preview(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        mapping = json.dumps({"Ref": "code", "Desc": "description", "Precio": "list_price"})
        content = _make_xlsx(
            ["Ref", "Desc", "Precio"],
            [["M-001", "Mapped Product", 500.0]],
        )
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/preview",
            files={"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"column_mapping": mapping},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_rows"] == 1
        assert data["valid_rows"] == 1
        assert data["rows"][0]["code"] == "M-001"

    async def test_without_column_mapping_legacy_behavior(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        """Legacy callers without column_mapping field must still work."""
        content = _make_xlsx(
            ["codigo", "nombre", "precio_lista"],
            [["L-999", "Legacy prod", 300.0]],
        )
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/preview",
            files={"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["valid_rows"] == 1
        assert data["rows"][0]["code"] == "L-999"

    async def test_invalid_column_mapping_json_returns_400(
        self,
        client: AsyncClient,
        membership_a: TenantMembership,
        user_a: User,
        business_a: Business,
    ):
        content = _make_xlsx(["codigo", "nombre", "precio_lista"], [["X", "Y", 10]])
        headers = make_auth_header(user_a)

        response = await client.post(
            "/api/tenant/products/import/preview",
            files={"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            data={"column_mapping": "not-valid-json"},
            headers=headers,
        )

        assert response.status_code == 400
