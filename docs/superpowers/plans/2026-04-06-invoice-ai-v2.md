# Invoice AI Agent V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-form LangChain agent with a deterministic state machine orchestrator where the LLM is only used for structured extraction, not for flow decisions.

**Architecture:** An `Orchestrator` drives a fixed state machine (INIT → CLIENT_RESOLUTION → DRAFT_CREATION → LINE_BUILDING → MISSING_FIELDS → VALIDATION → FINALIZATION → DONE). Tools return structured data rather than LLM-readable strings. LangChain is only kept for the extractor.

**Tech Stack:** FastAPI, asyncio, Pydantic v2, OpenAI (extractor only), Supabase, existing SSE infrastructure.

---

## File Structure

**Create:**
- `src/agent/events.py` — SSE event type constants and builder helper
- `src/agent/business_logic.py` — Pure functions: `build_invoice_lines`, `normalize_client_name`, `validate_invoice`
- `src/agent/orchestrator.py` — `AgentState` enum + `run_orchestrator()` state machine
- `tests/test_business_logic.py` — Unit tests for business logic functions
- `tests/test_orchestrator.py` — Integration tests for orchestrator state transitions

**Modify:**
- `src/agent/extractor.py` — Add `confidence_score: float` and `missing_fields: list[str]`
- `src/agent/tools.py` — Refactor `tool_get_user_profile`, `tool_search_client`, `tool_create_client` to return structured data instead of LLM-readable strings; expand `InvoiceField` enum
- `src/sessions/manager.py` — Add `state`, `extracted_data`, `confidence` fields to session dict
- `src/agent/runner.py` — Replace LangChain graph with a direct call to `run_orchestrator()`; delete `_make_tools()`
- `tests/test_tools.py` — Update assertions for new structured return types

---

## Task 1: Extractor V2 — add confidence_score and missing_fields

**Files:**
- Modify: `src/agent/extractor.py`
- Create: `tests/test_extractor_v2.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_extractor_v2.py
import pytest
from src.agent.extractor import ExtractedInvoice


def test_extracted_invoice_has_confidence_score():
    e = ExtractedInvoice(confidence_score=0.8, missing_fields=["due_date"])
    assert e.confidence_score == 0.8


def test_extracted_invoice_has_missing_fields():
    e = ExtractedInvoice(confidence_score=0.5, missing_fields=["due_date", "tva_rate"])
    assert "due_date" in e.missing_fields
    assert "tva_rate" in e.missing_fields


def test_confidence_score_defaults_to_zero():
    e = ExtractedInvoice()
    assert e.confidence_score == 0.0


def test_missing_fields_defaults_to_empty():
    e = ExtractedInvoice()
    assert e.missing_fields == []
```

- [ ] **Step 2: Run to verify they fail**

```
uv run pytest tests/test_extractor_v2.py -v
```
Expected: FAIL — `confidence_score` and `missing_fields` not on `ExtractedInvoice`.

- [ ] **Step 3: Add fields to ExtractedInvoice and update extractor prompt**

In `src/agent/extractor.py`, add two fields to `ExtractedInvoice` and update the `ainvoke` prompt:

