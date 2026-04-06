# src/agent/tools.py
import asyncio
from datetime import datetime, timedelta
import json
from decimal import Decimal
from enum import Enum
from functools import partial
from typing import Any, Optional

from src.db.models import Client, InvoiceLine, UserProfile, compute_totals
from src.db.supabase import (
    create_client_record,
    create_invoice_draft as db_create_draft,
    get_invoice,
    get_user,
    search_clients,
    update_invoice_in_db,
    assign_invoice_number,
)
from src.sessions.manager import session_store
from src.agent.events import EventType


class InvoiceField(str, Enum):
    client_id = "client_id"
    lines = "lines"
    tva_rate = "tva_rate"
    due_date = "due_date"
    payment_terms = "payment_terms"


MANDATORY_FIELDS = ["client_id", "lines", "tva_rate"]

QUESTION_TIMEOUT = 300  # 5 minutes
SEARCH_TIMEOUT = 10.0  # 10 seconds max for DB search


async def _await_reply(session_id: str) -> str:
    """Wait for a user reply without pushing a question event to SSE."""
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        raise
    finally:
        session["awaiting_reply"] = False
    return reply


async def _push_client_fields(session_id: str, name: str, address: str, email: str, phone: str) -> None:
    """Push client fields as INVOICE_UPDATED events so the frontend updates in real time."""
    for field, value in [
        ("client_name", name),
        ("client_address", address),
        ("client_email", email),
        ("client_phone", phone),
    ]:
        if value:
            await session_store.push_event(session_id, {"type": EventType.INVOICE_UPDATED, "field": field, "value": value})


async def tool_get_user_profile(user_id: str, session_id: str) -> Optional[UserProfile]:
    """Returns the UserProfile or None if not found. Pushes PROFILE event to SSE."""
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": "Loading your profile..."})
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, partial(get_user, user_id))
    if profile:
        await session_store.push_event(session_id, {
            "type": EventType.PROFILE,
            "data": profile.model_dump(mode="json"),
        })
    return profile


