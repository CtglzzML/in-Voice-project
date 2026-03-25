# Invoice AI Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FastAPI backend with a LangChain agent that creates invoices in real-time via SSE streaming, driven by a user's voice transcript and Supabase data.

**Architecture:** FastAPI exposes 3 endpoints (start, stream, reply). Each session owns two asyncio queues (sse_queue for frontend events, reply_queue for user answers). A LangChain tool-calling agent runs as a background asyncio task, calls Supabase tools that emit SSE events as they execute, and suspends via `ask_user_question` when required fields are missing.

**Tech Stack:** Python 3.13, FastAPI, LangChain (`langchain-anthropic`), `supabase-py`, `sse-starlette`, `pytest-asyncio`, `python-dotenv`

**Spec:** `docs/superpowers/specs/2026-03-22-invoice-agent-design.md`

---

## File Structure

```
src/
  config.py             # env vars loader (SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY)
  db/
    supabase.py         # Supabase client (lazy init) + raw query helpers
    models.py           # Pydantic models: UserProfile, Client, InvoiceLine, Invoice
  sessions/
    manager.py          # SessionStore: create/get/cleanup sessions + asyncio queues
  agent/
    tools.py            # All 6 LangChain tools (get_user_profile, search_client, etc.)
    runner.py           # Agent setup (system prompt, tools binding) + run_agent()
  api/
    schemas.py          # Request/Response Pydantic schemas for API endpoints
    routes.py           # FastAPI router: /start, /stream, /reply
main.py                 # FastAPI app creation + router mounting
tests/
  conftest.py           # Shared fixtures (mock Supabase, session store, test client)
  test_models.py        # Unit tests for Pydantic models and computed fields
  test_supabase.py      # Unit tests for Supabase query helpers (mocked client)
  test_session_manager.py  # Unit tests for session lifecycle
  test_tools.py         # Unit tests for each agent tool (mocked Supabase)
  test_routes.py        # Integration tests for all 3 API endpoints
```

---

## Task 1: Project setup

**Files:**
- Modify: `pyproject.toml`
- Create: `.env.example`
- Create: `src/config.py`
- Create: `src/__init__.py`

- [ ] **Step 1: Add dependencies to pyproject.toml**

```toml
[project]
name = "ia-invoce"
version = "0.1.0"
description = "Invoice AI Agent"
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "sse-starlette>=2.1.0",
    "langchain>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "supabase>=2.9.0",
    "python-dotenv>=1.0.0",
    "pydantic>=2.9.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
]
```

- [ ] **Step 2: Install dependencies**

```bash
cd "C:/Users/eliot/Documents/projet claude/Etudes_projet/IA invoce"
.venv/Scripts/pip install -e ".[dev]"
```

Expected: all packages installed without errors.

- [ ] **Step 3: Create .env.example**

```bash
# .env.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 4: Create src/config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]
ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
```

- [ ] **Step 5: Create src/__init__.py** (empty file)

- [ ] **Step 6: Create .env** from .env.example, fill real values (not committed)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml .env.example src/config.py src/__init__.py
git commit -m "feat: project setup with dependencies and config"
```

---

## Task 2: DB models

**Files:**
- Create: `src/db/__init__.py`
- Create: `src/db/models.py`
- Create: `tests/test_models.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Write failing tests for models**

```python
# tests/test_models.py
from decimal import Decimal
from src.db.models import InvoiceLine, compute_totals

def test_invoice_line_total_is_qty_times_unit_price():
    line = InvoiceLine(description="Dev web", qty=Decimal("1.5"), unit_price=Decimal("800"))
    assert line.total == Decimal("1200.00")

def test_compute_totals_with_tva():
    from src.db.models import InvoiceTotals
    lines = [
        InvoiceLine(description="Dev web", qty=Decimal("1"), unit_price=Decimal("1000")),
    ]
    totals = compute_totals(lines, tva_rate=Decimal("20"))
    assert totals.subtotal == Decimal("1000")
    assert totals.tva_amount == Decimal("200")
    assert totals.total == Decimal("1200")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "C:/Users/eliot/Documents/projet claude/Etudes_projet/IA invoce"
.venv/Scripts/pytest tests/test_models.py -v
```