```python
from typing import Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class ExtractedInvoice(BaseModel):
    client_first_name: Optional[str] = Field(None, description="Client's first name")
    client_last_name: Optional[str] = Field(None, description="Client's last name")
    client_address: Optional[str] = Field(None, description="Client's address if mentioned")
    client_email: Optional[str] = Field(None, description="Client's email if mentioned")
    client_phone: Optional[str] = Field(None, description="Client's phone number if mentioned")
    description: Optional[str] = Field(None, description="Description of the service/product")
    amount: Optional[float] = Field(None, description="Total amount excluding tax")
    qty: Optional[float] = Field(None, description="Quantity or number of hours (default 1)")
    unit_price: Optional[float] = Field(None, description="Unit price excluding tax if mentioned separately")
    tva_rate: Optional[float] = Field(None, description="VAT rate in % if mentioned (e.g. 20)")
    due_date: Optional[str] = Field(None, description="Due date ISO (YYYY-MM-DD) if mentioned")
    payment_terms: Optional[str] = Field(None, description="Payment terms if mentioned")
    confidence_score: float = Field(
        0.0,
        description=(
            "Your overall confidence that the extraction is complete and correct. "
            "0.0 = almost nothing extracted, 1.0 = all fields clearly stated. "
            "Compute as: (number of non-null fields / 6) capped at 1.0."
        ),
    )
    missing_fields: list[str] = Field(
        default_factory=list,
        description=(
            "List of invoice field names that are clearly missing from the transcript. "
            "Only include fields from: client_first_name, description, unit_price, tva_rate, due_date. "
            "Do not include a field if it was mentioned even implicitly."
        ),
    )


async def extract_from_transcript(transcript: str, api_key: str) -> ExtractedInvoice:
    """Extracts all invoice fields from a voice transcript in one structured LLM call."""
    llm = ChatOpenAI(model="gpt-4o-mini", api_key=api_key, temperature=0)
    structured = llm.with_structured_output(ExtractedInvoice)

    result = await structured.ainvoke(
        f"""You are extracting structured invoice data from a voice transcript.

CRITICAL RULES:
- Only extract real invoice information (client, service, price, date).
- IGNORE voice command artefacts: words like "mets", "ajoute", "crée", "facture pour", "start",
  "record", "ok", "hey", "canine", "voice", "fort" and similar are NOT product descriptions.
  They are recognition noise — discard them entirely.
- description: MUST ONLY contain the clean service or product name (e.g. "Web development",
  "Logo design", "Consulting"). ALL quantities, durations, or measurements MUST be EXCLUDED from
  the description. Example: "3 hours of web development" -> description="Web development", qty=3.
  If you cannot identify a clean service name with confidence, leave it null.
- qty: exactly the number of units/hours/days mentioned (default 1). If the description mentions
  "a", "one", "2 hours", extract the number into qty and remove it from the description.
- unit_price: price per unit. If only a total is given: unit_price=total/qty.
- Leave all fields null if the information is not clearly stated.
- For client name: separate first name and last name if both are present.
- confidence_score: compute as (number of non-null fields among client_first_name, description,
  unit_price, qty, tva_rate, due_date) / 6, capped at 1.0.
- missing_fields: list fields from [client_first_name, description, unit_price, tva_rate, due_date]
  that are clearly absent from the transcript.

Transcript: {transcript}"""
    )
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

```
uv run pytest tests/test_extractor_v2.py -v
```
Expected: PASS (4 tests).

- [ ] **Step 5: Run full suite to catch regressions**

```
uv run pytest -v
```
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/agent/extractor.py tests/test_extractor_v2.py
git commit -m "feat(extractor): add confidence_score and missing_fields to ExtractedInvoice"
```

---

## Task 2: Session Manager — add state, extracted_data, confidence

**Files:**
- Modify: `src/sessions/manager.py`
- Modify: `tests/test_session_manager.py`

- [ ] **Step 1: Write failing tests**

Add at the end of `tests/test_session_manager.py`:

```python
def test_session_has_state_field():
    store = SessionStore()
    sid = store.create("u1")
    assert store.get(sid)["state"] == "INIT"


def test_session_has_extracted_data_field():
    store = SessionStore()
    sid = store.create("u1")
    assert store.get(sid)["extracted_data"] == {}


def test_session_has_confidence_field():
    store = SessionStore()
    sid = store.create("u1")
    assert store.get(sid)["confidence"] == 0.0
```

- [ ] **Step 2: Run to verify they fail**

```
uv run pytest tests/test_session_manager.py -v -k "state or extracted_data or confidence"
```
Expected: FAIL — keys not present.

- [ ] **Step 3: Add fields to SessionStore.create()**

In `src/sessions/manager.py`, update the dict inside `create()`:

```python
# src/sessions/manager.py
import asyncio
import uuid
from typing import Any


class SessionNotFound(Exception):
    pass


class SessionNotAwaiting(Exception):
    pass


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, dict] = {}

    def create(self, user_id: str) -> str:
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = {
            "user_id": user_id,
            "sse_queue": asyncio.Queue(),
            "reply_queue": asyncio.Queue(),
            "awaiting_reply": False,
            "last_question": None,
            "invoice_id": None,
            "status": "active",  # active | awaiting_reply | done | error
            "stream_connected": False,
            "invoice_draft": {},  # live copy of filled fields
            "missing_fields": ["client_id", "lines", "tva_rate"],
            # V2 fields
            "state": "INIT",
            "extracted_data": {},
            "confidence": 0.0,
        }
        return session_id

    def get(self, session_id: str) -> dict:
        if session_id not in self._sessions:
            raise SessionNotFound(session_id)
        return self._sessions[session_id]

    async def push_event(self, session_id: str, event: dict[str, Any]) -> None:
        session = self.get(session_id)
        await session["sse_queue"].put(event)

    async def push_reply(self, session_id: str, reply: str) -> None:
        session = self.get(session_id)
        if not session["awaiting_reply"]:
            raise SessionNotAwaiting(session_id)
        session["awaiting_reply"] = False
        await session["reply_queue"].put(reply)

    def cleanup(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


# Global singleton
session_store = SessionStore()
```

