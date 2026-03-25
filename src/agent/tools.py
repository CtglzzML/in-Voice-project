# src/agent/tools.py
import asyncio
from datetime import datetime, timedelta
import json
from decimal import Decimal
from enum import Enum
from functools import partial
from typing import Any

from src.db.models import Client, InvoiceLine, compute_totals
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


class InvoiceField(str, Enum):
    client_id = "client_id"
    lines = "lines"
    tva_rate = "tva_rate"


MANDATORY_FIELDS = ["client_id", "lines", "tva_rate"]

QUESTION_TIMEOUT = 300  # 5 minutes
SEARCH_TIMEOUT = 10.0  # 10 seconds max for DB search


async def _await_reply(session_id: str) -> str:
    """Wait for a user reply without pushing a question event to SSE.
    Used when the UI was already updated by a preceding event (client_form_needed, client_suggestions).
    """
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        session["status"] = "error"
        await session_store.push_event(session_id, {"type": "error", "message": "No response received within 5 minutes."})
        raise
    finally:
        session["awaiting_reply"] = False
    return reply


async def _push_client_fields(session_id: str, name: str, address: str, email: str, phone: str) -> None:
    """Push client fields as invoice_update events so the frontend updates in real time."""
    for field, value in [
        ("client_name", name),
        ("client_address", address),
        ("client_email", email),
        ("client_phone", phone),
    ]:
        if value:
            await session_store.push_event(session_id, {"type": "invoice_update", "field": field, "value": value})


async def tool_get_user_profile(user_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "message", "content": "Loading your profile..."})
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, partial(get_user, user_id))
    if profile:
        await session_store.push_event(session_id, {
            "type": "profile",
            "data": profile.model_dump(mode='json')
        })
    if not profile:
        return f"User {user_id} not found in database."
    missing = profile.missing_mandatory_fields()
    result = f"Profile loaded: {profile.model_dump_json()}"
    if profile.default_tva is not None:
        result += f" | Use default_tva={profile.default_tva} as tva_rate unless transcript specifies another rate."
    if missing:
        result += f" | Issuer profile missing: {missing}"
    return result


async def tool_search_client(name: str, user_id: str, session_id: str) -> str:
    """
    Searches for a client by name. Handles all 3 cases internally:
    - 1 match  → returns client data with client_id
    - N matches → shows selection UI, waits for user choice, returns selected client
    - 0 matches → shows creation form, waits for user data, returns new client info
    After this tool returns, call update_invoice_field('client_id', ...) or create_client accordingly.
    """
    await session_store.push_event(session_id, {"type": "message", "content": f"Searching for client {name}..."})
    loop = asyncio.get_running_loop()

    try:
        results = await asyncio.wait_for(
            loop.run_in_executor(None, partial(search_clients, name, user_id)),
            timeout=SEARCH_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return f"Search timed out. Please try again."

    # --- Case 1: at least one match (use first one) ---
    if len(results) > 0:
        c = results[0]
        await _push_client_fields(session_id, c.name, c.address or "", c.email or "", c.phone or "")
        return f"Client found: {c.model_dump_json()}. Call update_invoice_field('client_id', '{c.id}', invoice_id)."

    # --- Case 2: no match — show inline form ---
    await session_store.push_event(session_id, {
        "type": "question",
        "message": "I'll create this client. Please fill in this short form.",
        "awaiting": True
    })
    await session_store.push_event(session_id, {
        "type": "ui_action",
        "action": "show_create_client_inline",
        "data": {"name": name}
    })
    
    try:
        while True:
            form_reply = await _await_reply(session_id)
            try:
                data = json.loads(form_reply)
                if isinstance(data, dict):
                    return (
                        f"User submitted form data for new client. "
                        f"Call tool_create_client immediately with name='{data.get('name', name)}', "
                        f"email='{data.get('email', '')}', "
                        f"phone='{data.get('phone', '')}', and address=''."
                    )
            except (json.JSONDecodeError, ValueError):
                await session_store.push_event(session_id, {
                    "type": "question",
                    "message": "Please use the short form on your screen to enter the contact details.",
                    "awaiting": True
                })
    except asyncio.TimeoutError:
        return "Timeout waiting for client creation data. Ask user again."


async def tool_create_client(name: str, address: str, user_id: str, session_id: str, email: str = "", company: str = "", phone: str = "") -> str:
    """Creates a new client record and returns the client_id UUID.
    After calling this, use update_invoice_field('client_id', <returned_id>, invoice_id).
    """
    await session_store.push_event(session_id, {"type": "message", "content": f"Adding client {name}..."})
    client = Client(id="", user_id=user_id, name=name, address=address, email=email or None, company=company or None, phone=phone or None)
    loop = asyncio.get_running_loop()
    created = await loop.run_in_executor(None, partial(create_client_record, client))
    await _push_client_fields(session_id, name, address, email, phone)
    return f"Client created. client_id={created.id}. Now call update_invoice_field('client_id', '{created.id}', invoice_id)."


async def tool_create_invoice_draft(user_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "message", "content": "Preparing your invoice draft..."})
    loop = asyncio.get_running_loop()
    invoice_id = await loop.run_in_executor(None, partial(db_create_draft, user_id, session_id))
    
    # Auto-set due date to today + 30 days
    due_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    await loop.run_in_executor(None, partial(update_invoice_in_db, invoice_id, {"due_date": due_date}))
    
    session = session_store.get(session_id)
    session["invoice_id"] = invoice_id
    session["invoice_draft"]["due_date"] = due_date
    session["missing_fields"] = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]
    
    await session_store.push_event(session_id, {"type": "invoice_update", "field": "status", "value": "draft"})
    await session_store.push_event(session_id, {"type": "invoice_update", "field": "due_date", "value": due_date})
    return f"Draft created. invoice_id={invoice_id}. due_date auto-set to {due_date}. Call update_invoice_field for any other extracted fields."