Expected: `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Create src/db/__init__.py and src/db/models.py**

```python
# src/db/models.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/Scripts/pytest tests/test_models.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/ tests/__init__.py tests/test_models.py
git commit -m "feat: db models with computed invoice totals"
```

---

## Task 3: Supabase client

**Files:**
- Create: `src/db/supabase.py`
- Modify: `tests/conftest.py` (add Supabase mock fixture)

- [ ] **Step 1: Create conftest.py with mock Supabase fixture**

```python
# tests/conftest.py
import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_supabase(monkeypatch):
    """Replaces the lazy Supabase client with a mock.
    Patches _get_client() so the real create_client() is never called at import time.
    """
    mock = MagicMock()
    import src.db.supabase as db_module
    monkeypatch.setattr(db_module, "_get_client", lambda: mock)
    return mock
```

- [ ] **Step 2: Write failing tests for Supabase helpers**

```python
# tests/test_supabase.py
import pytest
from unittest.mock import MagicMock

def test_get_user_returns_user_profile(mock_supabase):
    from src.db.supabase import get_user
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "user-1", "name": "Alice", "siret": "12345678900001",
        "address": "1 rue de Paris", "default_tva": 20.0,
        "email": None, "tva_number": None, "logo_url": None,
    }
    user = get_user("user-1")
    assert user.name == "Alice"
    assert user.siret == "12345678900001"

def test_get_user_returns_none_if_not_found(mock_supabase):
    from src.db.supabase import get_user
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
    user = get_user("nonexistent")
    assert user is None

def test_search_clients_returns_list(mock_supabase):
    from src.db.supabase import search_clients
    mock_supabase.table.return_value.select.return_value.eq.return_value.ilike.return_value.execute.return_value.data = [
        {"id": "c1", "user_id": "user-1", "name": "Marie Dupont", "email": None, "address": "2 rue Lyon", "company": None}
    ]
    results = search_clients("Marie", "user-1")
    assert len(results) == 1
    assert results[0].name == "Marie Dupont"
```

- [ ] **Step 3: Run to verify they fail**

```bash
.venv/Scripts/pytest tests/test_supabase.py -v
```

Expected: `ImportError`.

- [ ] **Step 4: Create src/db/supabase.py**

```python
# src/db/supabase.py
from typing import Optional
from supabase import create_client, Client
from src.config import SUPABASE_URL, SUPABASE_KEY
from src.db.models import UserProfile, Client as ClientModel, InvoiceLine
from decimal import Decimal
import datetime
import uuid

# Lazy initialization: client is created on first use, not at import time.
# This allows tests to patch _client before it is ever accessed.
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
        "id": str(uuid.uuid4()),
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
    """Generates YYYY-MM-NNN number (sequential per user per month) and assigns it."""
    today = datetime.date.today()
    prefix = today.strftime("%Y-%m")
    count_data = _get_client().table("invoices").select("id", count="exact").eq("user_id", user_id).eq("status", "confirmed").like("invoice_number", f"{prefix}-%").execute()
    n = (count_data.count or 0) + 1
    number = f"{prefix}-{n:03d}"
    update_invoice_in_db(invoice_id, {"invoice_number": number})
    return number
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/Scripts/pytest tests/test_supabase.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/supabase.py tests/conftest.py tests/test_supabase.py
git commit -m "feat: supabase client with user, client, and invoice helpers"
```

---

## Task 4: Session manager

**Files:**
- Create: `src/sessions/__init__.py`
- Create: `src/sessions/manager.py`
- Create: `tests/test_session_manager.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_session_manager.py
import asyncio
import pytest
from src.sessions.manager import SessionStore, SessionNotFound, SessionNotAwaiting

@pytest.fixture
def store():
    return SessionStore()

def test_create_session_returns_session_id(store):
    sid = store.create("user-1")
    assert len(sid) == 36  # UUID4

def test_get_nonexistent_session_raises(store):
    with pytest.raises(SessionNotFound):
        store.get("nope")

@pytest.mark.asyncio
async def test_push_sse_event_readable_from_queue(store):
    sid = store.create("user-1")
    session = store.get(sid)
    await store.push_event(sid, {"type": "thinking", "message": "test"})
    event = await asyncio.wait_for(session["sse_queue"].get(), timeout=1)
    assert event["type"] == "thinking"

