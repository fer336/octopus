"""
Tests para schemas Pydantic de Facturas de Compra (Compras — PR2, tarea 1.5).
"""
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.purchase_invoice import (
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemCreate,
    PurchaseInvoiceReversalRequest,
    PurchaseInvoiceUpdate,
)


class TestPurchaseInvoiceItemCreate:
    """RED → validaciones de ítem de factura de compra."""

    def test_valid_item(self):
        """GREEN → ítem válido con producto matcheado."""
        item = PurchaseInvoiceItemCreate(
            product_id="11111111-1111-1111-1111-111111111111",
            description="Caño PVC 1/2",
            quantity=Decimal("10"),
            unit_cost=Decimal("100.00"),
            iva_rate=Decimal("21.00"),
        )
        assert item.quantity == Decimal("10")

    def test_item_without_product_id_allowed(self):
        """GREEN → product_id es opcional (IA sin match)."""
        item = PurchaseInvoiceItemCreate(
            description="Producto sin matchear",
            quantity=Decimal("1"),
        )
        assert item.product_id is None

    def test_quantity_must_be_positive(self):
        """RED → quantity <= 0 debe rechazarse."""
        with pytest.raises(ValidationError):
            PurchaseInvoiceItemCreate(
                description="Ítem inválido",
                quantity=Decimal("0"),
            )

    def test_unit_cost_defaults_to_zero(self):
        """GREEN → unit_cost tiene default 0 (draft IA sin costo aún matcheado)."""
        item = PurchaseInvoiceItemCreate(description="X", quantity=Decimal("1"))
        assert item.unit_cost == Decimal("0")

    def test_unit_cost_cannot_be_negative(self):
        """RED → unit_cost negativo debe rechazarse."""
        with pytest.raises(ValidationError):
            PurchaseInvoiceItemCreate(
                description="Ítem inválido",
                quantity=Decimal("1"),
                unit_cost=Decimal("-1"),
            )


class TestPurchaseInvoiceCreate:
    """RED → validaciones de creación de factura (carga manual)."""

    def test_valid_create(self):
        """GREEN → payload válido con al menos un ítem."""
        data = PurchaseInvoiceCreate(
            invoice_number="0001-00000123",
            invoice_date=date(2026, 7, 29),
            items=[
                PurchaseInvoiceItemCreate(description="Ítem 1", quantity=Decimal("1")),
            ],
        )
        assert data.supplier_id is None
        assert data.purchase_order_id is None
        assert len(data.items) == 1

    def test_items_required(self):
        """RED → una factura sin ítems debe rechazarse."""
        with pytest.raises(ValidationError):
            PurchaseInvoiceCreate(
                invoice_number="0001-00000123",
                invoice_date=date(2026, 7, 29),
                items=[],
            )

    def test_invoice_number_required(self):
        """RED → invoice_number vacío debe rechazarse."""
        with pytest.raises(ValidationError):
            PurchaseInvoiceCreate(
                invoice_number="",
                invoice_date=date(2026, 7, 29),
                items=[
                    PurchaseInvoiceItemCreate(description="Ítem 1", quantity=Decimal("1")),
                ],
            )


class TestPurchaseInvoiceUpdate:
    """GREEN → todos los campos son opcionales (edición parcial de borrador)."""

    def test_empty_update_is_valid(self):
        update = PurchaseInvoiceUpdate()
        assert update.items is None
        assert update.invoice_number is None


class TestPurchaseInvoiceConfirmRequest:
    """GREEN → defaults de los toggles de confirmación."""

    def test_defaults_match_spec(self):
        """update_stock default True, update_prices default False (spec)."""
        confirm = PurchaseInvoiceConfirmRequest()
        assert confirm.update_stock is True
        assert confirm.update_prices is False

    def test_both_toggles_can_be_set(self):
        confirm = PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=True)
        assert confirm.update_prices is True


class TestPurchaseInvoiceReversalRequest:
    """GREEN → force_adjustment default False (no debe aplicar ajuste silencioso)."""

    def test_force_adjustment_defaults_to_false(self):
        reversal = PurchaseInvoiceReversalRequest()
        assert reversal.force_adjustment is False
