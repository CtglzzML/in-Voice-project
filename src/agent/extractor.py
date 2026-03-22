# src/agent/extractor.py
"""
Pre-processes the voice transcript into structured data before the agent runs.
Uses LLM structured output (Pydantic) to extract all available info in one shot.
"""
from typing import Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class ExtractedInvoice(BaseModel):
    client_name: Optional[str] = Field(None, description="Nom du client mentionné")
    client_address: Optional[str] = Field(None, description="Adresse du client si mentionnée")
    description: Optional[str] = Field(None, description="Description de la prestation")
    amount: Optional[float] = Field(None, description="Montant HT en euros")
    qty: Optional[float] = Field(None, description="Quantité ou nombre d'heures (défaut 1)")
    unit_price: Optional[float] = Field(None, description="Prix unitaire HT si mentionné séparément")
    tva_rate: Optional[float] = Field(None, description="Taux de TVA en % si mentionné (ex: 20)")
    due_date: Optional[str] = Field(None, description="Date d'échéance ISO (YYYY-MM-DD) si mentionnée")
    payment_terms: Optional[str] = Field(None, description="Conditions de paiement si mentionnées")


async def extract_from_transcript(transcript: str, api_key: str) -> ExtractedInvoice:
    """Extracts all invoice fields from a voice transcript in one structured LLM call."""
    llm = ChatOpenAI(model="gpt-4o", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(ExtractedInvoice)

    result = await structured.ainvoke(
        f"""Extrais toutes les informations de facturation présentes dans ce transcript vocal.
Ne devine pas ce qui n'est pas dit. Si une info n'est pas mentionnée, laisse le champ à null.
Si un montant global est donné sans prix unitaire ni quantité, mets amount=montant et qty=1, unit_price=montant.

Transcript : {transcript}"""
    )
    return result
