# src/agent/orchestrator.py
"""
Deterministic state-machine orchestrator for invoice creation.
Replaces the free-form LangChain agent from V1.
LLM is only used in the INIT state (extractor call).
"""
import asyncio
import json
import logging
from enum import Enum
from typing import Optional

from src.agent.business_logic import build_invoice_lines, normalize_client_name, validate_invoice
from src.agent.events import EventType
from src.agent.extractor import extract_from_transcript
from src.agent.tools import (
    MANDATORY_FIELDS,
    InvoiceField,
    tool_ask_user_question,
    tool_create_client,
    tool_create_invoice_draft,
    tool_finalize_invoice,
    tool_get_user_profile,
    tool_search_client,
    tool_update_invoice_field,
)
from src.sessions.manager import session_store

logger = logging.getLogger(__name__)


class AgentState(str, Enum):
    INIT = "INIT"
    CLIENT_RESOLUTION = "CLIENT_RESOLUTION"
    DRAFT_CREATION = "DRAFT_CREATION"
    LINE_BUILDING = "LINE_BUILDING"
    MISSING_FIELDS = "MISSING_FIELDS"
    VALIDATION = "VALIDATION"
    FINALIZATION = "FINALIZATION"
    DONE = "DONE"
    ERROR = "ERROR"


def _transition(session_id: str, new_state: AgentState) -> None:
    session = session_store.get(session_id)
    old = session.get("state", AgentState.INIT.value)
    session["state"] = new_state.value
    logger.info(json.dumps({
        "event": "STATE_CHANGE",
        "session_id": session_id,
        "from": str(old),
        "to": new_state.value,
    }))


async def run_orchestrator(session_id: str, user_id: str, transcript: str) -> None:
    """Entry point. Runs the full invoice creation state machine."""
    from src.config import OPENAI_API_KEY

    async def _delayed_cleanup():
        await asyncio.sleep(300)
        session_store.cleanup(session_id)

    try:
        await _run_states(session_id, user_id, transcript, OPENAI_API_KEY)
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(json.dumps({"event": "UNHANDLED_ERROR", "session_id": session_id, "error": str(e)}))
        try:
            session = session_store.get(session_id)
            session["state"] = AgentState.ERROR.value
            if session["status"] != "done":
                await session_store.push_event(session_id, {"type": EventType.ERROR, "message": f"Agent error: {str(e)}"})
                session["status"] = "error"
        except Exception:
            pass
    finally:
        try:
            asyncio.create_task(_delayed_cleanup())
        except RuntimeError:
            pass


