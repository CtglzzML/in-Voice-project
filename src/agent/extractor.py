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
- description: must be a clearly identifiable service or product name (e.g. "Web development",
  "Logo design", "Consulting"). If you cannot identify one with confidence, leave it null.
  Remove any quantity or duration from it: "3h web dev" → description="Web development", qty=3
- qty: number of units/hours/days (default 1)
- unit_price: price per unit. If only a total is given: unit_price=total/qty.
- Leave all fields null if the information is not clearly stated.
- For client name: separate first name and last name if both are present.

Transcript: {transcript}"""
    )
    return result