@pytest.mark.asyncio
async def test_reply_to_awaiting_session(store):
    sid = store.create("user-1")
    store.get(sid)["awaiting_reply"] = True
    await store.push_reply(sid, "20")
    reply = await asyncio.wait_for(store.get(sid)["reply_queue"].get(), timeout=1)
    assert reply == "20"

def test_reply_to_non_awaiting_raises(store):
    sid = store.create("user-1")
    with pytest.raises(SessionNotAwaiting):
        asyncio.get_event_loop().run_until_complete(store.push_reply(sid, "20"))

def test_cleanup_removes_session(store):
    sid = store.create("user-1")
    store.cleanup(sid)
    with pytest.raises(SessionNotFound):
        store.get(sid)
```

- [ ] **Step 2: Run to verify they fail**

```bash
.venv/Scripts/pytest tests/test_session_manager.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Create src/sessions/manager.py**

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
        await session["reply_queue"].put(reply)

    def cleanup(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


# Global singleton
session_store = SessionStore()
```

- [ ] **Step 4: Create src/sessions/__init__.py** (empty)

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/Scripts/pytest tests/test_session_manager.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sessions/ tests/test_session_manager.py
git commit -m "feat: session manager with asyncio queues and lifecycle"
```

---

## Task 5: Agent tools

**Files:**
- Create: `src/agent/__init__.py`
- Create: `src/agent/tools.py`
- Create: `tests/test_tools.py`

- [ ] **Step 1: Write failing tests for all 6 tools**

```python
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

def test_get_user_profile_emits_thinking_and_returns_profile(store, session_id):
    profile = UserProfile(id="user-1", name="Alice", siret="123", address="Paris", default_tva=Decimal("20"))
    with patch("src.agent.tools.get_user", return_value=profile):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_get_user_profile
            result = asyncio.get_event_loop().run_until_complete(
                tool_get_user_profile("user-1", session_id)
            )
    assert "Alice" in result
    event = asyncio.get_event_loop().run_until_complete(
        asyncio.wait_for(store.get(session_id)["sse_queue"].get(), timeout=1)
    )
    assert event["type"] == "thinking"


def test_get_user_profile_returns_missing_fields_if_incomplete(store, session_id):
    profile = UserProfile(id="user-1", name=None, siret=None, address=None, default_tva=None)
    with patch("src.agent.tools.get_user", return_value=profile):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_get_user_profile
            result = asyncio.get_event_loop().run_until_complete(
                tool_get_user_profile("user-1", session_id)
            )
    assert "manquants" in result.lower() or "missing" in result.lower()


# --- search_client ---

def test_search_client_returns_found_client(store, session_id):
    clients = [Client(id="c1", user_id="user-1", name="Marie Dupont", address="Lyon")]
    with patch("src.agent.tools.search_clients", return_value=clients):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_search_client
            result = asyncio.get_event_loop().run_until_complete(
                tool_search_client("Marie", "user-1", session_id)
            )
    assert "Marie Dupont" in result


def test_search_client_returns_not_found_message(store, session_id):
    with patch("src.agent.tools.search_clients", return_value=[]):
        with patch("src.agent.tools.session_store", store):
            from src.agent.tools import tool_search_client
            result = asyncio.get_event_loop().run_until_complete(
                tool_search_client("Unknown", "user-1", session_id)
            )
    assert "introuvable" in result.lower() or "not found" in result.lower()


# --- update_invoice_field ---

def test_update_invoice_field_emits_invoice_update_event(store, session_id):
    store.get(session_id)["invoice_id"] = "inv-1"
    with patch("src.agent.tools.update_invoice_in_db"):
        with patch("src.agent.tools.get_invoice", return_value={"lines": [], "tva_rate": None}):
            with patch("src.agent.tools.session_store", store):
                from src.agent.tools import tool_update_invoice_field
                asyncio.get_event_loop().run_until_complete(
                    tool_update_invoice_field("payment_terms", "30 jours", "inv-1", session_id)
                )
    # drain thinking event first
    asyncio.get_event_loop().run_until_complete(store.get(session_id)["sse_queue"].get())
    event = asyncio.get_event_loop().run_until_complete(
        asyncio.wait_for(store.get(session_id)["sse_queue"].get(), timeout=1)
    )
    assert event["type"] == "invoice_update"
    assert event["field"] == "payment_terms"


# --- ask_user_question ---

@pytest.mark.asyncio
async def test_ask_user_question_suspends_and_returns_reply(store, session_id):
    """
    tool_ask_user_question must:
    1. Set awaiting_reply=True and emit a 'question' SSE event
    2. Block until reply_queue has a value
    3. Return the reply string and reset awaiting_reply=False

    We inject the reply by directly putting into reply_queue after a short delay,
    simulating what POST /api/invoice/reply does.
    """
    from src.agent.tools import tool_ask_user_question

    async def inject_reply_after_delay():
        # Wait for tool to set awaiting_reply and block on reply_queue.get()
        await asyncio.sleep(0.1)
        # Directly put into reply_queue (same as push_reply does after guard check)
        await store.get(session_id)["reply_queue"].put("20%")

    with patch("src.agent.tools.session_store", store):
        # Schedule reply injection concurrently — runs while tool is awaiting
        task = asyncio.create_task(inject_reply_after_delay())
        result = await tool_ask_user_question("Quel taux de TVA ?", session_id)
        await task  # ensure no dangling task

    assert result == "20%"
    assert store.get(session_id)["awaiting_reply"] is False
    # SSE queue should contain the question event
    event = store.get(session_id)["sse_queue"].get_nowait()
    assert event["type"] == "question"
    assert event["awaiting"] is True
```

- [ ] **Step 2: Run to verify they fail**

```bash
.venv/Scripts/pytest tests/test_tools.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Create src/agent/__init__.py and src/agent/tools.py**

```python
# src/agent/tools.py
import asyncio
import json
from decimal import Decimal
from enum import Enum
from typing import Any

from langchain_core.tools import tool

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

    # Validate field name against enum
    try:
        InvoiceField(field)
    except ValueError:
        return f"Champ '{field}' invalide. Champs valides : {[f.value for f in InvoiceField]}"

    invoice = get_invoice(invoice_id)
    updates: dict[str, Any] = {field: value}

    # Recalculate totals if financial field changed
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/Scripts/pytest tests/test_tools.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/ tests/test_tools.py
git commit -m "feat: langchain agent tools with SSE event emission"
```

---

## Task 6: Agent runner

**Files:**
- Create: `src/agent/runner.py`

*(No dedicated unit tests — the agent runner is integration-tested via routes in Task 8)*

- [ ] **Step 1: Create src/agent/runner.py**

```python
# src/agent/runner.py
import asyncio
from langchain_anthropic import ChatAnthropic
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from src.config import ANTHROPIC_API_KEY
from src.agent.tools import (
    tool_get_user_profile,
    tool_search_client,
    tool_create_invoice_draft,
    tool_update_invoice_field,
    tool_ask_user_question,
    tool_finalize_invoice,
    MANDATORY_FIELDS,
)
from src.sessions.manager import session_store


llm = ChatAnthropic(
    model="claude-sonnet-4-6",
    api_key=ANTHROPIC_API_KEY,
    temperature=0,
)


def _make_tools(session_id: str, user_id: str):
    """Return LangChain StructuredTools bound to the current session."""

    class GetUserProfileInput(BaseModel):
        user_id: str = Field(description="ID de l'utilisateur")

    class SearchClientInput(BaseModel):
        name: str = Field(description="Nom ou partie du nom du client")

    class CreateDraftInput(BaseModel):
        pass

    class UpdateFieldInput(BaseModel):
        field: str = Field(description=f"Champ à mettre à jour. Valeurs possibles : client_id, due_date, payment_terms, lines, tva_rate")
        value: str = Field(description="Nouvelle valeur du champ")
        invoice_id: str = Field(description="ID de la facture (invoice_id retourné par create_invoice_draft)")

    class AskQuestionInput(BaseModel):
        message: str = Field(description="Question à poser à l'utilisateur")

    class FinalizeInput(BaseModel):
        invoice_id: str = Field(description="ID de la facture à finaliser")

    return [
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_get_user_profile(user_id, session_id),
            name="get_user_profile",
            description="Charge le profil de l'émetteur depuis Supabase.",
            args_schema=GetUserProfileInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda name, **kw: tool_search_client(name, user_id, session_id),
            name="search_client",
            description="Recherche un client par nom dans la base.",
            args_schema=SearchClientInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda **kw: tool_create_invoice_draft(user_id, session_id),
            name="create_invoice_draft",
            description="Crée un brouillon de facture en base de données.",
            args_schema=CreateDraftInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda field, value, invoice_id, **kw: tool_update_invoice_field(field, value, invoice_id, session_id),
            name="update_invoice_field",
            description="Met à jour un champ de la facture.",
            args_schema=UpdateFieldInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda message, **kw: tool_ask_user_question(message, session_id),
            name="ask_user_question",
            description="Pose une question à l'utilisateur et attend sa réponse.",
            args_schema=AskQuestionInput,
        ),
        StructuredTool.from_function(
            coroutine=lambda invoice_id, **kw: tool_finalize_invoice(session_id, invoice_id),
            name="finalize_invoice",
            description="Finalise la facture quand tous les champs obligatoires sont remplis.",
            args_schema=FinalizeInput,
        ),
    ]


