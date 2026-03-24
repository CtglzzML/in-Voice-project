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
    llm = ChatOpenAI(model="gpt-4.1-mini", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(ExtractedInvoice)

    result = await structured.ainvoke(
        f"""Extract all invoice information from this voice transcript.
Do not guess what is not said. If a piece of information is not mentioned, leave the field null.

Rules:
- description: a clean, professional service label — remove any quantity/duration reference from it.
  Examples: "3 hours of web dev" → description="Web development", qty=3
            "2 days consulting" → description="Consulting", qty=2
            "logo design" → description="Logo design", qty=1
- qty: the number of units, hours, days, etc. (default 1 if not specified)
- unit_price: price per unit. If only a total is given, set unit_price=total/qty.
- If a total amount is given without unit price or quantity, set qty=1, unit_price=total.
- For the client: separate first name and last name if both present.

Transcript: {transcript}"""
    )
    return result
