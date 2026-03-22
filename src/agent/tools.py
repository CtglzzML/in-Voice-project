# src/agent/tools.py
import asyncio
from decimal import Decimal
from enum import Enum
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
    due_date = "due_date"
    payment_terms = "payment_terms"
    lines = "lines"
    tva_rate = "tva_rate"


MANDATORY_FIELDS = ["client_id", "due_date", "payment_terms", "lines", "tva_rate"]

QUESTION_TIMEOUT = 300  # 5 minutes


async def tool_get_user_profile(user_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "thinking", "message": "Chargement du profil utilisateur..."})
    profile = get_user(user_id)
    if not profile:
        return f"Utilisateur {user_id} introuvable en base de données."
    missing = profile.missing_mandatory_fields()
    if missing:
        return f"Profil chargé. Champs manquants obligatoires : {missing}. Demande ces informations à l'utilisateur."
    return f"Profil chargé : {profile.model_dump_json()}"


async def tool_search_client(name: str, user_id: str, session_id: str) -> str:
    """
    Returns client data including id.
    After calling this tool, the agent MUST call update_invoice_field("client_id", <id>, invoice_id)
    to link the client to the invoice.
    """
    await session_store.push_event(session_id, {"type": "thinking", "message": f"Recherche du client '{name}'..."})
    results = search_clients(name, user_id)
    if not results:
        return f"Client '{name}' introuvable. Demande à l'utilisateur l'adresse du client pour créer une fiche. Ensuite appelle update_invoice_field avec client_id."
    if len(results) == 1:
        return f"Client trouvé : {results[0].model_dump_json()}. Appelle maintenant update_invoice_field('client_id', '{results[0].id}', invoice_id)."
    return f"Plusieurs clients trouvés : {[r.model_dump_json() for r in results]}. Demande lequel choisir, puis appelle update_invoice_field('client_id', id_choisi, invoice_id)."


async def tool_create_invoice_draft(user_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "thinking", "message": "Création du brouillon de facture..."})
    invoice_id = db_create_draft(user_id, session_id)
    session_store.get(session_id)["invoice_id"] = invoice_id
    await session_store.push_event(session_id, {"type": "invoice_update", "field": "status", "value": "draft"})
    return f"Brouillon créé. invoice_id={invoice_id}"


async def tool_update_invoice_field(field: str, value: Any, invoice_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "thinking", "message": f"Mise à jour du champ {field}..."})

    try:
        InvoiceField(field)
    except ValueError:
        return f"Champ '{field}' invalide. Champs valides : {[f.value for f in InvoiceField]}"

    invoice = get_invoice(invoice_id)
    updates: dict[str, Any] = {field: value}

    if field in ("lines", "tva_rate"):
        lines_data = value if field == "lines" else invoice.get("lines", [])
        tva = value if field == "tva_rate" else invoice.get("tva_rate")
        if lines_data and tva is not None:
            parsed_lines = [InvoiceLine(**l) for l in lines_data] if isinstance(lines_data[0], dict) else lines_data
            totals = compute_totals(parsed_lines, Decimal(str(tva)))
            updates["subtotal"] = float(totals.subtotal)
            updates["tva_amount"] = float(totals.tva_amount)
            updates["total"] = float(totals.total)

    update_invoice_in_db(invoice_id, updates)

    for k, v in updates.items():
        await session_store.push_event(session_id, {"type": "invoice_update", "field": k, "value": v})

    return f"Champ {field} mis à jour."


async def tool_ask_user_question(message: str, session_id: str) -> str:
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    session["last_question"] = message
    await session_store.push_event(session_id, {"type": "question", "message": message, "awaiting": True})
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        await session_store.push_event(session_id, {"type": "error", "message": "Délai d'attente dépassé."})
        raise
    finally:
        session["awaiting_reply"] = False
    return reply


async def tool_finalize_invoice(session_id: str, invoice_id: str) -> str:
    await session_store.push_event(session_id, {"type": "thinking", "message": "Finalisation de la facture..."})
    invoice = get_invoice(invoice_id)
    missing = [f for f in MANDATORY_FIELDS if not invoice.get(f)]
    if missing:
        return f"Impossible de finaliser : champs manquants {missing}. Complète-les d'abord."

    session = session_store.get(session_id)
    number = assign_invoice_number(invoice_id, session["user_id"])
    update_invoice_in_db(invoice_id, {"status": "confirmed", "invoice_number": number})
    session["status"] = "done"
    await session_store.push_event(session_id, {"type": "done", "invoice_id": invoice_id})
    return f"Facture confirmée. Numéro : {number}"
