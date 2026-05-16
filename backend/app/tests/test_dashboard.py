"""Tests del resumen financiero del dashboard."""

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash_register import (
    CashMovement,
    CashMovementType,
    CashPaymentMethod,
    CashRegister,
    CashRegisterStatus,
)
from app.models.client import Client
from app.models.client_account import ClientAccount, MovementType
from app.models.client_type import ClientType
from app.models.stockpile import Stockpile
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.routers.dashboard import get_dashboard_summary


@pytest.mark.asyncio
async def test_dashboard_summary_uses_cash_basis_for_financial_metrics(
    db: AsyncSession,
    business_a,
    user_a,
):
    """El dashboard financiero usa movimientos reales de caja, no total facturado."""
    client_type = ClientType(business_id=business_a.id, name="Consumidor Final")
    db.add(client_type)
    await db.flush()

    client = Client(
        business_id=business_a.id,
        name="Cliente Dashboard",
        client_type_id=client_type.id,
        document_type="DNI",
        document_number="12345678",
        tax_condition="Consumidor Final",
    )
    db.add(client)
    await db.flush()

    cash_register = CashRegister(
        business_id=business_a.id,
        opened_by=user_a.id,
        status=CashRegisterStatus.OPEN,
        opening_amount=Decimal("1000.00"),
        opened_at=datetime(2026, 5, 1, 8, 0, 0),
    )
    db.add(cash_register)
    await db.flush()

    invoice = Voucher(
        business_id=business_a.id,
        client_id=client.id,
        created_by=user_a.id,
        voucher_type=VoucherType.INVOICE_B,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000001",
        date=date(2026, 5, 10),
        subtotal=Decimal("1000.00"),
        iva_amount=Decimal("210.00"),
        total=Decimal("1210.00"),
    )
    db.add(invoice)
    await db.flush()

    stockpile = Stockpile(
        business_id=business_a.id,
        client_id=client.id,
        created_by=user_a.id,
        name="Obra centro",
        stockpile_number="AC-0001",
        initial_amount=Decimal("500.00"),
        remaining_amount=Decimal("500.00"),
    )
    db.add(stockpile)
    await db.flush()

    stockpile_voucher = Voucher(
        business_id=business_a.id,
        client_id=client.id,
        created_by=user_a.id,
        voucher_type=VoucherType.INVOICE_B,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000002",
        date=date(2026, 5, 11),
        subtotal=Decimal("500.00"),
        iva_amount=Decimal("105.00"),
        total=Decimal("605.00"),
        stockpile_id=stockpile.id,
    )
    db.add(stockpile_voucher)
    await db.flush()

    db.add_all(
        [
            CashMovement(
                cash_register_id=cash_register.id,
                type=CashMovementType.SALE,
                payment_method=CashPaymentMethod.CASH,
                amount=Decimal("300.00"),
                description="Cobro parcial factura",
                voucher_id=invoice.id,
                created_by=user_a.id,
                created_at=datetime(2026, 5, 10, 10, 0, 0),
            ),
            CashMovement(
                cash_register_id=cash_register.id,
                type=CashMovementType.SALE,
                payment_method=CashPaymentMethod.TRANSFER,
                amount=Decimal("500.00"),
                description="Cobro acopio",
                voucher_id=stockpile_voucher.id,
                created_by=user_a.id,
                created_at=datetime(2026, 5, 11, 10, 0, 0),
            ),
            CashMovement(
                cash_register_id=cash_register.id,
                type=CashMovementType.PAYMENT_RECEIVED,
                payment_method=CashPaymentMethod.CASH,
                amount=Decimal("200.00"),
                description="Cobro cuenta corriente",
                voucher_id=invoice.id,
                created_by=user_a.id,
                created_at=datetime(2026, 5, 12, 10, 0, 0),
            ),
            CashMovement(
                cash_register_id=cash_register.id,
                type=CashMovementType.INCOME,
                payment_method=CashPaymentMethod.CASH,
                amount=Decimal("50.00"),
                description="Ingreso manual",
                created_by=user_a.id,
                created_at=datetime(2026, 5, 13, 10, 0, 0),
            ),
            CashMovement(
                cash_register_id=cash_register.id,
                type=CashMovementType.EXPENSE,
                payment_method=CashPaymentMethod.CASH,
                amount=Decimal("25.00"),
                description="Egreso manual",
                created_by=user_a.id,
                created_at=datetime(2026, 5, 14, 10, 0, 0),
            ),
        ]
    )

    db.add_all(
        [
            ClientAccount(
                client_id=client.id,
                voucher_id=invoice.id,
                date=date(2026, 5, 10),
                movement_type=MovementType.INVOICE,
                description="Factura cuenta corriente",
                debit=Decimal("1000.00"),
                credit=Decimal("0.00"),
                balance=Decimal("1000.00"),
            ),
            ClientAccount(
                client_id=client.id,
                date=date(2026, 5, 12),
                movement_type=MovementType.PAYMENT,
                description="Pago parcial",
                debit=Decimal("0.00"),
                credit=Decimal("200.00"),
                balance=Decimal("800.00"),
            ),
        ]
    )

    await db.commit()

    summary = await get_dashboard_summary(
        month=5,
        year=2026,
        db=db,
        business_id=business_a.id,
    )

    assert summary.total_sales == 1815.0
    assert summary.cash_income == 1050.0
    assert summary.paid_invoices == 300.0
    assert summary.paid_stockpiles == 500.0
    assert summary.current_account_collected == 200.0
    assert summary.other_income == 50.0
    assert summary.pending_customer_balance == 800.0
