from decimal import Decimal
from src.db.models import InvoiceLine, InvoiceTotals, UserProfile, Client, compute_totals


def test_invoice_line_total_is_qty_times_unit_price():
    line = InvoiceLine(description="Dev web", qty=Decimal("1.5"), unit_price=Decimal("800"))
    assert line.total == Decimal("1200.00")


def test_compute_totals_with_tva():
    lines = [
        InvoiceLine(description="Dev web", qty=Decimal("1"), unit_price=Decimal("1000")),
    ]
    totals = compute_totals(lines, tva_rate=Decimal("20"))
    assert totals.subtotal == Decimal("1000")
    assert totals.tva_amount == Decimal("200")
    assert totals.total == Decimal("1200")


# Tests for UserProfile.missing_mandatory_fields()
def test_user_profile_missing_mandatory_fields_returns_empty_when_all_present():
    profile = UserProfile(id="u1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    assert profile.missing_mandatory_fields() == []


def test_user_profile_missing_mandatory_fields_returns_missing_ones():
    profile = UserProfile(id="u1")
    missing = profile.missing_mandatory_fields()
    assert "name" in missing
    assert "siret" in missing
    assert "address" in missing
    assert "default_tva" in missing


def test_user_profile_partial_missing():
    profile = UserProfile(id="u1", name="Alice", siret="123")
    missing = profile.missing_mandatory_fields()
    assert missing == ["address", "default_tva"]


# Tests for Client model
def test_client_model_with_required_fields():
    client = Client(user_id="u1", name="Marie Dupont")
    assert client.name == "Marie Dupont"
    assert client.id is None
    assert client.email is None


def test_client_model_with_all_fields():
    client = Client(id="c1", user_id="u1", name="Marie Dupont", email="marie@example.com", address="Lyon", company="SARL")
    assert client.company == "SARL"


def test_compute_totals_with_empty_lines():
    totals = compute_totals([], tva_rate=Decimal("20"))
    assert totals.subtotal == Decimal("0.00")
    assert totals.tva_amount == Decimal("0.00")
    assert totals.total == Decimal("0.00")


def test_invoice_line_total_rounds_half_up():
    # 1 * 0.005 = 0.005, ROUND_HALF_UP → 0.01
    line = InvoiceLine(description="Test", qty=Decimal("1"), unit_price=Decimal("0.005"))
    assert line.total == Decimal("0.01")