async def tool_search_client(name: str, user_id: str, session_id: str) -> dict:
    """
    Searches for a client by name.
    Returns:
      {"found": True, "client": Client, "form_data": None}  — client exists in DB
      {"found": False, "client": None, "form_data": dict}   — user submitted new client form
      {"found": False, "client": None, "form_data": None, "error": "search_timeout"}
    """
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": f"Searching for client {name}..."})
    loop = asyncio.get_running_loop()

    try:
        results = await asyncio.wait_for(
            loop.run_in_executor(None, partial(search_clients, name, user_id)),
            timeout=SEARCH_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return {"found": False, "client": None, "form_data": None, "error": "search_timeout"}

    if results:
        c = results[0]
        await _push_client_fields(session_id, c.name, c.address or "", c.email or "", c.phone or "")
        return {"found": True, "client": c, "form_data": None}

    # No match — show inline creation form and wait for user submission
    await session_store.push_event(session_id, {
        "type": EventType.WAITING_USER_INPUT,
        "message": "I'll create this client. Please fill in this short form.",
        "awaiting": True,
    })
    await session_store.push_event(session_id, {
        "type": EventType.NEED_CLIENT_INFO,
        "data": {"name": name},
    })

    while True:
        try:
            form_reply = await _await_reply(session_id)
        except asyncio.TimeoutError:
            return {"found": False, "client": None, "form_data": None, "error": "form_timeout"}
        try:
            data = json.loads(form_reply)
            if isinstance(data, dict):
                return {"found": False, "client": None, "form_data": data, "error": None}
        except (json.JSONDecodeError, ValueError):
            await session_store.push_event(session_id, {
                "type": EventType.WAITING_USER_INPUT,
                "message": "Please use the form on screen to enter the contact details.",
                "awaiting": True,
            })


async def tool_create_client(
    name: str, address: str, user_id: str, session_id: str,
    email: str = "", company: str = "", phone: str = "",
) -> Client:
    """Creates a new client record. Returns the created Client with its id."""
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": f"Adding client {name}..."})
    client = Client(id="", user_id=user_id, name=name, address=address, email=email or None, company=company or None, phone=phone or None)
    loop = asyncio.get_running_loop()
    created = await loop.run_in_executor(None, partial(create_client_record, client))
    await _push_client_fields(session_id, name, address, email, phone)
    return created


async def tool_create_invoice_draft(user_id: str, session_id: str) -> str:
    """Creates a draft invoice. Sets session['invoice_id']. Returns invoice_id."""
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": "Preparing your invoice draft..."})
    loop = asyncio.get_running_loop()
    invoice_id = await loop.run_in_executor(None, partial(db_create_draft, user_id, session_id))

    due_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    await loop.run_in_executor(None, partial(update_invoice_in_db, invoice_id, {"due_date": due_date}))

    session = session_store.get(session_id)
    session["invoice_id"] = invoice_id
    session["invoice_draft"]["due_date"] = due_date
    session["missing_fields"] = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    await session_store.push_event(session_id, {"type": EventType.INVOICE_UPDATED, "field": "status", "value": "draft"})
    await session_store.push_event(session_id, {"type": EventType.INVOICE_UPDATED, "field": "due_date", "value": due_date})
    return invoice_id


async def tool_update_invoice_field(field: InvoiceField, value: Any, invoice_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": "Updating the invoice..."})
    loop = asyncio.get_running_loop()

    field_key = field.value

    if field_key == "tva_rate":
        try:
            value = float(str(value).replace("%", "").strip())
        except (ValueError, TypeError):
            return f"Invalid tva_rate: '{value}'. Must be a number (e.g. 20)."

    if field_key == "lines" and isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, ValueError):
            pass

    updates: dict[str, Any] = {field_key: value}

    if field_key in ("lines", "tva_rate"):
        invoice = get_invoice(invoice_id)
        if invoice is None:
            return f"Invoice '{invoice_id}' not found."
        lines_data = value if field_key == "lines" else invoice.get("lines", [])
        tva = value if field_key == "tva_rate" else invoice.get("tva_rate")
        if field_key == "lines" and not value:
            updates.update({"subtotal": 0.0, "tva_amount": 0.0, "total": 0.0})
        elif lines_data and tva is not None:
            if isinstance(lines_data[0], str):
                try:
                    lines_data = [json.loads(l) for l in lines_data]
                except (json.JSONDecodeError, ValueError):
                    return f"Invalid lines format: expected list of objects."
            parsed_lines = [InvoiceLine(**l) for l in lines_data] if isinstance(lines_data[0], dict) else lines_data
            totals = compute_totals(parsed_lines, Decimal(str(tva)))
            updates["subtotal"] = float(totals.subtotal)
            updates["tva_amount"] = float(totals.tva_amount)
            updates["total"] = float(totals.total)

    update_invoice_in_db(invoice_id, updates)

    session = session_store.get(session_id)
    session["invoice_draft"].update(updates)
    session["missing_fields"] = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    for k, v in updates.items():
        await session_store.push_event(session_id, {"type": EventType.INVOICE_UPDATED, "field": k, "value": v})

    still_missing = session["missing_fields"]
    if still_missing:
        return f"Field {field_key} updated. Still missing: {still_missing}."
    return f"Field {field_key} updated. All mandatory fields filled."


async def tool_ask_user_question(message: str, session_id: str) -> str:
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    session["last_question"] = message
    await session_store.push_event(session_id, {"type": EventType.WAITING_USER_INPUT, "message": message, "awaiting": True})
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        session["status"] = "error"
        await session_store.push_event(session_id, {"type": EventType.ERROR, "message": "Call timed out."})
        return "Timeout: no reply received within 5 minutes."
    finally:
        session["awaiting_reply"] = False
    return reply


async def tool_finalize_invoice(session_id: str, invoice_id: str) -> str:
    await session_store.push_event(session_id, {"type": EventType.MESSAGE, "content": "Finalizing the invoice..."})
    invoice = get_invoice(invoice_id)
    if invoice is None:
        return f"Invoice '{invoice_id}' not found."
    missing = [f for f in MANDATORY_FIELDS if not invoice.get(f)]
    if missing:
        return f"Cannot finalize: missing fields {missing}. Fill them in first."

    session = session_store.get(session_id)
    try:
        number = assign_invoice_number(invoice_id, session["user_id"])
        update_invoice_in_db(invoice_id, {"status": "confirmed", "invoice_number": number})
    except Exception as e:
        error_msg = f"Database error during finalization: {str(e)}"
        await session_store.push_event(session_id, {"type": EventType.ERROR, "message": error_msg})
        return f"Error finalizing invoice: {str(e)}."

    session["status"] = "done"
    await session_store.push_event(session_id, {"type": EventType.DONE, "invoice_id": invoice_id, "invoice_number": number})
    return f"Invoice confirmed. Number: {number}"