async def _run_states(session_id: str, user_id: str, transcript: str, api_key: str) -> None:
    session = session_store.get(session_id)

    # ── INIT: extract structured data ──────────────────────────────────────
    _transition(session_id, AgentState.INIT)
    logger.info(json.dumps({"event": "TRANSCRIPT", "session_id": session_id, "transcript": transcript}))

    extracted = await extract_from_transcript(transcript, api_key)
    session["extracted_data"] = extracted.model_dump()
    session["confidence"] = extracted.confidence_score
    logger.info(json.dumps({"event": "EXTRACTED", "session_id": session_id, "data": extracted.model_dump()}))

    # Load user profile (side effect: pushes PROFILE SSE event)
    profile = await tool_get_user_profile(user_id, session_id)

    # ── DRAFT_CREATION ─────────────────────────────────────────────────────
    _transition(session_id, AgentState.DRAFT_CREATION)
    invoice_id = await tool_create_invoice_draft(user_id, session_id)

    # Apply extracted tva_rate immediately if present; fall back to profile default
    tva = extracted.tva_rate
    if tva is None and profile is not None and profile.default_tva is not None:
        tva = float(profile.default_tva)
    if tva is not None:
        await tool_update_invoice_field(InvoiceField.tva_rate, tva, invoice_id, session_id)

    # ── CLIENT_RESOLUTION ──────────────────────────────────────────────────
    _transition(session_id, AgentState.CLIENT_RESOLUTION)
    client_name = normalize_client_name(extracted.client_first_name, extracted.client_last_name)

    if not client_name:
        client_name = await tool_ask_user_question("Who is this invoice for?", session_id)
        client_name = client_name.strip()

    search_result = await tool_search_client(client_name, user_id, session_id)

    if search_result.get("error"):
        await session_store.push_event(session_id, {
            "type": EventType.ERROR,
            "message": f"Client search failed ({search_result['error']}). Please try again.",
        })
        session = session_store.get(session_id)
        session["status"] = "error"
        _transition(session_id, AgentState.ERROR)
        return

    if search_result["found"]:
        client_id = search_result["client"].id
    else:
        # Form data was collected inside tool_search_client
        form_data = search_result["form_data"]
        name = form_data.get("name", client_name)
        created = await tool_create_client(
            name=name,
            address=form_data.get("address", ""),
            user_id=user_id,
            session_id=session_id,
            email=form_data.get("email", ""),
            phone=form_data.get("phone", ""),
        )
        client_id = created.id

    await tool_update_invoice_field(InvoiceField.client_id, client_id, invoice_id, session_id)

    # ── LINE_BUILDING ───────────────────────────────────────────────────────
    _transition(session_id, AgentState.LINE_BUILDING)
    lines = build_invoice_lines(extracted)
    if lines:
        await tool_update_invoice_field(InvoiceField.lines, lines, invoice_id, session_id)

    # ── MISSING_FIELDS ──────────────────────────────────────────────────────
    _transition(session_id, AgentState.MISSING_FIELDS)
    session = session_store.get(session_id)
    still_missing = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    for field_name in still_missing:
        if field_name == "tva_rate":
            reply = await tool_ask_user_question("What's the VAT rate? (e.g. 20%)", session_id)
            try:
                value = float(reply.replace("%", "").strip())
                await tool_update_invoice_field(InvoiceField.tva_rate, value, invoice_id, session_id)
            except ValueError:
                reply = await tool_ask_user_question("Please enter a numeric VAT rate (e.g. 20).", session_id)
                try:
                    value = float(reply.replace("%", "").strip())
                    await tool_update_invoice_field(InvoiceField.tva_rate, value, invoice_id, session_id)
                except ValueError:
                    pass

        elif field_name == "lines":
            reply = await tool_ask_user_question(
                "What services should be on this invoice? (e.g. '3 hours of consulting at 150€/h')",
                session_id,
            )
            sub_extracted = await extract_from_transcript(reply, api_key)
            sub_lines = build_invoice_lines(sub_extracted)
            if sub_lines:
                await tool_update_invoice_field(InvoiceField.lines, sub_lines, invoice_id, session_id)

        elif field_name == "client_id":
            reply = await tool_ask_user_question("I couldn't find the client. Please provide their full name.", session_id)
            sub_search = await tool_search_client(reply.strip(), user_id, session_id)
            if sub_search.get("found"):
                await tool_update_invoice_field(InvoiceField.client_id, sub_search["client"].id, invoice_id, session_id)

    # ── VALIDATION ──────────────────────────────────────────────────────────
    _transition(session_id, AgentState.VALIDATION)
    session = session_store.get(session_id)
    validation = validate_invoice(session["invoice_draft"])

    if not validation["is_valid"]:
        errors_str = ", ".join(validation["errors"])
        await session_store.push_event(session_id, {
            "type": EventType.ERROR,
            "message": f"Invoice is not valid: {errors_str}",
        })
        session["status"] = "error"
        _transition(session_id, AgentState.ERROR)
        return

    confirm = await tool_ask_user_question(
        "Your invoice is ready. Would you like to modify anything?", session_id
    )
    wants_change = confirm.strip().lower() not in ("no", "non", "nope", "n", "good", "ok", "yes please finalize")

    if wants_change:
        what = await tool_ask_user_question("What would you like to change?", session_id)
        change_extracted = await extract_from_transcript(what, api_key)
        if change_extracted.tva_rate is not None:
            await tool_update_invoice_field(InvoiceField.tva_rate, change_extracted.tva_rate, invoice_id, session_id)
        new_lines = build_invoice_lines(change_extracted)
        if new_lines:
            await tool_update_invoice_field(InvoiceField.lines, new_lines, invoice_id, session_id)
        await tool_ask_user_question("Got it. Anything else to change? (say 'no' to finalize)", session_id)

    # ── FINALIZATION ────────────────────────────────────────────────────────
    _transition(session_id, AgentState.FINALIZATION)
    await tool_finalize_invoice(session_id, invoice_id)

    _transition(session_id, AgentState.DONE)