- [ ] **Step 4: Run tests to verify they pass**

```
uv run pytest tests/test_session_manager.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/sessions/manager.py tests/test_session_manager.py
git commit -m "feat(sessions): add state, extracted_data, confidence fields to session"
```

---

## Task 3: Business Logic Layer

**Files:**
- Create: `src/agent/business_logic.py`
- Create: `tests/test_business_logic.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_business_logic.py
import pytest
from src.agent.business_logic import build_invoice_lines, normalize_client_name, validate_invoice
from src.agent.extractor import ExtractedInvoice


# --- normalize_client_name ---

def test_normalize_client_name_both_parts():
    assert normalize_client_name("Marie", "Dupont") == "Marie Dupont"


def test_normalize_client_name_first_only():
    assert normalize_client_name("Marie", None) == "Marie"


def test_normalize_client_name_last_only():
    assert normalize_client_name(None, "Dupont") == "Dupont"


def test_normalize_client_name_both_none():
    assert normalize_client_name(None, None) is None


# --- build_invoice_lines ---

def test_build_invoice_lines_with_unit_price():
    extracted = ExtractedInvoice(description="Web dev", qty=3.0, unit_price=150.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Web dev", "qty": 3.0, "unit_price": 150.0}]


def test_build_invoice_lines_with_amount_no_unit_price():
    extracted = ExtractedInvoice(description="Logo design", qty=1.0, amount=500.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Logo design", "qty": 1.0, "unit_price": 500.0}]


def test_build_invoice_lines_with_amount_and_qty():
    extracted = ExtractedInvoice(description="Consulting", qty=4.0, amount=800.0)
    lines = build_invoice_lines(extracted)
    assert lines == [{"description": "Consulting", "qty": 4.0, "unit_price": 200.0}]


def test_build_invoice_lines_no_description_returns_none():
    extracted = ExtractedInvoice(qty=3.0, unit_price=150.0)
    assert build_invoice_lines(extracted) is None


def test_build_invoice_lines_no_price_returns_none():
    extracted = ExtractedInvoice(description="Web dev", qty=3.0)
    assert build_invoice_lines(extracted) is None


def test_build_invoice_lines_defaults_qty_to_one():
    extracted = ExtractedInvoice(description="Logo", unit_price=300.0)
    lines = build_invoice_lines(extracted)
    assert lines[0]["qty"] == 1.0


# --- validate_invoice ---

def test_validate_invoice_passes_when_all_fields_present():
    draft = {"client_id": "c1", "lines": [{"description": "Dev", "qty": 1, "unit_price": 500}], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is True
    assert result["errors"] == []


def test_validate_invoice_fails_when_client_id_missing():
    draft = {"lines": [{"description": "Dev", "qty": 1, "unit_price": 500}], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("client_id" in e for e in result["errors"])


def test_validate_invoice_fails_when_lines_empty():
    draft = {"client_id": "c1", "lines": [], "tva_rate": 20}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("lines" in e for e in result["errors"])


def test_validate_invoice_fails_when_tva_rate_missing():
    draft = {"client_id": "c1", "lines": [{"description": "Dev", "qty": 1, "unit_price": 500}]}
    result = validate_invoice(draft)
    assert result["is_valid"] is False
    assert any("tva_rate" in e for e in result["errors"])
```

- [ ] **Step 2: Run to verify they fail**

```
uv run pytest tests/test_business_logic.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement business_logic.py**

```python
# src/agent/business_logic.py
from typing import Optional
from src.agent.extractor import ExtractedInvoice

MANDATORY_FIELDS = ["client_id", "lines", "tva_rate"]


def normalize_client_name(first: Optional[str], last: Optional[str]) -> Optional[str]:
    """Combines first and last name into a single string. Returns None if both are None."""
    parts = [p for p in (first, last) if p]
    return " ".join(parts) if parts else None


