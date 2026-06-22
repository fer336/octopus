"""B2B price list item price calculation helper."""

from decimal import ROUND_HALF_UP, Decimal


def calculate_price_list_item_prices(
    base_price: Decimal,
    discount_percent: Decimal = Decimal("0"),
    surcharge_percent: Decimal = Decimal("0"),
    tax_percent: Decimal = Decimal("21"),
    includes_tax: bool = True,
) -> tuple[Decimal, Decimal]:
    """
    Return (net_price, final_price) rounded to 2 decimal places.

    includes_tax=True: base_price already includes tax.
      Apply discount/surcharge to base, then back-calculate net.
    includes_tax=False: base_price is the net price before tax.
      Apply discount/surcharge to base, then add tax.
    """
    two = Decimal("0.01")
    discount_factor = Decimal("1") - discount_percent / Decimal("100")
    surcharge_factor = Decimal("1") + surcharge_percent / Decimal("100")
    tax_factor = Decimal("1") + tax_percent / Decimal("100")

    if includes_tax:
        final_price = (base_price * discount_factor * surcharge_factor).quantize(
            two, rounding=ROUND_HALF_UP
        )
        net_price = (final_price / tax_factor).quantize(two, rounding=ROUND_HALF_UP)
    else:
        net_price = (base_price * discount_factor * surcharge_factor).quantize(
            two, rounding=ROUND_HALF_UP
        )
        final_price = (net_price * tax_factor).quantize(two, rounding=ROUND_HALF_UP)

    return net_price, final_price
