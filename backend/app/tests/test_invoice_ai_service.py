"""
Tests para InvoiceAIService (Compras — carga por IA, PR2).

Cubre: extracción PDF→texto (PyMuPDF), llamada al proveedor IA activo
(LLMFactory, mockeado — nunca se llama a un proveedor real en los tests),
matching de supplier/producto (nunca auto-crea), y el contrato de que el
servicio NUNCA escribe stock/precio directamente (solo persiste un draft).
"""
import json
from decimal import Decimal
from types import SimpleNamespace

import pytest
import pytest_asyncio

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import PurchaseInvoiceSource, PurchaseInvoiceStatus
from app.models.supplier import Supplier
from app.services.invoice_ai_service import InvoiceAIParseError, InvoiceAIService
from app.services.llm_factory import LLMFactory

pytestmark = pytest.mark.asyncio


def _make_pdf_bytes(text: str | None) -> bytes:
    """Genera un PDF real en memoria con PyMuPDF (con o sin texto extraíble)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class _FakeCompletions:
    def __init__(self, content: str):
        self._content = content

    def create(self, **kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._content))]
        )


class _FakeOpenAIClient:
    def __init__(self, content: str):
        self.chat = SimpleNamespace(completions=_FakeCompletions(content))


@pytest_asyncio.fixture
async def supplier_a(db, business_a):
    supplier = Supplier(business_id=business_a.id, name="Proveedor PDF SA")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@pytest_asyncio.fixture
async def product_a(db, business_a):
    product = Product(
        business_id=business_a.id,
        code="AI-001",
        description="Caño PVC 1/2 IA",
        list_price=Decimal("100.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


def _mock_llm(monkeypatch, extracted: dict):
    """Mockea LLMFactory para que la extracción devuelva `extracted` sin red."""

    async def fake_resolve(business_id, db):
        return ("openai", "sk-test-fake", "gpt-4o")

    monkeypatch.setattr(LLMFactory, "resolve", fake_resolve)
    monkeypatch.setattr(
        LLMFactory,
        "build_openai_compatible",
        lambda api_key, provider, base_url=None: _FakeOpenAIClient(
            json.dumps(extracted)
        ),
    )


class TestExtractPdfText:
    """RED → extracción de texto vía PyMuPDF."""

    def test_extracts_text_from_pdf(self, db):
        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes("Factura Proveedor PDF SA 0001-00000099")

        text = service.extract_pdf_text(pdf_bytes)

        assert "Factura Proveedor PDF SA" in text

    def test_blank_pdf_returns_empty_text(self, db):
        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes(None)

        text = service.extract_pdf_text(pdf_bytes)

        assert text.strip() == ""


class TestCreateDraftFromPdf:
    """RED → el flujo completo: PDF -> IA (mockeada) -> draft editable."""

    async def test_full_match_creates_draft_with_matched_fields(
        self, db, business_a, user_a, supplier_a, product_a, monkeypatch
    ):
        extracted = {
            "supplier_name": "Proveedor PDF SA",
            "invoice_number": "0001-00000099",
            "invoice_date": "2026-07-29",
            "items": [
                {
                    "code": "AI-001",
                    "description": "Caño PVC 1/2 IA",
                    "quantity": 5,
                    "unit_cost": 80,
                    "iva_rate": 21,
                }
            ],
        }
        _mock_llm(monkeypatch, extracted)

        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes("Factura Proveedor PDF SA")

        invoice, is_duplicate = await service.create_draft_from_pdf(
            business_id=business_a.id,
            user_id=user_a.id,
            pdf_bytes=pdf_bytes,
            source_document_key="invoices/2026/07/factura.pdf",
        )

        assert invoice.status == PurchaseInvoiceStatus.DRAFT
        assert invoice.source == PurchaseInvoiceSource.AI
        assert invoice.supplier_id == supplier_a.id
        assert invoice.invoice_number == "0001-00000099"
        assert invoice.source_document_key == "invoices/2026/07/factura.pdf"
        assert is_duplicate is False

        assert len(invoice.items) == 1
        assert invoice.items[0].product_id == product_a.id
        assert invoice.items[0].quantity == Decimal("5")

        # Contrato: la IA NUNCA escribe stock ni precio directamente.
        lots = await db.execute(ProductLot.__table__.select())
        assert lots.fetchall() == []

    async def test_unmatched_supplier_and_product_left_null_no_auto_create(
        self, db, business_a, user_a, monkeypatch
    ):
        """GIVEN el PDF referencia un proveedor/producto inexistente en el sistema
        WHEN la IA extrae la factura
        THEN los campos quedan null en el draft y NO se crea ninguna entidad."""
        extracted = {
            "supplier_name": "Proveedor Desconocido SRL",
            "invoice_number": "9999-00000001",
            "invoice_date": "2026-07-29",
            "items": [
                {
                    "code": "NO-EXISTE",
                    "description": "Producto que no está en el catálogo",
                    "quantity": 3,
                    "unit_cost": 40,
                    "iva_rate": 21,
                }
            ],
        }
        _mock_llm(monkeypatch, extracted)

        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes("Factura de un proveedor desconocido")

        invoice, _ = await service.create_draft_from_pdf(
            business_id=business_a.id,
            user_id=user_a.id,
            pdf_bytes=pdf_bytes,
        )

        assert invoice.supplier_id is None
        assert invoice.items[0].product_id is None
        assert invoice.items[0].description == "Producto que no está en el catálogo"
        assert invoice.status == PurchaseInvoiceStatus.DRAFT  # igual se creó el draft

        suppliers = await db.execute(Supplier.__table__.select())
        assert suppliers.fetchall() == []  # nunca se auto-creó

        products = await db.execute(Product.__table__.select())
        assert products.fetchall() == []  # nunca se auto-creó

    async def test_malformed_pdf_raises_without_creating_partial_draft(
        self, db, business_a, user_a, monkeypatch
    ):
        """GIVEN un PDF sin texto extraíble
        WHEN se intenta parsear
        THEN lanza InvoiceAIParseError SIN crear ningún draft parcial."""
        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes(None)

        with pytest.raises(InvoiceAIParseError):
            await service.create_draft_from_pdf(
                business_id=business_a.id,
                user_id=user_a.id,
                pdf_bytes=pdf_bytes,
            )

        from app.models.purchase_invoice import PurchaseInvoice

        result = await db.execute(PurchaseInvoice.__table__.select())
        assert result.fetchall() == []

    async def test_llm_returns_invalid_json_raises_parse_error(
        self, db, business_a, user_a, monkeypatch
    ):
        """GIVEN la IA responde con contenido que no es JSON válido
        WHEN se intenta parsear
        THEN lanza InvoiceAIParseError sin crear draft."""

        async def fake_resolve(business_id, db):
            return ("openai", "sk-test-fake", "gpt-4o")

        monkeypatch.setattr(LLMFactory, "resolve", fake_resolve)
        monkeypatch.setattr(
            LLMFactory,
            "build_openai_compatible",
            lambda api_key, provider, base_url=None: _FakeOpenAIClient(
                "esto no es JSON"
            ),
        )

        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes("Factura con respuesta IA rota")

        with pytest.raises(InvoiceAIParseError):
            await service.create_draft_from_pdf(
                business_id=business_a.id,
                user_id=user_a.id,
                pdf_bytes=pdf_bytes,
            )

        from app.models.purchase_invoice import PurchaseInvoice

        result = await db.execute(PurchaseInvoice.__table__.select())
        assert result.fetchall() == []

    async def test_duplicate_detected_on_ai_load(
        self, db, business_a, user_a, supplier_a, monkeypatch
    ):
        """GIVEN ya existe una factura con supplier+número
        WHEN la IA extrae un draft con el mismo supplier+número
        THEN se crea igual (no bloquea) pero is_duplicate=True."""
        from datetime import date

        from app.schemas.purchase_invoice import (
            PurchaseInvoiceCreate,
            PurchaseInvoiceItemCreate,
        )
        from app.services.purchase_invoice_service import PurchaseInvoiceService

        invoice_service = PurchaseInvoiceService(db)
        await invoice_service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=PurchaseInvoiceCreate(
                supplier_id=supplier_a.id,
                invoice_number="DUP-001",
                invoice_date=date(2026, 7, 29),
                items=[
                    PurchaseInvoiceItemCreate(description="Original", quantity=Decimal("1"))
                ],
            ),
        )

        extracted = {
            "supplier_name": "Proveedor PDF SA",
            "invoice_number": "DUP-001",
            "invoice_date": "2026-07-29",
            "items": [
                {"code": None, "description": "Ítem IA", "quantity": 2, "unit_cost": 10, "iva_rate": 21}
            ],
        }
        _mock_llm(monkeypatch, extracted)

        service = InvoiceAIService(db)
        pdf_bytes = _make_pdf_bytes("Factura duplicada")

        invoice, is_duplicate = await service.create_draft_from_pdf(
            business_id=business_a.id,
            user_id=user_a.id,
            pdf_bytes=pdf_bytes,
        )

        assert invoice.id is not None
        assert is_duplicate is True
