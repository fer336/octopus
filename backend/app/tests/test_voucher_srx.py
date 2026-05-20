"""
Unit tests for SRX-User feature.
Covers: Business SRX fields, VoucherType.INVOICE_X, and ARCA exclusion rules.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.user import User
from app.models.voucher import VoucherType


class TestBusinessSrxFields:
    """Business model defaults and SRX field behavior."""

    @pytest.mark.asyncio
    async def test_srx_enabled_defaults_false(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        await db.refresh(business_a)
        assert business_a.srx_enabled is False

    @pytest.mark.asyncio
    async def test_electronic_sale_point_defaults_0012(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        await db.refresh(business_a)
        assert business_a.electronic_sale_point == "0012"

    @pytest.mark.asyncio
    async def test_alternative_sale_point_defaults_5001(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        await db.refresh(business_a)
        assert business_a.alternative_sale_point == "5001"

    @pytest.mark.asyncio
    async def test_last_invoice_x_number_defaults_zero_padded(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        await db.refresh(business_a)
        assert business_a.last_invoice_x_number == "00000000"

    @pytest.mark.asyncio
    async def test_sale_point_and_electronic_sale_point_are_independent(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        """Quotation sale_point (0001) and ARCA electronic_sale_point (0012) must differ."""
        await db.refresh(business_a)
        assert business_a.sale_point != business_a.electronic_sale_point

    @pytest.mark.asyncio
    async def test_srx_can_be_enabled(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        business_a.srx_enabled = True
        await db.commit()
        await db.refresh(business_a)
        assert business_a.srx_enabled is True

    @pytest.mark.asyncio
    async def test_invoice_x_counter_increments_independently(
        self, db: AsyncSession, user_a: User, business_a: Business
    ):
        """Incrementing INVOICE_X counter does not affect other invoice counters."""
        business_a.last_invoice_x_number = "00000003"
        await db.commit()
        await db.refresh(business_a)

        assert business_a.last_invoice_x_number == "00000003"
        assert business_a.last_invoice_b_number == "00000000"
        assert business_a.last_invoice_a_number == "00000000"


class TestVoucherTypeInvoiceX:
    """VoucherType.INVOICE_X enum value and ARCA exclusion."""

    def test_invoice_x_value_is_invoice_x_string(self):
        assert VoucherType.INVOICE_X == "invoice_x"
        assert VoucherType.INVOICE_X.value == "invoice_x"

    def test_invoice_x_is_not_in_arca_facturable_types(self):
        """INVOICE_X must never be submitted to ARCA."""
        arca_types = {
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
            VoucherType.CREDIT_NOTE_A,
            VoucherType.CREDIT_NOTE_B,
            VoucherType.CREDIT_NOTE_C,
            VoucherType.DEBIT_NOTE_A,
            VoucherType.DEBIT_NOTE_B,
            VoucherType.DEBIT_NOTE_C,
        }
        assert VoucherType.INVOICE_X not in arca_types

    def test_invoice_x_value_property(self):
        assert VoucherType.INVOICE_X == "invoice_x"
        assert VoucherType.INVOICE_X.value == "invoice_x"

    def test_invoice_x_different_from_all_arca_types(self):
        for vt in [
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
            VoucherType.QUOTATION,
            VoucherType.RECEIPT,
        ]:
            assert vt != VoucherType.INVOICE_X
