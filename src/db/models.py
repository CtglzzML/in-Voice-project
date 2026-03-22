from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from pydantic import BaseModel, computed_field


class UserProfile(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    siret: Optional[str] = None
    address: Optional[str] = None
    tva_number: Optional[str] = None
    logo_url: Optional[str] = None
    default_tva: Optional[Decimal] = None

    def missing_mandatory_fields(self) -> list[str]:
        mandatory = ["name", "siret", "address", "default_tva"]
        return [f for f in mandatory if getattr(self, f) is None]


class Client(BaseModel):
    id: Optional[str] = None
    user_id: str
    name: str
    email: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None


class InvoiceLine(BaseModel):
    description: str
    qty: Decimal
    unit_price: Decimal

    @computed_field
    @property
    def total(self) -> Decimal:
        return (self.qty * self.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class InvoiceTotals(BaseModel):
    subtotal: Decimal
    tva_amount: Decimal
    total: Decimal


def compute_totals(lines: list[InvoiceLine], tva_rate: Decimal) -> InvoiceTotals:
    subtotal = sum(line.total for line in lines)
    tva_amount = (subtotal * tva_rate / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return InvoiceTotals(subtotal=subtotal, tva_amount=tva_amount, total=subtotal + tva_amount)
