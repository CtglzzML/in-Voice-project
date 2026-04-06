from typing import Optional
from src.agent.extractor import ExtractedInvoice

MANDATORY_FIELDS = ["client_id", "lines", "tva_rate"]


def normalize_client_name(first: Optional[str], last: Optional[str]) -> Optional[str]:
    """Combines first and last name into a single string. Returns None if both are None."""
    parts = [p for p in (first, last) if p]
    return " ".join(parts) if parts else None


def build_invoice_lines(extracted: ExtractedInvoice) -> Optional[list[dict]]:
    """Build invoice lines list from extracted data. Returns None if insufficient data."""
    if not extracted.description:
        return None

    unit_price = extracted.unit_price
    if unit_price is None and extracted.amount is not None:
        qty = extracted.qty or 1.0
        unit_price = extracted.amount / qty

    if unit_price is None:
        return None

    return [{
        "description": extracted.description,
        "qty": float(extracted.qty or 1.0),
        "unit_price": float(unit_price),
    }]


def validate_invoice(draft: dict) -> dict:
    """Validates mandatory invoice fields. Returns {is_valid: bool, errors: list[str]}."""
    errors = []

    if not draft.get("client_id"):
        errors.append("client_id is required")

    lines = draft.get("lines")
    if not lines:
        errors.append("lines must be non-empty")

    if draft.get("tva_rate") is None:
        errors.append("tva_rate is required")

    return {"is_valid": len(errors) == 0, "errors": errors}
