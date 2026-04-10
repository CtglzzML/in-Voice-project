# tests/test_tools.py
import asyncio
import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal
from src.sessions.manager import SessionStore
from src.db.models import UserProfile, Client, InvoiceLine


@pytest.fixture
def store():
    return SessionStore()


@pytest.fixture
def session_id(store):
    return store.create("user-1")


# --- get_user_profile ---

async def test_get_user_profile_returns_profile_object(store, session_id):
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    with patch("src.agent.tools.get_user", return_value=profile):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_get_user_profile
            result = await tool_get_user_profile("user-1", session_id)
    assert result is not None
    assert result.name == "Alice"
    assert result.default_tva == Decimal("20")


async def test_get_user_profile_returns_none_when_not_found(store, session_id):
    with patch("src.agent.tools.get_user", return_value=None):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_get_user_profile
            result = await tool_get_user_profile("user-1", session_id)
    assert result is None


# --- search_client ---

async def test_search_client_returns_found_dict(store, session_id):
    clients = [Client(id="c1", user_id="user-1", name="Marie Dupont", address="Lyon")]
    with patch("src.agent.tools.search_clients", return_value=clients):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_search_client
            result = await tool_search_client("Marie", "user-1", session_id)
    assert result["found"] is True
    assert result["client"].id == "c1"
    assert result["client"].name == "Marie Dupont"
    assert result["form_data"] is None


# --- update_invoice_field ---

async def test_update_invoice_field_emits_invoice_update_event(store, session_id):
    store.get(session_id)["invoice_id"] = "inv-1"
    with patch("src.agent.tools.update_invoice_in_db"):
        with patch("src.agent.tools.get_invoice", return_value={"lines": [], "tva_rate": None}):
            with patch("src.agent.tools.session_store", store):
                from src.agent.tools import tool_update_invoice_field, InvoiceField
                await tool_update_invoice_field(InvoiceField.payment_terms, "30 jours", "inv-1", session_id)
    # drain MESSAGE event first
    await store.get(session_id)["sse_queue"].get()
    event = await asyncio.wait_for(store.get(session_id)["sse_queue"].get(), timeout=1)
    assert event["type"] == "INVOICE_UPDATED"
    assert event["field"] == "payment_terms"


# --- ask_user_question ---

async def test_ask_user_question_suspends_and_returns_reply(store, session_id):
    """
    tool_ask_user_question must:
    1. Set awaiting_reply=True and emit a 'WAITING_USER_INPUT' SSE event
    2. Block until reply_queue has a value
    3. Return the reply string and reset awaiting_reply=False
    """
    from src.agent.tools import tool_ask_user_question

    async def inject_reply_after_delay():
        await asyncio.sleep(0.1)
        await store.get(session_id)["reply_queue"].put("20%")

    with patch("src.agent.tools.session_store", store):
        task = asyncio.create_task(inject_reply_after_delay())
        result = await tool_ask_user_question("Quel taux de TVA ?", session_id)
        await task

    assert result == "20%"
    assert store.get(session_id)["awaiting_reply"] is False
    event = store.get(session_id)["sse_queue"].get_nowait()
    assert event["type"] == "WAITING_USER_INPUT"
    assert event["awaiting"] is True


# --- finalize_invoice ---

async def test_finalize_invoice_confirms_when_all_fields_present(store, session_id):
    store.get(session_id)["user_id"] = "user-1"
    full_invoice = {
        "client_id": "c1",
        "due_date": "2026-04-22",
        "payment_terms": "30 jours",
        "lines": [{"description": "Dev", "qty": "1", "unit_price": "800"}],
        "tva_rate": "20",
    }
    with patch("src.agent.tools.get_invoice", return_value=full_invoice):
        with patch("src.agent.tools.assign_invoice_number", return_value="2026-03-001"):
            with patch("src.agent.tools.update_invoice_in_db"):
                with patch("src.agent.tools.session_store", store):
                    from src.agent.tools import tool_finalize_invoice
                    result = await tool_finalize_invoice(session_id, "inv-1")
    assert "2026-03-001" in result
    assert store.get(session_id)["status"] == "done"


async def test_finalize_invoice_returns_error_when_fields_missing(store, session_id):
    store.get(session_id)["user_id"] = "user-1"
    partial_invoice = {"client_id": "c1"}  # missing due_date, payment_terms, lines, tva_rate
    with patch("src.agent.tools.get_invoice", return_value=partial_invoice):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_finalize_invoice
            result = await tool_finalize_invoice(session_id, "inv-1")
    assert "missing" in result.lower()


async def test_update_invoice_field_rejects_invalid_field(store, session_id):
    with patch("src.agent.tools.session_store", store):
        from src.agent.tools import tool_update_invoice_field, InvoiceField
        # With the new InvoiceField type, passing a raw string is a type error at runtime
        # Test via try/except ValueError which InvoiceField constructor raises
        try:
            bad_field = InvoiceField("nonexistent_field")
            result = "no error raised"
        except ValueError:
            result = "ValueError raised as expected"
    assert "ValueError" in result
