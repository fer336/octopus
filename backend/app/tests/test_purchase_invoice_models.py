"""
Tests para modelos PurchaseInvoice y PurchaseInvoiceItem (Compras — PR1).
"""
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.product import Product
from app.models.purchase_invoice import (
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseInvoiceSource,
    PurchaseInvoiceStatus,
)

pytestmark = pytest.mark.asyncio


class TestPurchaseInvoiceModel:
    """RED → PurchaseInvoice se crea y persiste correctamente."""

    async def test_create_manual_draft_defaults(self, db, business_a, user_a):
        """GREEN → Crear draft manual con defaults correctos."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000123",
            invoice_date=date(2026, 7, 29),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)

        assert invoice.id is not None
        assert invoice.status == PurchaseInvoiceStatus.DRAFT
        assert invoice.source == PurchaseInvoiceSource.MANUAL
        assert invoice.update_prices is False
        assert invoice.is_duplicate_ack is False
        assert invoice.supplier_id is None
        assert invoice.purchase_order_id is None

    async def test_create_ai_draft(self, db, business_a, user_a):
        """TRIANGULATE → source=ai persiste distinto de manual."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.AI,
            invoice_number="0001-00000124",
            invoice_date=date(2026, 7, 28),
            created_by=user_a.id,
            source_document_key="invoices/2026/07/factura.pdf",
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)

        assert invoice.source == PurchaseInvoiceSource.AI
        assert invoice.source_document_key == "invoices/2026/07/factura.pdf"

    async def test_status_enum_confirmed(self, db, business_a, user_a):
        """TRIANGULATE → status puede pasar a confirmed."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000125",
            invoice_date=date(2026, 7, 27),
            created_by=user_a.id,
            status=PurchaseInvoiceStatus.CONFIRMED,
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)

        assert invoice.status == PurchaseInvoiceStatus.CONFIRMED

    async def test_business_id_required(self, db, user_a):
        """GREEN → business_id es obligatorio (NOT NULL)."""
        invoice = PurchaseInvoice(
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000126",
            invoice_date=date(2026, 7, 26),
            created_by=user_a.id,
        )
        db.add(invoice)
        with pytest.raises(IntegrityError):
            await db.commit()

    async def test_optional_supplier_and_purchase_order(self, db, business_a, user_a):
        """GREEN → supplier_id y purchase_order_id son opcionales (confirm sin PO)."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            supplier_id=None,
            purchase_order_id=None,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000127",
            invoice_date=date(2026, 7, 25),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)

        assert invoice.supplier_id is None
        assert invoice.purchase_order_id is None

    async def test_soft_delete_fields(self, db, business_a, user_a):
        """GREEN → deleted_by y deletion_reason son opcionales y soft_delete funciona."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000128",
            invoice_date=date(2026, 7, 24),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)

        assert invoice.deleted_by is None
        assert invoice.deletion_reason is None
        assert invoice.is_deleted is False

        invoice.soft_delete()
        invoice.deleted_by = user_a.id
        invoice.deletion_reason = "Cargada por error"
        await db.commit()
        await db.refresh(invoice)

        assert invoice.is_deleted is True
        assert invoice.deleted_by == user_a.id
        assert invoice.deletion_reason == "Cargada por error"


@pytest.mark.asyncio
class TestPurchaseInvoiceItemModel:
    """RED → PurchaseInvoiceItem se crea y persiste correctamente."""

    async def test_create_item_with_product(self, db, business_a, user_a):
        """GREEN → Crear ítem vinculado a un producto matcheado."""
        product = Product(
            business_id=business_a.id,
            code="PVC-001",
            description="Caño PVC 1/2",
        )
        db.add(product)
        await db.flush()

        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000129",
            invoice_date=date(2026, 7, 23),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.flush()

        item = PurchaseInvoiceItem(
            purchase_invoice_id=invoice.id,
            product_id=product.id,
            description="Caño PVC 1/2",
            quantity=10,
            unit_cost=100,
            iva_rate=21,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        assert item.id is not None
        assert item.product_id == product.id
        assert item.lot_id is None
        assert item.expiration_date is None

    async def test_create_item_without_product_uses_description_fallback(
        self, db, business_a, user_a
    ):
        """TRIANGULATE → product_id es opcional (AI no matcheó producto), queda solo texto crudo."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.AI,
            invoice_number="0001-00000130",
            invoice_date=date(2026, 7, 22),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.flush()

        item = PurchaseInvoiceItem(
            purchase_invoice_id=invoice.id,
            product_id=None,
            description="Producto sin matchear en el sistema",
            quantity=5,
            unit_cost=50,
            iva_rate=21,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        assert item.product_id is None
        assert item.description == "Producto sin matchear en el sistema"

    async def test_items_relationship_cascade_delete_orphan(
        self, db, business_a, user_a
    ):
        """GREEN → Eliminar el invoice borra sus ítems (cascade delete-orphan)."""
        invoice = PurchaseInvoice(
            business_id=business_a.id,
            source=PurchaseInvoiceSource.MANUAL,
            invoice_number="0001-00000131",
            invoice_date=date(2026, 7, 21),
            created_by=user_a.id,
        )
        db.add(invoice)
        await db.flush()

        item = PurchaseInvoiceItem(
            purchase_invoice_id=invoice.id,
            product_id=None,
            description="Item a eliminar",
            quantity=1,
            unit_cost=10,
            iva_rate=21,
        )
        db.add(item)
        await db.commit()
        item_id = item.id

        await db.delete(invoice)
        await db.commit()

        result = await db.get(PurchaseInvoiceItem, item_id)
        assert result is None