async def run_agent(session_id: str, user_id: str, transcript: str) -> None:
    """Background task: runs the LangChain agent for a session."""
    tools = _make_tools(session_id, user_id)
    prompt = ChatPromptTemplate.from_messages([
        ("system", f"""Tu es un assistant de facturation. Session: {session_id}. User: {user_id}.
Crée une facture complète en appelant les outils dans cet ordre :
1. get_user_profile
2. search_client (nom extrait du transcript)
3. create_invoice_draft
4. update_invoice_field pour chaque info disponible
5. ask_user_question pour chaque champ obligatoire manquant : {MANDATORY_FIELDS}
6. finalize_invoice quand tout est complet

Ne finalise que lorsque TOUS ces champs sont renseignés : {MANDATORY_FIELDS}.
Pose UNE seule question à la fois."""),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ])

    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=False, max_iterations=20)

    async def _delayed_cleanup():
        """Removes the session from memory 5 minutes after the agent finishes."""
        await asyncio.sleep(300)
        session_store.cleanup(session_id)

    try:
        await executor.ainvoke({"input": transcript})
    except Exception as e:
        try:
            session = session_store.get(session_id)
            if session["status"] != "done":
                await session_store.push_event(session_id, {"type": "error", "message": f"Erreur agent : {str(e)}"})
                session["status"] = "error"
        except Exception:
            pass  # session may already be cleaned up
    finally:
        # Non-blocking: schedule cleanup without blocking the current task
        asyncio.create_task(_delayed_cleanup())
