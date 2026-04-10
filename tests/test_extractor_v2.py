import pytest
from src.agent.extractor import ExtractedInvoice


def test_extracted_invoice_has_confidence_score():
    e = ExtractedInvoice(confidence_score=0.8, missing_fields=["due_date"])
    assert e.confidence_score == 0.8


def test_extracted_invoice_has_missing_fields():
    e = ExtractedInvoice(confidence_score=0.5, missing_fields=["due_date", "tva_rate"])
    assert "due_date" in e.missing_fields
    assert "tva_rate" in e.missing_fields


def test_confidence_score_defaults_to_zero():
    e = ExtractedInvoice()
    assert e.confidence_score == 0.0


def test_missing_fields_defaults_to_empty():
    e = ExtractedInvoice()
    assert e.missing_fields == []