def build_invoice_lines(extracted: ExtractedInvoice) -> Optional[list[dict]]:
    """Build invoice lines list from extracted data. Returns None if insufficient data."""
    if not extracted.description:
        return None

    unit_price = extracted.unit_price
    if unit_price is None and extracted.amount is not None:
        qty = extracted.qty or 1.0
        unit_price = extracted.amount / qty

    if unit_price is None:
        return None

    return [{
        "description": extracted.description,
        "qty": float(extracted.qty or 1.0),
        "unit_price": float(unit_price),
    }]


def validate_invoice(draft: dict) -> dict:
    """Validates mandatory invoice fields. Returns {is_valid: bool, errors: list[str]}."""
    errors = []

    if not draft.get("client_id"):
        errors.append("client_id is required")

    lines = draft.get("lines")
    if not lines:
        errors.append("lines must be non-empty")

    if draft.get("tva_rate") is None:
        errors.append("tva_rate is required")

    return {"is_valid": len(errors) == 0, "errors": errors}
```

- [ ] **Step 4: Run tests to verify they pass**

```
uv run pytest tests/test_business_logic.py -v
```
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/business_logic.py tests/test_business_logic.py
git commit -m "feat(business-logic): add build_invoice_lines, normalize_client_name, validate_invoice"
```

---

## Task 4: Event Constants

**Files:**
- Create: `src/agent/events.py`

No tests needed — pure constants.

- [ ] **Step 1: Create events.py**

```python
# src/agent/events.py
"""
SSE event type constants for V2.

Frontend mapping (old → new):
  message/thinking  → MESSAGE
  invoice_update    → INVOICE_UPDATED
  ui_action         → NEED_CLIENT_INFO
  question          → WAITING_USER_INPUT
  profile           → PROFILE
  done              → DONE
  error             → ERROR
  ping              → PING
"""


class EventType:
    MESSAGE = "MESSAGE"
    INVOICE_UPDATED = "INVOICE_UPDATED"
    NEED_CLIENT_INFO = "NEED_CLIENT_INFO"
    WAITING_USER_INPUT = "WAITING_USER_INPUT"
    PROFILE = "PROFILE"
    DONE = "DONE"
    ERROR = "ERROR"
    PING = "PING"


def make_event(type_: str, **data) -> dict:
    return {"type": type_, **data}
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/events.py
git commit -m "feat(events): add SSE event type constants for V2"
```

---

## Task 5: Refactor Tools — structured return types

The orchestrator needs to act on tool results deterministically. Three tools currently return LLM-readable strings; refactor them to return structured data. The SSE side-effects (pushing events to the queue) are preserved.

**Files:**
- Modify: `src/agent/tools.py`
- Modify: `tests/test_tools.py`

- [ ] **Step 1: Update test assertions for new return types**

Replace the three affected test functions in `tests/test_tools.py`:

```python
# In tests/test_tools.py — replace existing test_get_user_profile_* and test_search_client_*

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
```

- [ ] **Step 2: Run updated tests to confirm they fail**

```
uv run pytest tests/test_tools.py::test_get_user_profile_returns_profile_object tests/test_tools.py::test_get_user_profile_returns_none_when_not_found tests/test_tools.py::test_search_client_returns_found_dict -v
```
Expected: FAIL.

- [ ] **Step 3: Refactor tool_get_user_profile and tool_search_client in tools.py**

Replace the implementations of `tool_get_user_profile`, `tool_search_client`, and `tool_create_client` in `src/agent/tools.py`:

