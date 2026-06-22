"""Unit tests for the B2B price calculation helper."""

from decimal import Decimal

import pytest

from app.services.price_list_pricing import calculate_price_list_item_prices


def test_includes_tax_no_adjustments():
    """Base price includes IVA 21%; no discount or surcharge."""
    # base_price = 121 (includes 21% IVA), so net = 100
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("121"),
        discount_percent=Decimal("0"),
        surcharge_percent=Decimal("0"),
        tax_percent=Decimal("21"),
        includes_tax=True,
    )
    assert final == Decimal("121.00")
    assert net == Decimal("100.00")


def test_includes_tax_false_zero_tax():
    """Price without IVA (tax_percent=0): net == base, final == net."""
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("100"),
        discount_percent=Decimal("0"),
        surcharge_percent=Decimal("0"),
        tax_percent=Decimal("0"),
        includes_tax=True,
    )
    assert final == Decimal("100.00")
    assert net == Decimal("100.00")


def test_discount_and_surcharge_combined_includes_tax():
    """10% discount and 5% surcharge on a price that includes 21% IVA."""
    # base=121, discount_factor=0.9, surcharge_factor=1.05
    # final = 121 * 0.9 * 1.05 = 114.345 → rounds to 114.35
    # net = 114.35 / 1.21 = 94.5041... → rounds to 94.50
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("121"),
        discount_percent=Decimal("10"),
        surcharge_percent=Decimal("5"),
        tax_percent=Decimal("21"),
        includes_tax=True,
    )
    assert final == Decimal("114.35")
    assert net == Decimal("94.50")


def test_rounding_to_two_decimals():
    """Ensure the result is always quantized to exactly 2 decimal places."""
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("99.999"),
        discount_percent=Decimal("0"),
        surcharge_percent=Decimal("0"),
        tax_percent=Decimal("21"),
        includes_tax=True,
    )
    # final = 99.999 → rounds to 100.00; net = 100.00 / 1.21 = 82.6446... → 82.64
    assert final == Decimal("100.00")
    assert str(net).count(".") == 1 and len(str(net).split(".")[1]) == 2


def test_includes_tax_false_path():
    """includes_tax=False: base is net before tax; final adds tax."""
    # base_price = 100 (net, no IVA), tax 21%
    # net = 100; final = 100 * 1.21 = 121.00
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("100"),
        discount_percent=Decimal("0"),
        surcharge_percent=Decimal("0"),
        tax_percent=Decimal("21"),
        includes_tax=False,
    )
    assert net == Decimal("100.00")
    assert final == Decimal("121.00")


def test_includes_tax_false_with_discount():
    """includes_tax=False: 20% discount applied to net, then tax added."""
    # base=100, discount 20% → net = 80; final = 80 * 1.21 = 96.80
    net, final = calculate_price_list_item_prices(
        base_price=Decimal("100"),
        discount_percent=Decimal("20"),
        surcharge_percent=Decimal("0"),
        tax_percent=Decimal("21"),
        includes_tax=False,
    )
    assert net == Decimal("80.00")
    assert final == Decimal("96.80")