async def tool_update_invoice_field(field: InvoiceField, value: Any, invoice_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "message", "content": f"Updating the invoice..."})
    loop = asyncio.get_running_loop()

    field_key = field.value

    # Validate tva_rate early
    if field_key == "tva_rate":
        try:
            value = float(str(value).replace("%", "").strip())
        except (ValueError, TypeError):
            return f"Invalid tva_rate: '{value}'. Must be a number (e.g. 20)."

    # Parse JSON strings sent by the LLM (e.g. if LLM mistakenly sends lines as '[{"description":...}]' string)
    if field_key == "lines" and isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, ValueError):
            pass  # fallback, handled below

    updates: dict[str, Any] = {field_key: value}

    if field_key in ("lines", "tva_rate"):
        # Fetch invoice only when we need existing data to recompute totals
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

    # Update session draft state
    session = session_store.get(session_id)
    session["invoice_draft"].update(updates)
    session["missing_fields"] = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    for k, v in updates.items():
        await session_store.push_event(session_id, {"type": "invoice_update", "field": k, "value": v})

    still_missing = session["missing_fields"]
    if still_missing:
        return f"Field {field_key} updated. Still missing: {still_missing}."
    return f"Field {field_key} updated. All mandatory fields filled — ready to finalize."


async def tool_ask_user_question(message: str, session_id: str) -> str:
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    session["last_question"] = message
    await session_store.push_event(session_id, {"type": "question", "message": message, "awaiting": True})
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        session["status"] = "error"
        await session_store.push_event(session_id, {"type": "error", "message": "Call timed out."})
        return "Timeout: no reply received within 5 minutes."
    finally:
        session["awaiting_reply"] = False
    return reply


async def tool_finalize_invoice(session_id: str, invoice_id: str) -> str:
    await session_store.push_event(session_id, {"type": "message", "content": "Finalizing the invoice..."})
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
        await session_store.push_event(session_id, {"type": "error", "message": error_msg})
        return f"Error finalizing invoice: {str(e)}. Please inform the user."

    session["status"] = "done"
    await session_store.push_event(session_id, {"type": "done", "invoice_id": invoice_id, "invoice_number": number})
    return f"Invoice confirmed. Number: {number}"