```python
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
        session["status"] = "error"
        await session_store.push_event(session_id, {"type": "ERROR", "message": "No response received within 5 minutes."})
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
            await session_store.push_event(session_id, {"type": "INVOICE_UPDATED", "field": field, "value": value})


async def tool_get_user_profile(user_id: str, session_id: str) -> Optional[UserProfile]:
    """Returns the UserProfile or None if not found. Pushes PROFILE event to SSE."""
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": "Loading your profile..."})
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, partial(get_user, user_id))
    if profile:
        await session_store.push_event(session_id, {
            "type": "PROFILE",
            "data": profile.model_dump(mode="json"),
        })
    return profile


async def tool_search_client(name: str, user_id: str, session_id: str) -> dict:
    """
    Searches for a client by name.
    Returns:
      {"found": True, "client": Client, "form_data": None}  — client exists in DB
      {"found": False, "client": None, "form_data": dict}   — user submitted new client form
    """
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": f"Searching for client {name}..."})
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
        "type": "WAITING_USER_INPUT",
        "message": "I'll create this client. Please fill in this short form.",
        "awaiting": True,
    })
    await session_store.push_event(session_id, {
        "type": "NEED_CLIENT_INFO",
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
                return {"found": False, "client": None, "form_data": data}
        except (json.JSONDecodeError, ValueError):
            await session_store.push_event(session_id, {
                "type": "WAITING_USER_INPUT",
                "message": "Please use the form on screen to enter the contact details.",
                "awaiting": True,
            })


async def tool_create_client(
    name: str, address: str, user_id: str, session_id: str,
    email: str = "", company: str = "", phone: str = "",
) -> Client:
    """Creates a new client record. Returns the created Client with its id."""
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": f"Adding client {name}..."})
    client = Client(id="", user_id=user_id, name=name, address=address, email=email or None, company=company or None, phone=phone or None)
    loop = asyncio.get_running_loop()
    created = await loop.run_in_executor(None, partial(create_client_record, client))
    await _push_client_fields(session_id, name, address, email, phone)
    return created


async def tool_create_invoice_draft(user_id: str, session_id: str) -> str:
    """Creates a draft invoice. Sets session['invoice_id']. Returns invoice_id."""
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": "Preparing your invoice draft..."})
    loop = asyncio.get_running_loop()
    invoice_id = await loop.run_in_executor(None, partial(db_create_draft, user_id, session_id))

    due_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    await loop.run_in_executor(None, partial(update_invoice_in_db, invoice_id, {"due_date": due_date}))

    session = session_store.get(session_id)
    session["invoice_id"] = invoice_id
    session["invoice_draft"]["due_date"] = due_date
    session["missing_fields"] = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    await session_store.push_event(session_id, {"type": "INVOICE_UPDATED", "field": "status", "value": "draft"})
    await session_store.push_event(session_id, {"type": "INVOICE_UPDATED", "field": "due_date", "value": due_date})
    return invoice_id


async def tool_update_invoice_field(field: InvoiceField, value: Any, invoice_id: str, session_id: str) -> str:
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": "Updating the invoice..."})
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
        await session_store.push_event(session_id, {"type": "INVOICE_UPDATED", "field": k, "value": v})

    still_missing = session["missing_fields"]
    if still_missing:
        return f"Field {field_key} updated. Still missing: {still_missing}."
    return f"Field {field_key} updated. All mandatory fields filled."


async def tool_ask_user_question(message: str, session_id: str) -> str:
    session = session_store.get(session_id)
    session["awaiting_reply"] = True
    session["last_question"] = message
    await session_store.push_event(session_id, {"type": "WAITING_USER_INPUT", "message": message, "awaiting": True})
    try:
        reply = await asyncio.wait_for(session["reply_queue"].get(), timeout=QUESTION_TIMEOUT)
    except asyncio.TimeoutError:
        session["status"] = "error"
        await session_store.push_event(session_id, {"type": "ERROR", "message": "Call timed out."})
        return "Timeout: no reply received within 5 minutes."
    finally:
        session["awaiting_reply"] = False
    return reply


async def tool_finalize_invoice(session_id: str, invoice_id: str) -> str:
    await session_store.push_event(session_id, {"type": "MESSAGE", "content": "Finalizing the invoice..."})
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
        await session_store.push_event(session_id, {"type": "ERROR", "message": error_msg})
        return f"Error finalizing invoice: {str(e)}."

    session["status"] = "done"
    await session_store.push_event(session_id, {"type": "DONE", "invoice_id": invoice_id, "invoice_number": number})
    return f"Invoice confirmed. Number: {number}"
```

- [ ] **Step 4: Run the tools tests**

```
uv run pytest tests/test_tools.py -v
```
Expected: All pass (the old string-assert tests were replaced; `test_search_client_returns_not_found_message` was testing blocking behavior — remove it since `tool_search_client` now blocks indefinitely waiting for form data in the no-match case; test that path by mocking `_await_reply`).

Note: Delete `test_search_client_returns_not_found_message` from `test_tools.py` since that test triggered form-display blocking. Also delete `test_get_user_profile_emits_thinking_and_returns_profile` (event type changed from `thinking` to `MESSAGE`) and replace with the new ones above.

