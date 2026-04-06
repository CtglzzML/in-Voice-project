# src/agent/extractor.py
"""
Pre-processes the voice transcript into structured data before the agent runs.
Uses LLM structured output (Pydantic) to extract all available info in one shot.
"""
from typing import Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class ExtractedInvoice(BaseModel):
    client_first_name: Optional[str] = Field(None, description="Client's first name")
    client_last_name: Optional[str] = Field(None, description="Client's last name")
    client_address: Optional[str] = Field(None, description="Client's address if mentioned")
    client_email: Optional[str] = Field(None, description="Client's email if mentioned")
    client_phone: Optional[str] = Field(None, description="Client's phone number if mentioned")
    description: Optional[str] = Field(None, description="Description of the service/product")
    amount: Optional[float] = Field(None, description="Total amount excluding tax")
    qty: Optional[float] = Field(None, description="Quantity or number of hours (default 1)")
    unit_price: Optional[float] = Field(None, description="Unit price excluding tax if mentioned separately")
    tva_rate: Optional[float] = Field(None, description="VAT rate in % if mentioned (e.g. 20)")
    due_date: Optional[str] = Field(None, description="Due date ISO (YYYY-MM-DD) if mentioned")
    payment_terms: Optional[str] = Field(None, description="Payment terms if mentioned")
    confidence_score: float = Field(
        0.0,
        description=(
            "Your overall confidence that the extraction is complete and correct. "
            "0.0 = almost nothing extracted, 1.0 = all fields clearly stated. "
            "Compute as: (number of non-null fields / 6) capped at 1.0."
        ),
    )
    missing_fields: list[str] = Field(
        default_factory=list,
        description=(
            "List of invoice field names that are clearly missing from the transcript. "
            "Only include fields from: client_first_name, description, unit_price, tva_rate, due_date. "
            "Do not include a field if it was mentioned even implicitly."
        ),
    )


async def extract_from_transcript(transcript: str, api_key: str) -> ExtractedInvoice:
    """Extracts all invoice fields from a voice transcript in one structured LLM call."""
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(ExtractedInvoice)

    result = await structured.ainvoke(
        f"""You are extracting structured invoice data from a voice transcript.

CRITICAL RULES:
- Only extract real invoice information (client, service, price, date).
- IGNORE voice command artefacts: words like "mets", "ajoute", "crée", "facture pour", "start",
  "record", "ok", "hey", "canine", "voice", "fort" and similar are NOT product descriptions.
  They are recognition noise — discard them entirely.
- description: MUST ONLY contain the clean service or product name (e.g. "Web development",
  "Logo design", "Consulting"). ALL quantities, durations, or measurements MUST be EXCLUDED from
  the description. Example: "3 hours of web development" -> description="Web development", qty=3.
  If you cannot identify a clean service name with confidence, leave it null.
- qty: exactly the number of units/hours/days mentioned (default 1). If the description mentions
  "a", "one", "2 hours", extract the number into qty and remove it from the description.
- unit_price: price per unit. If only a total is given: unit_price=total/qty.
- Leave all fields null if the information is not clearly stated.
- For client name: separate first name and last name if both are present.
- confidence_score: compute as (number of non-null fields among client_first_name, description,
  unit_price, qty, tva_rate, due_date) / 6, capped at 1.0.
- missing_fields: list fields from [client_first_name, description, unit_price, tva_rate, due_date]
  that are clearly absent from the transcript.

Transcript: {transcript}"""
    )
    return result
