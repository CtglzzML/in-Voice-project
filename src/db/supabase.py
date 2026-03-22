# src/db/supabase.py
from typing import Optional
from supabase import create_client, Client
from src.config import SUPABASE_URL, SUPABASE_KEY
from src.db.models import UserProfile, Client as ClientModel
from decimal import Decimal
import datetime
import uuid

# Lazy initialization: client is created on first use, not at import time.
# This allows tests to patch _get_client before it is ever accessed.
_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def get_user(user_id: str) -> Optional[UserProfile]:
    data = _get_client().table("users").select("*").eq("id", user_id).single().execute().data
    if not data:
        return None
    return UserProfile(**data)


def search_clients(name: str, user_id: str) -> list[ClientModel]:
    data = _get_client().table("clients").select("*").eq("user_id", user_id).ilike("name", f"%{name}%").execute().data
    return [ClientModel(**row) for row in (data or [])]


def create_client_record(client: ClientModel) -> ClientModel:
    data = _get_client().table("clients").insert({
        "user_id": client.user_id,
        "name": client.name,
        "email": client.email,
        "address": client.address,
        "company": client.company,
    }).execute().data[0]
    return ClientModel(**data)


def create_invoice_draft(user_id: str, session_id: str) -> str:
    """Creates a draft invoice row, returns invoice_id."""
    invoice_id = str(uuid.uuid4())
    _get_client().table("invoices").insert({
        "id": invoice_id,
        "user_id": user_id,
        "status": "draft",
        "session_id": session_id,
        "issue_date": datetime.date.today().isoformat(),
        "lines": [],
    }).execute()
    return invoice_id


def update_invoice_in_db(invoice_id: str, updates: dict) -> None:
    _get_client().table("invoices").update(updates).eq("id", invoice_id).execute()


def get_invoice(invoice_id: str) -> Optional[dict]:
    data = _get_client().table("invoices").select("*").eq("id", invoice_id).single().execute().data
    return data


def assign_invoice_number(invoice_id: str, user_id: str) -> str:
    """Generates YYYY-MM-NNN number (sequential per user per month) and assigns it.

    NOTE: This count-then-write pattern is not atomic. Under concurrent load,
    two simultaneous calls for the same user/month could generate duplicate numbers.
    Production fix: replace with a Postgres function via supabase.rpc() that runs
    the count and update in a single transaction.
    """
    today = datetime.date.today()
    prefix = today.strftime("%Y-%m")
    count_data = _get_client().table("invoices").select("id", count="exact").eq("user_id", user_id).eq("status", "confirmed").like("invoice_number", f"{prefix}-%").execute()
    n = (count_data.count or 0) + 1
    number = f"{prefix}-{n:03d}"
    update_invoice_in_db(invoice_id, {"invoice_number": number})
    return number