Also update the `test_update_invoice_field_emits_invoice_update_event` assertion from `"invoice_update"` to `"INVOICE_UPDATED"`, and `test_ask_user_question_suspends_and_returns_reply` from `"question"` to `"WAITING_USER_INPUT"`.

- [ ] **Step 5: Run full suite**

```
uv run pytest -v
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.py tests/test_tools.py
git commit -m "refactor(tools): structured return types, uppercase SSE event types"
```

---

## Task 6: Orchestrator — State Machine

**Files:**
- Create: `src/agent/orchestrator.py`
- Create: `tests/test_orchestrator.py`

- [ ] **Step 1: Write orchestrator tests**

```python
# tests/test_orchestrator.py
import asyncio
import pytest
from decimal import Decimal
from unittest.mock import patch, AsyncMock, MagicMock
from src.sessions.manager import SessionStore
from src.db.models import UserProfile, Client
from src.agent.extractor import ExtractedInvoice


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


async def test_orchestrator_transitions_to_done_on_happy_path(store, session_id):
    """Full path: extracted client found, all fields present, user confirms."""
    extracted = _make_extracted()
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=AsyncMock(return_value="ok")), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=AsyncMock(return_value="no")), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2 heures de dev web à 500€, TVA 20%")

    assert store.get(session_id)["state"] == "DONE"


async def test_orchestrator_asks_for_missing_tva(store, session_id):
    """When tva_rate is not extracted, orchestrator asks user and sets it."""
    extracted = ExtractedInvoice(
        client_first_name="Marie", client_last_name="Dupont",
        description="Web dev", qty=2.0, unit_price=500.0,
        tva_rate=None, confidence_score=0.7, missing_fields=["tva_rate"],
    )
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=None)
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    ask_mock = AsyncMock(side_effect=["20%", "no"])  # first call = tva reply, second = confirm

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=AsyncMock(return_value="ok")), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=ask_mock), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2h dev web 500€")

    assert store.get(session_id)["state"] == "DONE"
    assert ask_mock.call_count >= 1


async def test_orchestrator_creates_client_when_not_found(store, session_id):
    """When client not in DB, orchestrator creates it from form data."""
    extracted = _make_extracted()
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    new_client = Client(id="c2", user_id="user-1", name="Marie Dupont")

    search_result = {"found": False, "client": None, "form_data": {"name": "Marie Dupont", "email": "m@ex.com", "phone": ""}}

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value=search_result)), \
         patch("src.agent.orchestrator.tool_create_client", new=AsyncMock(return_value=new_client)), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=AsyncMock(return_value="ok")), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=AsyncMock(return_value="no")), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "Facture pour Marie Dupont, 2h dev web 500€")

    assert store.get(session_id)["state"] == "DONE"


async def test_orchestrator_asks_for_client_name_when_not_extracted(store, session_id):
    """When client name is absent from extraction, orchestrator asks."""
    extracted = ExtractedInvoice(
        description="Web dev", qty=2.0, unit_price=500.0,
        tva_rate=20.0, confidence_score=0.5, missing_fields=["client_first_name"],
    )
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    client = Client(id="c1", user_id="user-1", name="Marie Dupont")

    ask_mock = AsyncMock(side_effect=["Marie Dupont", "no"])

    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(return_value=extracted)), \
         patch("src.agent.orchestrator.tool_get_user_profile", new=AsyncMock(return_value=profile)), \
         patch("src.agent.orchestrator.tool_create_invoice_draft", new=AsyncMock(return_value="inv-1")), \
         patch("src.agent.orchestrator.tool_search_client", new=AsyncMock(return_value={"found": True, "client": client, "form_data": None})), \
         patch("src.agent.orchestrator.tool_update_invoice_field", new=AsyncMock(return_value="ok")), \
         patch("src.agent.orchestrator.tool_ask_user_question", new=ask_mock), \
         patch("src.agent.orchestrator.tool_finalize_invoice", new=AsyncMock(return_value="confirmed")), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "2 heures de dev web à 500€, TVA 20%")

    assert store.get(session_id)["state"] == "DONE"


async def test_orchestrator_sets_error_state_on_exception(store, session_id):
    """An unhandled exception puts the session in ERROR state."""
    with patch("src.agent.orchestrator.extract_from_transcript", new=AsyncMock(side_effect=RuntimeError("LLM down"))), \
         patch("src.agent.orchestrator.session_store", store):

        from src.agent.orchestrator import run_orchestrator
        await run_orchestrator(session_id, "user-1", "anything")

    assert store.get(session_id)["state"] == "ERROR"
```

