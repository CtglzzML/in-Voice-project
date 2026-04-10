from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional
from pydantic import BaseModel, computed_field


class UserProfile(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    company_name: Optional[str] = None
    address: Optional[str] = None
    tva_number: Optional[str] = None
    logo_url: Optional[str] = None
    default_tva: Optional[Decimal] = None

    def missing_mandatory_fields(self) -> list[str]:
        mandatory = ["name", "address", "default_tva"]
        return [f for f in mandatory if getattr(self, f) is None]


class Client(BaseModel):
    id: Optional[str] = None
    user_id: str
    name: str
    email: Optional[str] = None
    address: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None


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
    subtotal = sum((line.total for line in lines), Decimal("0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    tva_amount = (subtotal * tva_rate / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = (subtotal + tva_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return InvoiceTotals(subtotal=subtotal, tva_amount=tva_amount, total=total)


class InvoiceLineResponse(BaseModel):
    description: str
    qty: float
    unit_price: float
    total: float


class InvoiceDetailResponse(BaseModel):
    id: str
    user_id: str
    status: str
    invoice_number: Optional[str] = None
    issue_date: str
    due_date: Optional[str] = None
    payment_terms: Optional[str] = None
    client_id: Optional[str] = None
    lines: list[InvoiceLineResponse] = []
    tva_rate: Optional[float] = None
    subtotal: Optional[float] = None
    tva_amount: Optional[float] = None
    total: Optional[float] = None


class TTSRequest(BaseModel):
    text: str
    voice: Literal["alloy", "echo", "fable", "onyx", "nova", "shimmer"] = "alloy"
