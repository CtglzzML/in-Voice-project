import pytest
from src.agent.business_logic import build_invoice_lines, normalize_client_name, validate_invoice
from src.agent.extractor import ExtractedInvoice


# --- normalize_client_name ---

def test_normalize_client_name_both_parts():
    assert normalize_client_name("Marie", "Dupont") == "Marie Dupont"


def test_normalize_client_name_first_only():
    assert normalize_client_name("Marie", None) == "Marie"


def test_normalize_client_name_last_only():
    assert normalize_client_name(None, "Dupont") == "Dupont"


def test_normalize_client_name_both_none():
    assert normalize_client_name(None, None) is None


# --- build_invoice_lines ---

def test_build_invoice_lines_with_unit_price():
    extracted = ExtractedInvoice(description="Web dev", qty=3.0, unit_price=150.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Web dev", "qty": 3.0, "unit_price": 150.0}]


def test_build_invoice_lines_with_amount_no_unit_price():
    extracted = ExtractedInvoice(description="Logo design", qty=1.0, amount=500.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Logo design", "qty": 1.0, "unit_price": 500.0}]


def test_build_invoice_lines_with_amount_and_qty():
    extracted = ExtractedInvoice(description="Consulting", qty=4.0, amount=800.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Consulting", "qty": 4.0, "unit_price": 200.0}]


def test_build_invoice_lines_no_description_returns_none():
    extracted = ExtractedInvoice(qty=3.0, unit_price=150.0)
    assert build_invoice_lines(extracted) is None


def test_build_invoice_lines_no_price_returns_none():
    extracted = ExtractedInvoice(description="Web dev", qty=3.0)
    assert build_invoice_lines(extracted) is None


def test_build_invoice_lines_defaults_qty_to_one():
    extracted = ExtractedInvoice(description="Logo", unit_price=300.0)
    lines = build_invoice_lines(extracted)
    assert lines[0]["qty"] == 1.0


# --- validate_invoice ---

def test_validate_invoice_passes_when_all_fields_present():
    draft = {"client_id": "c1", "lines": [{"description": "Dev", "qty": 1, "unit_price": 500}], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is True
    assert result["errors"] == []


def test_validate_invoice_fails_when_client_id_missing():
    draft = {"lines": [{"description": "Dev", "qty": 1, "unit_price": 500}], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("client_id" in e for e in result["errors"])


def test_validate_invoice_fails_when_lines_empty():
    draft = {"client_id": "c1", "lines": [], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("lines" in e for e in result["errors"])


def test_validate_invoice_fails_when_tva_rate_missing():
    draft = {"client_id": "c1", "lines": [{"description": "Dev", "qty": 1, "unit_price": 500}]}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("tva_rate" in e for e in result["errors"])