- [ ] **Step 2: Run to verify they fail**

```
uv run pytest tests/test_orchestrator.py -v
```
Expected: FAIL — `src.agent.orchestrator` not found.

- [ ] **Step 3: Implement orchestrator.py**

```python
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
    old = session.get("state", AgentState.INIT)
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
                await session_store.push_event(session_id, {"type": "ERROR", "message": f"Agent error: {str(e)}"})
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
    # invoice_id is also stored in session["invoice_id"] by the tool

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
            "type": "ERROR",
            "message": f"Client search failed ({search_result['error']}). Please try again.",
        })
        session["status"] = "error"
        session["state"] = AgentState.ERROR.value
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
    session = session_store.get(session_id)  # re-fetch (state was updated inside tools)
    still_missing = [f for f in MANDATORY_FIELDS if not session["invoice_draft"].get(f)]

    for field_name in still_missing:
        if field_name == "tva_rate":
            reply = await tool_ask_user_question("What's the VAT rate? (e.g. 20%)", session_id)
            try:
                value = float(reply.replace("%", "").strip())
                await tool_update_invoice_field(InvoiceField.tva_rate, value, invoice_id, session_id)
            except ValueError:
                # ask once more
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
            # Re-extract from the user's reply for structured parsing
            from src.config import OPENAI_API_KEY
            sub_extracted = await extract_from_transcript(reply, OPENAI_API_KEY)
            sub_lines = build_invoice_lines(sub_extracted)
            if sub_lines:
                await tool_update_invoice_field(InvoiceField.lines, sub_lines, invoice_id, session_id)

        elif field_name == "client_id":
            # Should not happen — client was resolved above — but handle gracefully
            reply = await tool_ask_user_question("I couldn't find the client. Please provide their full name.", session_id)
            search_result = await tool_search_client(reply.strip(), user_id, session_id)
            if search_result["found"]:
                await tool_update_invoice_field(InvoiceField.client_id, search_result["client"].id, invoice_id, session_id)

    # ── VALIDATION ──────────────────────────────────────────────────────────
    _transition(session_id, AgentState.VALIDATION)
    session = session_store.get(session_id)
    validation = validate_invoice(session["invoice_draft"])

    if not validation["is_valid"]:
        errors_str = ", ".join(validation["errors"])
        await session_store.push_event(session_id, {
            "type": "ERROR",
            "message": f"Invoice is not valid: {errors_str}",
        })
        session["status"] = "error"
        session["state"] = AgentState.ERROR.value
        return

    confirm = await tool_ask_user_question(
        "Your invoice is ready. Would you like to modify anything?", session_id
    )
    wants_change = confirm.strip().lower() not in ("no", "non", "nope", "n", "good", "ok", "yes please finalize")

    if wants_change:
        # Re-enter missing fields loop with user's modification request
        # Simple approach: ask what they want to change and extract it
        what = await tool_ask_user_question("What would you like to change?", session_id)
        # Re-extract tva or lines from the change request
        from src.config import OPENAI_API_KEY
        change_extracted = await extract_from_transcript(what, OPENAI_API_KEY)
        if change_extracted.tva_rate is not None:
            await tool_update_invoice_field(InvoiceField.tva_rate, change_extracted.tva_rate, invoice_id, session_id)
        new_lines = build_invoice_lines(change_extracted)
        if new_lines:
            await tool_update_invoice_field(InvoiceField.lines, new_lines, invoice_id, session_id)
        # Ask for final confirmation
        await tool_ask_user_question("Got it. Anything else to change? (say 'no' to finalize)", session_id)

    # ── FINALIZATION ────────────────────────────────────────────────────────
    _transition(session_id, AgentState.FINALIZATION)
    await tool_finalize_invoice(session_id, invoice_id)

    _transition(session_id, AgentState.DONE)
```

- [ ] **Step 4: Run orchestrator tests**

```
uv run pytest tests/test_orchestrator.py -v
```
Expected: PASS (5 tests).

- [ ] **Step 5: Run full suite**