```

- [ ] **Step 2: Verify import works**

```bash
cd "C:/Users/eliot/Documents/projet claude/Etudes_projet/IA invoce"
.venv/Scripts/python -c "from src.agent.runner import run_agent; print('OK')"
```

Expected: `OK` (no import errors).

- [ ] **Step 3: Commit**

```bash
git add src/agent/runner.py
git commit -m "feat: langchain agent runner with tool bindings"
```

---

## Task 7: API routes

**Files:**
- Create: `src/api/__init__.py`
- Create: `src/api/schemas.py`
- Create: `src/api/routes.py`
- Create: `main.py` (replace empty file)

- [ ] **Step 1: Create src/api/schemas.py**

```python
# src/api/schemas.py
from pydantic import BaseModel


class StartRequest(BaseModel):
    user_id: str
    transcript: str


class StartResponse(BaseModel):
    session_id: str


class ReplyRequest(BaseModel):
    session_id: str
    reply: str
```

- [ ] **Step 2: Create src/api/routes.py**

```python
# src/api/routes.py
import asyncio
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from src.api.schemas import StartRequest, StartResponse, ReplyRequest
from src.sessions.manager import session_store, SessionNotFound, SessionNotAwaiting
from src.agent.runner import run_agent

router = APIRouter(prefix="/api/invoice")


@router.post("/start", response_model=StartResponse)
async def start(body: StartRequest):
    session_id = session_store.create(body.user_id)
    asyncio.create_task(run_agent(session_id, body.user_id, body.transcript))
    return StartResponse(session_id=session_id)


@router.get("/stream")
async def stream(session_id: str):
    try:
        session = session_store.get(session_id)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")

    # Reconnection: replay last question if awaiting
    if session["awaiting_reply"] and session["last_question"]:
        await session["sse_queue"].put({
            "type": "question",
            "message": session["last_question"],
            "awaiting": True,
        })

    # Reconnection: replay done if already finished
    if session["status"] == "done" and session["invoice_id"]:
        await session["sse_queue"].put({"type": "done", "invoice_id": session["invoice_id"]})

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(session["sse_queue"].get(), timeout=30)
                yield {"data": json.dumps(event)}
                if event["type"] in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "ping"})}

    return EventSourceResponse(event_generator())


