from typing import Optional
from src.agent.extractor import ExtractedInvoice, LineModification

MANDATORY_FIELDS = ["client_id", "lines", "tva_rate"]


def normalize_client_name(first: Optional[str], last: Optional[str]) -> Optional[str]:
    """Combines first and last name into a single string. Returns None if both are None."""
    parts = [p for p in (first, last) if p]
    return " ".join(parts) if parts else None


def build_invoice_lines(extracted: ExtractedInvoice) -> Optional[list[dict]]:
    """Build invoice lines list from extracted data.

    Prefers extracted.lines (multi-item). Falls back to flat description/qty/unit_price fields.
    Returns None if insufficient data.
    """
    # Multi-item path
    if extracted.lines:
        result = []
        for line in extracted.lines:
            unit_price = line.unit_price
            if unit_price is None and line.amount is not None:
                qty = line.qty or 1.0
                unit_price = line.amount / qty
            result.append({
                "description": line.description,
                "qty": float(line.qty or 1.0),
                "unit_price": float(unit_price or 0.0),
            })
        return result or None

    # Single-item fallback
    if not extracted.description:
        return None

    unit_price = extracted.unit_price
    if unit_price is None and extracted.amount is not None:
        qty = extracted.qty or 1.0
        unit_price = extracted.amount / qty

    return [{
        "description": extracted.description,
        "qty": float(extracted.qty or 1.0),
        "unit_price": float(unit_price or 0.0),
    }]


def apply_line_modifications(current_lines: list[dict], mods: list[LineModification]) -> list[dict]:
    """Apply add/remove/update operations on the current lines list. Returns the new list."""
    lines = [dict(l) for l in current_lines]

    for mod in mods:
        if mod.action == "add":
            unit_price = mod.unit_price
            if unit_price is None and mod.amount is not None:
                qty = mod.qty or 1.0
                unit_price = mod.amount / qty
            lines.append({
                "description": mod.description or "Service",
                "qty": float(mod.qty or 1.0),
                "unit_price": float(unit_price or 0.0),
            })

        elif mod.action == "remove" and mod.target:
            target_lower = mod.target.lower()
            lines = [l for l in lines if target_lower not in l.get("description", "").lower()]

        elif mod.action == "update" and mod.target:
            target_lower = mod.target.lower()
            for line in lines:
                if target_lower in line.get("description", "").lower():
                    if mod.description:
                        line["description"] = mod.description
                    if mod.qty is not None:
                        line["qty"] = float(mod.qty)
                    if mod.unit_price is not None:
                        line["unit_price"] = float(mod.unit_price)
                    elif mod.amount is not None:
                        qty = mod.qty or line.get("qty", 1.0)
                        line["unit_price"] = float(mod.amount / qty)
                    break

    return lines


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