```
uv run pytest -v
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/agent/orchestrator.py tests/test_orchestrator.py
git commit -m "feat(orchestrator): deterministic state machine replaces LangChain agent"
```

---

## Task 7: Replace runner.py — delegate to orchestrator

**Files:**
- Modify: `src/agent/runner.py`

- [ ] **Step 1: Replace runner.py**

```python
# src/agent/runner.py
"""
V2: run_agent delegates entirely to the orchestrator.
The LangChain agent and _make_tools() are removed.
"""
from src.agent.orchestrator import run_orchestrator


async def run_agent(session_id: str, user_id: str, transcript: str) -> None:
    """Public API unchanged — called by FastAPI BackgroundTask in routes."""
    await run_orchestrator(session_id, user_id, transcript)
```

- [ ] **Step 2: Run the full test suite**

```
uv run pytest -v
```
Expected: all pass. The route tests use `run_agent` via `BackgroundTasks` — the public signature is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/agent/runner.py
git commit -m "refactor(runner): delegate to orchestrator, remove LangChain agent"
```

---

## Task 8: Structured Logging

**Files:**
- Create: `src/agent/logger.py`
- Modify: `main.py`

- [ ] **Step 1: Create logger.py**

```python
# src/agent/logger.py
"""
Configure structured JSON logging for the agent pipeline.
Import and call configure_logging() once at application startup.
"""
import logging
import json
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        try:
            payload = json.loads(record.getMessage())
            base.update(payload)
        except (json.JSONDecodeError, ValueError):
            base["message"] = record.getMessage()
        if record.exc_info:
            base["exception"] = self.formatException(record.exc_info)
        return json.dumps(base)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    # Silence noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
```

- [ ] **Step 2: Wire into main.py**

Read `main.py` first, then add after the existing imports (before `app = FastAPI(...)`):

```python
from src.agent.logger import configure_logging
configure_logging()
```

- [ ] **Step 3: Run server briefly to verify JSON logs appear**

```
uvicorn main:app --reload
```
Expected: startup logs appear as JSON objects in stdout.

- [ ] **Step 4: Run full test suite**

```
uv run pytest -v
```
Expected: all pass (logging config does not affect tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/logger.py main.py
git commit -m "feat(logging): structured JSON logging for agent pipeline"
```

---

## Self-Review

### Spec coverage check

| PRD requirement | Covered |
|---|---|
| Extractor V2: confidence_score, missing_fields | Task 1 |
| Orchestrator with AgentState enum | Task 6 |
| CLIENT_RESOLUTION state | Task 6 |
| DRAFT_CREATION state | Task 6 |
| LINE_BUILDING state | Task 6 |
| MISSING_FIELDS state (ask one field at a time) | Task 6 |
| VALIDATION state (validate_invoice) | Task 3 + Task 6 |
| FINALIZATION state | Task 6 |
| Business Logic Layer (build_invoice_lines, normalize_client_name) | Task 3 |
| Tools are purely executive (no LangChain decision) | Tasks 5 + 7 |
| Validation Layer (validate_invoice output with is_valid + errors) | Task 3 |
| Event system refactor (uppercase types, NEED_CLIENT_INFO) | Tasks 4 + 5 |
| Session upgrades (state, extracted_data, confidence) | Task 2 |
| Structured logging with STATE_CHANGE, TRANSCRIPT, EXTRACTED events | Task 8 |
| LLM = extractor + assistant only | Tasks 6 + 7 |

### Placeholder scan

No TBDs or missing code blocks. All method signatures used across tasks are consistent.

### Type consistency

- `tool_get_user_profile` returns `Optional[UserProfile]` — used as `profile.default_tva` in orchestrator (guarded by `if profile is not None`). ✓
- `tool_search_client` returns `dict` with keys `found`, `client`, `form_data`, `error` — orchestrator accesses `search_result["found"]`, `search_result["client"].id`, `search_result["form_data"]`. ✓
- `tool_create_client` returns `Client` — orchestrator accesses `created.id`. ✓
- `build_invoice_lines` returns `Optional[list[dict]]` — checked with `if lines:` before calling `tool_update_invoice_field`. ✓
- `InvoiceField` enum expanded to include `due_date`, `payment_terms` — only `client_id`, `lines`, `tva_rate` used in orchestrator (same as MANDATORY_FIELDS). ✓