@router.post("/reply")
async def reply(body: ReplyRequest):
    try:
        await session_store.push_reply(body.session_id, body.reply)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionNotAwaiting:
        raise HTTPException(status_code=409, detail="Session is not awaiting a reply")
    return {}
```

- [ ] **Step 3: Update main.py**

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router

app = FastAPI(title="Invoice AI Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
```

- [ ] **Step 4: Verify the app starts**

```bash
cd "C:/Users/eliot/Documents/projet claude/Etudes_projet/IA invoce"
.venv/Scripts/python -c "from main import app; print('OK')"
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/api/ main.py
git commit -m "feat: fastapi routes for start, stream, and reply endpoints"
```

---

## Task 8: Integration tests for routes

**Files:**
- Create: `tests/test_routes.py`

- [ ] **Step 1: Write failing integration tests**

```python
# tests/test_routes.py
import asyncio
import json
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_start_returns_session_id():
    with patch("src.api.routes.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/invoice/start", json={"user_id": "u1", "transcript": "test"})
    assert resp.status_code == 200
    assert "session_id" in resp.json()


@pytest.mark.asyncio
async def test_stream_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/invoice/stream?session_id=nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/invoice/reply", json={"session_id": "nonexistent", "reply": "20"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_409_when_session_not_awaiting():
    from src.sessions.manager import session_store
    sid = session_store.create("u1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/invoice/reply", json={"session_id": sid, "reply": "20"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_stream_receives_event_pushed_to_queue():
    from src.sessions.manager import session_store
    with patch("src.api.routes.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/invoice/start", json={"user_id": "u1", "transcript": "test"})
    sid = resp.json()["session_id"]

    # Push a done event so the stream terminates
    await session_store.push_event(sid, {"type": "done", "invoice_id": "inv-1"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        async with ac.stream("GET", f"/api/invoice/stream?session_id={sid}") as stream:
            lines = []
            async for line in stream.aiter_lines():
                if line.startswith("data:"):
                    lines.append(json.loads(line[5:].strip()))
                    break  # only need first event

    assert lines[0]["type"] == "done"
```

- [ ] **Step 2: Run to verify they fail**

```bash
.venv/Scripts/pytest tests/test_routes.py -v
```

Expected: `ImportError` or test failures.

- [ ] **Step 3: Add pytest-asyncio config to pyproject.toml**

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/Scripts/pytest tests/test_routes.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
.venv/Scripts/pytest -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/test_routes.py pyproject.toml
git commit -m "test: integration tests for all API routes"
```

---

## Task 9: Manual smoke test

**Verification that the full system runs end-to-end.**

- [ ] **Step 1: Start the server**

```bash
cd "C:/Users/eliot/Documents/projet claude/Etudes_projet/IA invoce"
.venv/Scripts/uvicorn main:app --reload --port 8000
```

Expected: `Application startup complete.`

- [ ] **Step 2: Hit /start**

```bash
curl -X POST http://localhost:8000/api/invoice/start \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<your-supabase-user-uuid>", "transcript": "je veux facturer Marie Dupont 800 euros pour du développement web"}'
```

Expected: `{"session_id": "some-uuid"}`

- [ ] **Step 3: Open SSE stream in browser**

Open: `http://localhost:8000/api/invoice/stream?session_id=<session_id>`

Expected: SSE events streaming in (`thinking`, `invoice_update`, `question` if fields missing, `done` when complete).

- [ ] **Step 4: Reply to a question (if prompted)**

```bash
curl -X POST http://localhost:8000/api/invoice/reply \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<session_id>", "reply": "20"}'
```

Expected: `{}` and the SSE stream continues.

- [ ] **Step 5: Verify invoice in Supabase**

Check the `invoices` table in Supabase dashboard. The row should have `status=confirmed` and all mandatory fields filled.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete invoice AI agent backend"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | Project deps + config |
| 2 | DB models + totals computation |
| 3 | Supabase client helpers |
| 4 | Session manager (asyncio queues) |
| 5 | All 6 LangChain tools |
| 6 | Agent runner (LangChain executor) |
| 7 | FastAPI routes (start/stream/reply) |
| 8 | Integration tests |
| 9 | Manual smoke test |
