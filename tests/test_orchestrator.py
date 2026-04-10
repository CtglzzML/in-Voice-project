# tests/test_orchestrator.py
import asyncio
import pytest
from decimal import Decimal
from unittest.mock import patch, AsyncMock, MagicMock
from src.sessions.manager import SessionStore
from src.db.models import UserProfile, Client
from src.agent.extractor import ExtractedInvoice
from src.agent.tools import MANDATORY_FIELDS
from src.agent.tools import InvoiceField


@pytest.fixture
def store():
    return SessionStore()


@pytest.fixture
def session_id(store):
    sid = store.create("user-1")
    store.get(sid)["invoice_id"] = "inv-1"
    return sid


def _make_extracted(description="Web dev", qty=2.0, unit_price=500.0, tva_rate=20.0,
                    first="Marie", last="Dupont"):
    return ExtractedInvoice(
        client_first_name=first, client_last_name=last,
        description=description, qty=qty, unit_price=unit_price,
        tva_rate=tva_rate, confidence_score=0.9, missing_fields=[],
    )


def _make_fake_update_field(store, session_id):
    """Returns a fake tool_update_invoice_field that actually updates the draft in memory."""
    async def fake_update_field(field, value, invoice_id, session_id_):
        store.get(session_id_)["invoice_draft"][field.value] = value
        store.get(session_id_)["missing_fields"] = [
            f for f in MANDATORY_FIELDS if not store.get(session_id_)["invoice_draft"].get(f)
        ]
        return "ok"
    return fake_update_field


@pytest.mark.asyncio
async def test_orchestrator_transitions_to_done_on_happy_path(store, session_id):
    """Full path: extracted client found, all fields present, user confirms."""
    extracted = _make_extracted()
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    fake_update_field = _make_fake_update_field(store, session_id)

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=fake_update_field), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=AsyncMock(return_value="no")), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2 heures de dev web à 500€, TVA 20%")

    assert store.get(session_id)["state"] == "DONE"


@pytest.mark.asyncio
async def test_orchestrator_asks_for_missing_tva(store, session_id):
    """When tva_rate is not extracted and profile has no default, orchestrator asks user."""
    extracted = ExtractedInvoice(
        client_first_name="Marie", client_last_name="Dupont",
        description="Web dev", qty=2.0, unit_price=500.0,
        tva_rate=None, confidence_score=0.7, missing_fields=["tva_rate"],
    )
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=None)
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    fake_update_field = _make_fake_update_field(store, session_id)
    # ask_mock: first call = tva reply (in MISSING_FIELDS), second = validation confirm
    ask_mock = AsyncMock(side_effect=["20%", "no"])

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=fake_update_field), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=ask_mock), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2h dev web 500€")

    assert store.get(session_id)["state"] == "DONE"
    assert ask_mock.call_count >= 1


@pytest.mark.asyncio
async def test_orchestrator_creates_client_when_not_found(store, session_id):
    """When client not in DB, orchestrator creates it from form data."""
    extracted = _make_extracted()
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    new_client = Client(id="c2", user_id="user-1", name="Marie Dupont")

    search_result = {"found": False, "client": None, "form_data": {"name": "Marie Dupont", "email": "m@ex.com", "phone": ""}, "error": None}

    fake_update_field = _make_fake_update_field(store, session_id)

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value=search_result)), \
         patch("src.agent.orchestrator.tool_create_client", new=AsyncMock(return_value=new_client)), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=fake_update_field), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=AsyncMock(return_value="no")), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2h dev web 500€")

    assert store.get(session_id)["state"] == "DONE"


@pytest.mark.asyncio
async def test_orchestrator_asks_for_client_name_when_not_extracted(store, session_id):
    """When client name is absent from extraction, orchestrator asks."""
    extracted = ExtractedInvoice(
        description="Web dev", qty=2.0, unit_price=500.0,
        tva_rate=20.0, confidence_score=0.5, missing_fields=["client_first_name"],
    )
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    fake_update_field = _make_fake_update_field(store, session_id)
    # ask_mock: first call = client name (CLIENT_RESOLUTION), second = validation confirm
    ask_mock = AsyncMock(side_effect=["Marie Dupont", "no"])

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=fake_update_field), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=ask_mock), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "2 heures de dev web à 500€, TVA 20%")

    assert store.get(session_id)["state"] == "DONE"


@pytest.mark.asyncio
async def test_orchestrator_sets_error_state_on_exception(store, session_id):
    """An unhandled exception puts the session in ERROR state."""
    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(side_effect=RuntimeError("LLM down"))), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "anything")

    assert store.get(session_id)["state"] == "ERROR"
