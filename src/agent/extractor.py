# src/agent/extractor.py
"""
Pre-processes the voice transcript into structured data before the agent runs.
Uses LLM structured output (Pydantic) to extract all available info in one shot.
"""
import json
from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class ExtractedLine(BaseModel):
    description: str = Field(description="Clean service/product name without quantities or measurements")
    qty: float = Field(1.0, description="Number of units/hours/days")
    unit_price: Optional[float] = Field(None, description="Price per unit. If only total given: total/qty")
    amount: Optional[float] = Field(None, description="Total for this line if unit_price not separable")


class ExtractedInvoice(BaseModel):
    client_first_name: Optional[str] = Field(None, description="Client's first name")
    client_last_name: Optional[str] = Field(None, description="Client's last name")
    client_address: Optional[str] = Field(None, description="Client's address if mentioned")
    client_email: Optional[str] = Field(None, description="Client's email if mentioned")
    client_phone: Optional[str] = Field(None, description="Client's phone number if mentioned")
    # Multi-line support — preferred over flat fields below
    lines: List[ExtractedLine] = Field(
        default_factory=list,
        description="All invoice line items. Each item is a separate service or product.",
    )
    # Flat fields kept as fallback for single-item transcripts
    description: Optional[str] = Field(None, description="Description of the service/product (single item)")
    amount: Optional[float] = Field(None, description="Total amount excluding tax (single item)")
    qty: Optional[float] = Field(None, description="Quantity or number of hours (default 1, single item)")
    unit_price: Optional[float] = Field(None, description="Unit price excluding tax if mentioned separately (single item)")
    tva_rate: Optional[float] = Field(None, description="VAT rate in % if mentioned (e.g. 20)")
    due_date: Optional[str] = Field(None, description="Due date ISO (YYYY-MM-DD) if mentioned")
    payment_terms: Optional[str] = Field(None, description="Payment terms if mentioned")
    confidence_score: float = Field(0.0, description="Confidence score for the extraction (0.0 to 1.0)")
    missing_fields: List[str] = Field(default_factory=list, description="List of mandatory fields not found in transcript")


async def extract_from_transcript(transcript: str, api_key: str) -> ExtractedInvoice:
    """Extracts all invoice fields from a voice transcript in one structured LLM call."""
    llm = ChatOpenAI(model="gpt-4.1-mini", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(ExtractedInvoice)

    result = await structured.ainvoke(
        f"""You are extracting structured invoice data from a voice transcript.

CRITICAL RULES:
- Extract ALL distinct services or products into the `lines` array (one entry per item).
- Each line: description = clean service name ONLY (no qty/price), qty = number of units/hours/days, unit_price = price per unit.
- If only a total is given for a line: set amount=total, unit_price=null (backend will compute).
- For a single item transcript you may still use `lines` with one entry.
- Also populate the flat fields (description, qty, unit_price, amount) for the FIRST item as fallback.
- description (flat): MUST ONLY contain the clean service name — no quantities, durations, or prices.
- qty (flat): exactly the number mentioned (default 1). Remove it from description.
- unit_price (flat): price per unit. If only a total is given: unit_price=total/qty.
- Leave all fields null/empty if not clearly stated.
- For client name: separate first name and last name if both are present.

EXAMPLES:
- "3 hours consulting at 150€/h and logo design for 500€"
  → lines=[{{description:"Consulting",qty:3,unit_price:150}}, {{description:"Logo design",qty:1,unit_price:500}}]
- "web dev for 2000€"
  → lines=[{{description:"Web development",qty:1,unit_price:2000}}]

Transcript: {transcript}"""
    )
    return result


# ── Modification intent (used in VALIDATION phase) ────────────────────────────

class LineModification(BaseModel):
    action: Literal["add", "remove", "update"]
    target: Optional[str] = Field(
        None,
        description="Description keyword of the line to remove or update (partial match ok)",
    )
    description: Optional[str] = Field(None, description="New description (for add/update)")
    qty: Optional[float] = Field(None, description="New quantity (for add/update)")
    unit_price: Optional[float] = Field(None, description="New unit price (for add/update)")
    amount: Optional[float] = Field(None, description="Total amount when unit_price not given (for add/update)")


class InvoiceModification(BaseModel):
    line_modifications: List[LineModification] = Field(
        default_factory=list,
        description="All line-level changes (add / remove / update items)",
    )
    tva_rate: Optional[float] = Field(None, description="New VAT rate if user wants to change it")
    due_date: Optional[str] = Field(None, description="New due date ISO if mentioned")
    payment_terms: Optional[str] = Field(None, description="New payment terms if mentioned")


async def parse_modification(text: str, current_lines: list[dict], api_key: str) -> InvoiceModification:
    """Parses a user modification request against the current invoice lines."""
    llm = ChatOpenAI(model="gpt-4.1-mini", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(InvoiceModification)

    lines_str = json.dumps(current_lines, ensure_ascii=False, indent=2)
    result = await structured.ainvoke(
        f"""You are parsing a user's modification request for an invoice.

Current invoice lines:
{lines_str}

User request: "{text}"

Extract the modifications the user wants to make:
- "add X at Y€" → action=add, description=X, unit_price=Y
- "remove X" / "delete X" / "supprimer X" → action=remove, target=X (partial match)
- "change X price to Y" / "update X qty to N" → action=update, target=X, qty/unit_price=new value
- If the user mentions a VAT rate change, set tva_rate.
- If multiple changes are requested, include all in line_modifications.
- Use the current lines descriptions as reference for target matching."""
    )
    return result
