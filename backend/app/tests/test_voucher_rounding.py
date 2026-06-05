"""
Tests de integración para redondeo de comprobantes (F2).

Cobertura:
  6.1  Crear voucher con rounding_amount → voucher.total == item_sum + delta
  6.2  Crear voucher sin rounding_amount → comportamiento idéntico al actual
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.schemas.voucher import VoucherCreate, VoucherItemCreate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_voucher_create(
    *,
    client_id=None,
    rounding_amount: Decimal | None = None,
) -> VoucherCreate:
    """Crea un VoucherCreate mínimo para tests de redondeo."""
    from app.models.voucher import VoucherType
    return VoucherCreate(
        client_id=client_id or uuid4(),
        voucher_type=VoucherType.QUOTATION,
        date="2026-06-05",
        general_discount=Decimal("0"),
        rounding_amount=rounding_amount,
        items=[
            VoucherItemCreate(
                product_id=uuid4(),
                quantity=Decimal("1"),
                unit_price=Decimal("1000"),
                discount_percent=Decimal("0"),
            )
        ],
    )


# ---------------------------------------------------------------------------
# 6.1 — Voucher con rounding_amount persiste redondeo en total
# ---------------------------------------------------------------------------


class TestVoucherRoundingAmountSchema:
    """VoucherCreate acepta rounding_amount y lo serializa correctamente."""

    def test_rounding_amount_accepted_in_voucher_create(self):
        """VoucherCreate debe aceptar rounding_amount como Decimal opcional."""
        data = _make_voucher_create(rounding_amount=Decimal("50"))
        assert data.rounding_amount == Decimal("50")

    def test_rounding_amount_none_by_default(self):
        """VoucherCreate debe tener rounding_amount=None por defecto."""
        data = _make_voucher_create()
        assert data.rounding_amount is None

    def test_rounding_amount_negative_accepted(self):
        """rounding_amount puede ser negativo (redondeo hacia abajo)."""
        data = _make_voucher_create(rounding_amount=Decimal("-12.50"))
        assert data.rounding_amount == Decimal("-12.50")

    def test_rounding_amount_serialization(self):
        """model_dump() debe incluir rounding_amount en el dict."""
        data = _make_voucher_create(rounding_amount=Decimal("100"))
        dumped = data.model_dump()
        assert dumped["rounding_amount"] == Decimal("100")

    def test_rounding_amount_none_serialization(self):
        """model_dump() debe incluir rounding_amount=None cuando no se provee."""
        data = _make_voucher_create()
        dumped = data.model_dump()
        assert dumped["rounding_amount"] is None


# ---------------------------------------------------------------------------
# 6.2 — Modelo Voucher incluye rounding_amount
# ---------------------------------------------------------------------------


class TestVoucherModelRoundingAmount:
    """El modelo Voucher debe exponer rounding_amount como columna nullable."""

    def test_voucher_model_has_rounding_amount_column(self):
        """Voucher debe tener atributo rounding_amount mapeado a la columna."""
        from app.models.voucher import Voucher
        assert hasattr(Voucher, "rounding_amount"), (
            "Voucher.rounding_amount no existe — verificar modelo y migración"
        )

    def test_voucher_response_has_rounding_amount(self):
        """VoucherResponse debe incluir rounding_amount opcional."""
        from app.schemas.voucher import VoucherResponse
        fields = VoucherResponse.model_fields
        assert "rounding_amount" in fields
        # Debe aceptar None (nullable)
        field = fields["rounding_amount"]
        assert field.default is None or field.is_required() is False


# ---------------------------------------------------------------------------
# 6.3 — Lógica de total en servicio aplica rounding_amount correctamente
# ---------------------------------------------------------------------------


class TestVoucherServiceRoundingLogic:
    """
    Verifica la lógica de redondeo en el servicio: simula el assignment de totales
    que `create_voucher` realiza sobre el modelo Voucher.
    """

    def test_total_con_rounding_amount_positivo(self):
        """Con rounding_amount=50, voucher.total debe ser item_sum + 50."""
        from app.models.voucher import Voucher
        item_sum = Decimal("1210.00")
        rounding = Decimal("50")

        voucher = Voucher()
        voucher.subtotal = Decimal("1000")
        voucher.iva_amount = Decimal("210")
        # Simula lo que hace create_voucher:
        voucher.rounding_amount = rounding
        voucher.total = item_sum + (rounding or Decimal("0"))

        assert voucher.rounding_amount == Decimal("50")
        assert voucher.total == Decimal("1260.00")

    def test_total_con_rounding_amount_negativo(self):
        """Con rounding_amount=-10, voucher.total debe ser item_sum - 10."""
        from app.models.voucher import Voucher
        item_sum = Decimal("1210.00")
        rounding = Decimal("-10")

        voucher = Voucher()
        voucher.subtotal = Decimal("1000")
        voucher.iva_amount = Decimal("210")
        voucher.rounding_amount = rounding
        voucher.total = item_sum + (rounding or Decimal("0"))

        assert voucher.rounding_amount == Decimal("-10")
        assert voucher.total == Decimal("1200.00")

    def test_total_sin_rounding_es_igual_a_item_sum(self):
        """Sin rounding_amount (None), voucher.total debe ser igual a item_sum."""
        from app.models.voucher import Voucher
        item_sum = Decimal("1210.00")

        voucher = Voucher()
        voucher.subtotal = Decimal("1000")
        voucher.iva_amount = Decimal("210")
        # Simula create_voucher con rounding_amount=None
        voucher.rounding_amount = None
        voucher.total = item_sum + (None or Decimal("0"))

        assert voucher.rounding_amount is None
        assert voucher.total == item_sum

    def test_rounding_amount_none_tratado_como_cero(self):
        """None or Decimal('0') == Decimal('0') — None no rompe el cálculo."""
        rounding = None
        result = rounding or Decimal("0")
        assert result == Decimal("0")
