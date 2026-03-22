from decimal import Decimal
from src.db.models import InvoiceLine, compute_totals


def test_invoice_line_total_is_qty_times_unit_price():
    line = InvoiceLine(description="Dev web", qty=Decimal("1.5"), unit_price=Decimal("800"))
    assert line.total == Decimal("1200.00")


def test_compute_totals_with_tva():
    from src.db.models import InvoiceTotals
    lines = [
        InvoiceLine(description="Dev web", qty=Decimal("1"), unit_price=Decimal("1000")),
    ]
    totals = compute_totals(lines, tva_rate=Decimal("20"))
    assert totals.subtotal == Decimal("1000")
    assert totals.tva_amount == Decimal("200")
    assert totals.total == Decimal("1200")
