# API Refactor + Vanilla JS SDK — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the FastAPI backend into a versioned API (`/api/v1/`), add proper response schemas, fix the `assign_invoice_number` race condition, and ship a vanilla JS `InvoiceAgent` SDK with full documentation.

**Architecture:** Routes are split into `src/api/routes/invoice.py` and `src/api/routes/audio.py`, mounted under `/api/v1/`. The SDK (`sdk/invoice-sdk.js`) is a single-file vanilla JS class that wraps the full SSE/reply loop behind callbacks. No new external dependencies introduced.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, Supabase (PostgreSQL), pytest + httpx (tests), vanilla JS ES2020 (SDK)

**Spec:** `docs/superpowers/specs/2026-03-23-api-refactor-sdk-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/api/routes/__init__.py` | Package init |
| Create | `src/api/routes/invoice.py` | Invoice flow endpoints (start, stream, reply, get_invoice) |
| Create | `src/api/routes/audio.py` | Audio endpoints (transcribe, tts) |
| Delete | `src/api/routes.py` | Replaced by the directory above |
| Modify | `main.py` | Include new routers under `/api/v1/` + exception handlers |
| Modify | `src/db/models.py` | Add `InvoiceDetailResponse`, `InvoiceLineResponse`, `TTSRequest` |
| Modify | `src/db/supabase.py` | Replace `assign_invoice_number` with RPC call |
| Modify | `tests/test_routes.py` | Update URLs to `/api/v1/`, add audio route tests |
| Modify | `tests/test_supabase.py` | Update `assign_invoice_number` test to use RPC mock |
| Modify | `test_ui.html` | Update 6 hardcoded URLs |
| Create | `supabase/migrations/001_assign_invoice_number_atomic.sql` | Atomic PG function + advisory lock |
| Create | `sdk/invoice-sdk.js` | `InvoiceAgent` class |
| Create | `docs/README.md` | API + SDK documentation |

---

## Task 1: Atomic route split + versioning (single commit)

**Files:**
- Create: `src/api/routes/__init__.py`
- Create: `src/api/routes/invoice.py`
- Create: `src/api/routes/audio.py`
- Delete: `src/api/routes.py`
- Modify: `main.py`
- Modify: `tests/test_routes.py`
- Modify: `test_ui.html`

> **Why atomic:** splitting routes and adding the `/api/v1/` prefix must happen in one commit. Doing them separately produces a broken intermediate state where URLs change without versioning.

- [ ] **Step 1: Update tests to new URLs (they will fail)**

Edit `tests/test_routes.py` — replace all old URLs:

```python
# tests/test_routes.py
import asyncio
import json
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from main import app


@pytest.mark.asyncio
async def test_start_returns_session_id():
    with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/invoice/start", json={"user_id": "u1", "transcript": "test"})
        await asyncio.sleep(0)
    assert resp.status_code == 200
    assert "session_id" in resp.json()


@pytest.mark.asyncio
async def test_stream_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/v1/invoice/stream?session_id=nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_404_for_unknown_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/reply", json={"session_id": "nonexistent", "reply": "20"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reply_409_when_session_not_awaiting():
    from src.sessions.manager import session_store
    sid = session_store.create("u1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/reply", json={"session_id": sid, "reply": "20"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_stream_receives_event_pushed_to_queue():
    from src.sessions.manager import session_store
    with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/invoice/start", json={"user_id": "u1", "transcript": "test"})
    sid = resp.json()["session_id"]

    await session_store.push_event(sid, {"type": "done", "invoice_id": "inv-1"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        async with ac.stream("GET", f"/api/v1/invoice/stream?session_id={sid}") as s:
            assert "text/event-stream" in s.headers["content-type"]
            lines = []
            async for line in s.aiter_lines():
                if line.startswith("data:"):
                    lines.append(json.loads(line[5:].strip()))
                    break

    assert lines[0]["type"] == "done"


@pytest.mark.asyncio
async def test_transcribe_returns_transcript(monkeypatch):
    """Audio transcribe endpoint is reachable at /api/v1/audio/transcribe."""
    from unittest.mock import MagicMock, AsyncMock as AM
    import src.api.routes.audio as audio_mod

    mock_client = MagicMock()
    mock_transcription = MagicMock()
    mock_transcription.text = "Invoice for Jean Dupont"
    mock_client.audio.transcriptions.create = AM(return_value=mock_transcription)
    monkeypatch.setattr(audio_mod, "_openai_client", lambda: mock_client)

    import io
    audio_bytes = b"fake_audio_data"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/audio/transcribe",
            files={"audio": ("test.webm", io.BytesIO(audio_bytes), "audio/webm")},
        )
    assert resp.status_code == 200
    assert resp.json()["transcript"] == "Invoice for Jean Dupont"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/test_routes.py -v
```

Expected: 5 failures with `404 Not Found` (routes at new URLs don't exist yet) + 1 failure with `ImportError` for `test_transcribe_returns_transcript` (since `src.api.routes.audio` doesn't exist yet). All 6 should fail.

- [ ] **Step 3: Create `src/api/routes/` package**

```bash
mkdir "src/api/routes"
```

Create `src/api/routes/__init__.py` (empty):
```python
```

- [ ] **Step 4: Create `src/api/routes/invoice.py`**

```python
# src/api/routes/invoice.py
import asyncio
import json
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from src.api.schemas import StartRequest, StartResponse, ReplyRequest
from src.sessions.manager import session_store, SessionNotFound, SessionNotAwaiting
from src.agent.runner import run_agent

router = APIRouter(prefix="/invoice", tags=["Invoice"])


@router.post(
    "/start",
    response_model=StartResponse,
    summary="Start an invoice session",
    description=(
        "Creates a new invoice session and starts the AI agent in the background. "
        "Returns a `session_id` to use with `/stream` and `/reply`."
    ),
)
async def start(body: StartRequest):
    session_id = session_store.create(body.user_id)
    asyncio.create_task(run_agent(session_id, body.user_id, body.transcript))
    return StartResponse(session_id=session_id)


@router.get(
    "/stream",
    summary="SSE stream for session events",
    description=(
        "Server-Sent Events stream. Connect immediately after `/start`. "
        "Events: `thinking`, `profile`, `invoice_update`, `question`, `done`, `error`, `ping`. "
        "Stream closes automatically on `done` or `error`."
    ),
)
async def stream(session_id: str):
    try:
        session = session_store.get(session_id)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")

    already_connected = session["stream_connected"]
    session["stream_connected"] = True

    if already_connected:
        if session["awaiting_reply"] and session["last_question"]:
            await session["sse_queue"].put({
                "type": "question",
                "message": session["last_question"],
                "awaiting": True,
            })
        elif session["status"] == "done" and session["invoice_id"]:
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


@router.post(
    "/reply",
    summary="Send user reply to the agent",
    description=(
        "Unblocks the agent after it asked a question. "
        "Only valid when the session is in `awaiting_reply` state (after receiving a `question` SSE event). "
        "Returns 409 if the session is not currently waiting."
    ),
)
async def reply(body: ReplyRequest):
    try:
        await session_store.push_reply(body.session_id, body.reply)
    except SessionNotFound:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionNotAwaiting:
        raise HTTPException(status_code=409, detail="Session is not awaiting a reply")
    return {}


@router.get(
    "/{invoice_id}",
    summary="Get invoice details",
    description="Returns the full invoice record. Available immediately after the `done` SSE event.",
)
async def get_invoice_detail(invoice_id: str):
    from src.db.supabase import get_invoice
    invoice = get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
```

- [ ] **Step 5: Create `src/api/routes/audio.py`**

```python
# src/api/routes/audio.py
import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from src.db.models import TTSRequest
from src.config import OPENAI_API_KEY

router = APIRouter(prefix="/audio", tags=["Audio"])


def _openai_client():
    """Returns an AsyncOpenAI client. Extracted for testability."""
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


@router.post(
    "/transcribe",
    summary="Transcribe audio to text",
    description=(
        "Sends audio to OpenAI Whisper and returns the transcript. "
        "Accepts any audio format supported by Whisper (webm, mp3, wav, m4a…). "
        "Default language is `fr`. Override with `?language=en`."
    ),
)
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Query("fr", description="BCP-47 language code for Whisper (e.g. fr, en)"),
):
    client = _openai_client()
    audio_bytes = await audio.read()
    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = audio.filename or "audio.webm"

    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=file_obj,
        language=language,
    )
    return {"transcript": response.text}


@router.post(
    "/tts",
    summary="Text to speech",
    description=(
        "Converts text to speech using OpenAI TTS. Returns an MP3 audio stream. "
        "Default voice is `alloy`. Available voices: alloy, echo, fable, onyx, nova, shimmer."
    ),
)
async def tts(body: TTSRequest):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    client = _openai_client()
    response = await client.audio.speech.create(
        model="tts-1",
        voice=body.voice,
        input=text,
        response_format="mp3",
    )
    audio_bytes = response.content

    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
        headers={"Content-Length": str(len(audio_bytes))},
    )
```

- [ ] **Step 6: Update `main.py`**

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import os
from src.api.routes.invoice import router as invoice_router
from src.api.routes.audio import router as audio_router
from src.sessions.manager import SessionNotFound, SessionNotAwaiting

app = FastAPI(
    title="Invoice AI Agent",
    description="Voice-based invoice creation agent. See /docs for the full API reference.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Centralized exception handlers — no try/except duplication in routes
@app.exception_handler(SessionNotFound)
async def session_not_found_handler(request: Request, exc: SessionNotFound):
    return JSONResponse(status_code=404, content={"detail": "Session not found"})


@app.exception_handler(SessionNotAwaiting)
async def session_not_awaiting_handler(request: Request, exc: SessionNotAwaiting):
    return JSONResponse(status_code=409, content={"detail": "Session is not awaiting a reply"})


app.include_router(invoice_router, prefix="/api/v1")
app.include_router(audio_router, prefix="/api/v1")


@app.get("/ui")
async def test_ui():
    return FileResponse(os.path.join(os.path.dirname(__file__), "test_ui.html"))
```

- [ ] **Step 7: Delete old `src/api/routes.py`**

```bash
rm "src/api/routes.py"
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
uv run pytest tests/test_routes.py -v
```

Expected: 6 PASSED. If `test_transcribe_returns_transcript` fails because `_openai_client` is not patchable as a module attribute yet, that's fine — fix the monkeypatch path to match the actual import.

- [ ] **Step 9: Update `test_ui.html` URLs**

Find and replace all 6 hardcoded URLs in `test_ui.html`:

| Find | Replace |
|------|---------|
| `/api/invoice/tts` | `/api/v1/audio/tts` |
| `/api/invoice/transcribe` | `/api/v1/audio/transcribe` |
| `/api/invoice/start` | `/api/v1/invoice/start` |
| `/api/invoice/reply` | `/api/v1/invoice/reply` |
| `/api/invoice/stream` | `/api/v1/invoice/stream` |
| `/api/invoice/${id}` | `/api/v1/invoice/${id}` |

- [ ] **Step 10: Run full test suite**

```bash
uv run pytest -v
```

Expected: all existing tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/api/routes/ main.py tests/test_routes.py test_ui.html
git rm src/api/routes.py
git commit -m "feat: split routes into invoice/audio, add /api/v1/ versioning"
```

---

## Task 2: Add response schemas (`InvoiceDetailResponse`, `TTSRequest`)

**Files:**
- Modify: `src/db/models.py`
- Modify: `src/api/routes/invoice.py` (wire `response_model`)
- Modify: `tests/test_models.py`

- [ ] **Step 1: Write failing tests for new schemas**

Append to `tests/test_models.py`:

```python
from src.db.models import InvoiceDetailResponse, InvoiceLineResponse, TTSRequest


def test_invoice_detail_response_valid():
    data = {
        "id": "inv-1",
        "user_id": "user-1",
        "status": "confirmed",
        "invoice_number": "2026-03-001",
        "issue_date": "2026-03-23",
        "due_date": "2026-04-22",
        "payment_terms": "Net 30",
        "client_id": "c1",
        "lines": [{"description": "Dev", "qty": 1.0, "unit_price": 1000.0, "total": 1000.0}],
        "tva_rate": 20.0,
        "subtotal": 1000.0,
        "tva_amount": 200.0,
        "total": 1200.0,
    }
    resp = InvoiceDetailResponse(**data)
    assert resp.invoice_number == "2026-03-001"
    assert resp.lines[0].description == "Dev"


def test_invoice_detail_response_allows_nulls():
    """Draft invoice has no invoice_number or totals yet."""
    data = {
        "id": "inv-2",
        "user_id": "user-1",
        "status": "draft",
        "invoice_number": None,
        "issue_date": "2026-03-23",
        "due_date": None,
        "payment_terms": None,
        "client_id": None,
        "lines": [],
        "tva_rate": None,
        "subtotal": None,
        "tva_amount": None,
        "total": None,
    }
    resp = InvoiceDetailResponse(**data)
    assert resp.invoice_number is None


def test_tts_request_defaults_voice_to_alloy():
    req = TTSRequest(text="hello")
    assert req.voice == "alloy"


def test_tts_request_custom_voice():
    req = TTSRequest(text="hello", voice="nova")
    assert req.voice == "nova"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_models.py -v -k "invoice_detail or tts_request"
```

Expected: ImportError — `InvoiceDetailResponse`, `TTSRequest` not defined yet.

- [ ] **Step 3: Add schemas to `src/db/models.py`**

Append to the end of `src/db/models.py`:

```python
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
    voice: str = "alloy"
```

- [ ] **Step 4: Wire `response_model` on `GET /invoice/{invoice_id}`**

In `src/api/routes/invoice.py`, update the `get_invoice_detail` decorator:

```python
from src.db.models import InvoiceDetailResponse

@router.get(
    "/{invoice_id}",
    response_model=InvoiceDetailResponse,
    summary="Get invoice details",
    description="Returns the full invoice record. Available immediately after the `done` SSE event.",
)
async def get_invoice_detail(invoice_id: str):
    from src.db.supabase import get_invoice
    invoice = get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_models.py -v
```

Expected: all PASSED.

- [ ] **Step 6: Commit**

```bash
git add src/db/models.py src/api/routes/invoice.py tests/test_models.py
git commit -m "feat: add InvoiceDetailResponse, TTSRequest schemas"
```

---

## Task 3: Fix `assign_invoice_number` race condition

**Files:**
- Create: `supabase/migrations/001_assign_invoice_number_atomic.sql`
- Modify: `src/db/supabase.py`
- Modify: `tests/test_supabase.py`

- [ ] **Step 1: Write failing test for new RPC-based function**

Append to `tests/test_supabase.py`:

```python
def test_assign_invoice_number_calls_rpc(mock_supabase):
    """assign_invoice_number must use the atomic RPC, not count-then-write."""
    from src.db.supabase import assign_invoice_number

    mock_supabase.rpc.return_value.execute.return_value.data = "2026-03-001"

    result = assign_invoice_number("inv-1", "user-1")

    mock_supabase.rpc.assert_called_once_with(
        "assign_invoice_number_atomic",
        {"p_invoice_id": "inv-1", "p_user_id": "user-1"},
    )
    assert result == "2026-03-001"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_supabase.py::test_assign_invoice_number_calls_rpc -v
```

Expected: FAIL — current implementation uses `table().select()` not `rpc()`.

- [ ] **Step 3: Create Supabase migration**

Create `supabase/migrations/001_assign_invoice_number_atomic.sql`:

```sql
-- Migration: atomic invoice number assignment
-- Replaces the count-then-write pattern in Python with a single transactional function.
-- Uses pg_advisory_xact_lock to serialize concurrent calls for the same user+month.

CREATE OR REPLACE FUNCTION assign_invoice_number_atomic(
  p_invoice_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_count  int;
  v_number text;
BEGIN
  v_prefix := to_char(now(), 'YYYY-MM');

  -- Serialize all calls for this user+month using a session-level advisory lock.
  -- Two int4 args (one per dimension) reduces hash collision risk vs a single int8.
  -- Lock is released automatically at end of transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(v_prefix));

  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE user_id   = p_user_id
    AND status    = 'confirmed'
    AND invoice_number LIKE v_prefix || '-%';

  v_number := v_prefix || '-' || LPAD(v_count::text, 3, '0');

  UPDATE invoices
  SET invoice_number = v_number
  WHERE id = p_invoice_id;

  RETURN v_number;
END;
$$;
```

> **Deploy this migration to Supabase** before running in production:
> Go to Supabase Dashboard → SQL Editor → run the contents of this file.
> Or use `supabase db push` if using the Supabase CLI.

- [ ] **Step 4: Update `assign_invoice_number` in `src/db/supabase.py`**

Replace the existing `assign_invoice_number` function:

```python
def assign_invoice_number(invoice_id: str, user_id: str) -> str:
    """Atomically assigns the next YYYY-MM-NNN number via a Postgres RPC.

    The function uses pg_advisory_xact_lock to serialize concurrent calls
    for the same user+month, eliminating the previous race condition.
    Migration: supabase/migrations/001_assign_invoice_number_atomic.sql
    """
    result = _get_client().rpc(
        "assign_invoice_number_atomic",
        {"p_invoice_id": invoice_id, "p_user_id": user_id},
    ).execute()
    return result.data
```

Also remove the now-unused `import datetime` if nothing else uses it. Check first:

```python
# datetime is still used in create_invoice_draft → keep the import
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
uv run pytest tests/test_supabase.py -v
```

Expected: all PASSED.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/001_assign_invoice_number_atomic.sql src/db/supabase.py tests/test_supabase.py
git commit -m "fix: replace assign_invoice_number with atomic Postgres RPC"
```

---

## Task 4: Add `language` parameter to `/audio/transcribe`

**Files:**
- Modify: `src/api/routes/audio.py` (already done in Task 1 — verify it's there)
- Modify: `tests/test_routes.py`

- [ ] **Step 1: Write failing test for language parameter**

Append to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_transcribe_passes_language_to_whisper(monkeypatch):
    """Language query param must be forwarded to Whisper."""
    from unittest.mock import MagicMock, AsyncMock as AM
    import src.api.routes.audio as audio_mod

    mock_client = MagicMock()
    mock_transcription = MagicMock()
    mock_transcription.text = "Bonjour"
    mock_client.audio.transcriptions.create = AM(return_value=mock_transcription)
    monkeypatch.setattr(audio_mod, "_openai_client", lambda: mock_client)

    import io
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/audio/transcribe?language=en",
            files={"audio": ("test.webm", io.BytesIO(b"data"), "audio/webm")},
        )

    assert resp.status_code == 200
    call_kwargs = mock_client.audio.transcriptions.create.call_args.kwargs
    assert call_kwargs["language"] == "en"
```

- [ ] **Step 2: Run to verify**

```bash
uv run pytest tests/test_routes.py::test_transcribe_passes_language_to_whisper -v
```

If `audio.py` was written correctly in Task 1 with `language: str = Query("fr")`, this should **pass already**. If it fails, the `language` param was not implemented — add it now per Task 1 Step 5.

- [ ] **Step 3: Run full test suite**

```bash
uv run pytest -v
```

Expected: all PASSED.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add src/api/routes/audio.py tests/test_routes.py
git commit -m "feat: add language query param to /audio/transcribe, default fr"
```

---

## Task 5: Centralize exception handlers + enrich OpenAPI

**Files:**
- Modify: `main.py` (exception handlers — already done in Task 1)
- Modify: `src/api/routes/invoice.py` (remove redundant try/except, verify descriptions)
- Modify: `src/api/routes/audio.py` (verify descriptions)

> **Note:** The exception handlers were already added to `main.py` in Task 1. This task verifies they work correctly and cleans up any remaining try/except in routes.

- [ ] **Step 1: Write test for centralized exception handlers**

Append to `tests/test_routes.py`:

```python
@pytest.mark.asyncio
async def test_session_not_found_returns_404_from_handler():
    """SessionNotFound raised in route must be caught by the global handler."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/v1/invoice/stream?session_id=does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Session not found"


@pytest.mark.asyncio
async def test_session_not_awaiting_returns_409_from_handler():
    """SessionNotAwaiting raised in route must be caught by the global handler."""
    from src.sessions.manager import session_store
    sid = session_store.create("u1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/reply", json={"session_id": sid, "reply": "hi"})
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Session is not awaiting a reply"
```

- [ ] **Step 2: Run tests**

```bash
uv run pytest tests/test_routes.py -v
```

Expected: all PASSED.

- [ ] **Step 3: Remove redundant try/except from `src/api/routes/invoice.py`**

The `stream` and `reply` routes still contain explicit try/except for `SessionNotFound` / `SessionNotAwaiting`. Now that the global handlers are in place, replace them with direct calls:

In `stream`:
```python
# Replace:
try:
    session = session_store.get(session_id)
except SessionNotFound:
    raise HTTPException(status_code=404, detail="Session not found")

# With:
session = session_store.get(session_id)  # raises SessionNotFound → caught globally
```

In `reply`:
```python
# Replace the entire try/except block:
await session_store.push_reply(body.session_id, body.reply)
return {}
```

- [ ] **Step 3b: Remove unused imports from `invoice.py`**

Remove these lines from the top of `src/api/routes/invoice.py` (they're now handled globally):
```python
from src.sessions.manager import session_store, SessionNotFound, SessionNotAwaiting
```
Replace with:
```python
from src.sessions.manager import session_store
```

Also remove the unused `HTTPException` import if it's no longer used anywhere in the file.

- [ ] **Step 4: Run tests to verify nothing broke**

```bash
uv run pytest -v
```

Expected: all PASSED.

- [ ] **Step 5: Commit**

```bash
git add main.py src/api/routes/invoice.py tests/test_routes.py
git commit -m "refactor: centralize SessionNotFound/SessionNotAwaiting exception handlers"
```

---

## Task 6: Write `sdk/invoice-sdk.js`

**Files:**
- Create: `sdk/invoice-sdk.js`

> No automated tests (pure browser JS). Manually testable via `test_ui.html`.

- [ ] **Step 1: Create `sdk/` directory and write `invoice-sdk.js`**

```bash
mkdir sdk
```

Create `sdk/invoice-sdk.js`:

```javascript
/**
 * InvoiceAgent — Vanilla JS SDK for Invoice AI Agent API
 *
 * Usage:
 *   const agent = new InvoiceAgent({ baseUrl, userId, onQuestion, onUpdate, onDone, onError });
 *   await agent.start(transcript);           // from text
 *   await agent.startFromAudio(audioBlob);   // from audio (SDK transcribes)
 *   agent.stop();                            // cancel active session
 *
 * No dependencies. Works as <script src="sdk/invoice-sdk.js">.
 */
class InvoiceAgent {
  /**
   * @param {object} options
   * @param {string} options.baseUrl        - Backend base URL (no trailing slash)
   * @param {string} options.userId         - User UUID
   * @param {function} options.onQuestion   - async (question: string) => Promise<string>
   * @param {function} options.onUpdate     - (field: string, value: any) => void
   * @param {function} options.onDone       - (invoiceId: string) => void
   * @param {function} options.onError      - (message: string) => void
   * @param {function} [options.onThinking] - optional (message: string) => void
   */
  constructor({ baseUrl, userId, onQuestion, onUpdate, onDone, onError, onThinking }) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._userId = userId;
    this._onQuestion = onQuestion;
    this._onUpdate = onUpdate;
    this._onDone = onDone;
    this._onError = onError;
    this._onThinking = onThinking || null;

    this._sessionId = null;
    this._eventSource = null;
    this._awaitingReply = false;
  }

  /**
   * Cancel the active session and close the SSE stream.
   * Safe to call with no active session.
   */
  stop() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this._sessionId = null;
    this._awaitingReply = false;
  }

  /**
   * Start an invoice session from a text transcript.
   * Calls stop() first if a session is already active.
   * @param {string} transcript
   */
  async start(transcript) {
    this.stop();

    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/invoice/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: this._userId, transcript }),
      });
    } catch (err) {
      this._onError(`Network error starting session: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Failed to start session: HTTP ${resp.status}`);
      return;
    }

    const { session_id } = await resp.json();
    this._sessionId = session_id;
    this._listenToStream();
  }

  /**
   * Transcribe an audio Blob, then start a session with the transcript.
   * Calls onError if transcription fails (does not call start).
   * @param {Blob} audioBlob
   * @param {string} [language='fr']  - BCP-47 language code for Whisper
   */
  async startFromAudio(audioBlob, language = 'fr') {
    const form = new FormData();
    form.append('audio', audioBlob, audioBlob.name || 'audio.webm');

    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/audio/transcribe?language=${language}`, {
        method: 'POST',
        body: form,
      });
    } catch (err) {
      this._onError(`Network error during transcription: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Transcription failed: HTTP ${resp.status}`);
      return;
    }

    const { transcript } = await resp.json();
    await this.start(transcript);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _listenToStream() {
    const url = `${this._baseUrl}/api/v1/invoice/stream?session_id=${this._sessionId}`;
    this._eventSource = new EventSource(url);

    this._eventSource.onmessage = async (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return; // malformed event — ignore
      }
      await this._handleEvent(event);
    };

    this._eventSource.onerror = () => {
      // Browser EventSource auto-reconnects.
      // _awaitingReply flag suppresses duplicate `question` events on reconnect.
    };
  }

  async _handleEvent(event) {
    switch (event.type) {
      case 'thinking':
        if (this._onThinking) this._onThinking(event.message);
        break;

      case 'profile':
        // UI hint only — ignored by SDK
        break;

      case 'invoice_update':
        // May fire in bursts (e.g. lines + subtotal + tva_amount + total)
        this._onUpdate(event.field, event.value);
        break;

      case 'question':
        // Suppress duplicate delivery on SSE reconnect
        if (this._awaitingReply) break;
        this._awaitingReply = true;
        try {
          const reply = await this._onQuestion(event.message);
          this._awaitingReply = false;
          await this._postReply(reply);
        } catch (err) {
          this._awaitingReply = false;
          this._onError(`onQuestion handler threw: ${err.message}`);
        }
        break;

      case 'done':
        this._closeStream();
        this._onDone(event.invoice_id);
        break;

      case 'error':
        this._closeStream();
        this._onError(event.message);
        break;

      case 'ping':
        // Keepalive — ignore
        break;
    }
  }

  async _postReply(reply) {
    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/invoice/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this._sessionId, reply }),
      });
    } catch (err) {
      this._onError(`Network error sending reply: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Reply failed: HTTP ${resp.status}`);
    }
  }

  _closeStream() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }
}
```

- [ ] **Step 2: Smoke test in test_ui.html**

Add to `test_ui.html` (or a new `sdk-test.html`):

```html
<script src="sdk/invoice-sdk.js"></script>
<script>
  const agent = new InvoiceAgent({
    baseUrl: 'http://localhost:8000',
    userId: 'your-user-id',
    onQuestion: async (q) => { return prompt(q); },
    onUpdate: (f, v) => console.log('update', f, v),
    onDone: (id) => alert('Done! Invoice: ' + id),
    onError: (msg) => alert('Error: ' + msg),
  });
  agent.start("I need to invoice Marie Dupont for 3 hours of consulting at 150 euros per hour");
</script>
```

Start the server and open `/ui` to verify the full flow works.

- [ ] **Step 3: Commit**

```bash
git add sdk/invoice-sdk.js
git commit -m "feat: add InvoiceAgent vanilla JS SDK"
```

---

## Task 7: Write `docs/README.md`

**Files:**
- Create: `docs/README.md`

- [ ] **Step 1: Write the README**

Create `docs/README.md`:

````markdown
# Invoice AI Agent — API & SDK

A voice-based invoice creation API. The agent conducts a natural-language conversation to collect invoice data, then creates a confirmed invoice in Supabase.

---

## Quick Start (30 seconds)

1. Copy `sdk/invoice-sdk.js` into your project
2. Start the server: `uvicorn main:app --reload`
3. Drop this into your HTML:

```html
<script src="invoice-sdk.js"></script>
<script>
  const agent = new InvoiceAgent({
    baseUrl: 'http://localhost:8000',
    userId: 'YOUR_USER_UUID',

    onQuestion: async (question) => {
      // The agent asked something — get the user's answer
      return prompt(question); // replace with your mic/UI logic
    },

    onUpdate: (field, value) => {
      console.log('Invoice updated:', field, '=', value);
    },

    onDone: (invoiceId) => {
      console.log('Invoice confirmed:', invoiceId);
      // Fetch full details: GET /api/v1/invoice/{invoiceId}
    },

    onError: (message) => {
      console.error('Agent error:', message);
    },
  });

  // Start with a text transcript
  await agent.start("Invoice Marie Dupont for 2 hours of consulting at 500 euros");

  // Or start with a recorded audio Blob
  // await agent.startFromAudio(audioBlob);
</script>
```

---

## Flow

```
user audio/text
       │
       ▼
POST /api/v1/invoice/start ──► session_id
       │
       ▼
GET  /api/v1/invoice/stream  (SSE — keep open)
       │
       ├─► thinking      (agent is working)
       ├─► invoice_update (field changed)
       ├─► question       (agent needs input)
       │      │
       │      ▼
       │   POST /api/v1/invoice/reply
       │      │
       │      └──► (loop back to stream)
       │
       └─► done ──► GET /api/v1/invoice/{invoice_id}
```

---

## SDK Reference

### `new InvoiceAgent(options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `baseUrl` | string | yes | Backend URL (no trailing slash) |
| `userId` | string | yes | User UUID |
| `onQuestion` | `async (q) => string` | yes | Return the user's answer |
| `onUpdate` | `(field, value) => void` | yes | Called on each invoice field change |
| `onDone` | `(invoiceId) => void` | yes | Called when invoice is finalized |
| `onError` | `(message) => void` | yes | Called on error or timeout |
| `onThinking` | `(message) => void` | no | Called before each agent tool call |

### `agent.start(transcript)`

Start a session from a text transcript. Returns a Promise. Cancels any active session first.

### `agent.startFromAudio(blob, language = 'fr')`

Transcribes `blob` via Whisper, then calls `start()`. Calls `onError` and returns (without calling `start`) if transcription fails.

### `agent.stop()`

Cancel the active session and close the SSE connection. Idempotent.

### `onUpdate` field names

| Field | Type | When |
|-------|------|------|
| `client_name` | string | Client found or created (UI hint) |
| `status` | string | Draft created: `"draft"` |
| `client_id` | string | Client linked to invoice |
| `lines` | array | Invoice lines set |
| `tva_rate` | number | VAT rate set |
| `subtotal` | number | Computed after lines/tva change |
| `tva_amount` | number | Computed after lines/tva change |
| `total` | number | Computed after lines/tva change |
| `due_date` | string | Due date set (ISO) |
| `payment_terms` | string | Payment terms set |

> `onUpdate` may fire in bursts: setting `lines` triggers 4 events in sequence (`lines`, `subtotal`, `tva_amount`, `total`).

---

## API Reference

### `POST /api/v1/invoice/start`

Start a new invoice session.

**Request:**
```json
{ "user_id": "uuid", "transcript": "Invoice Marie for 2h at 500€" }
```

**Response:**
```json
{ "session_id": "uuid" }
```

---

### `GET /api/v1/invoice/stream?session_id=<id>`

SSE stream. Connect immediately after `/start`. Closes on `done` or `error`.

**Event types:**

| type | payload | description |
|------|---------|-------------|
| `thinking` | `{ message }` | Agent is calling a tool |
| `profile` | `{ data }` | User profile loaded (UI hint) |
| `invoice_update` | `{ field, value }` | Invoice field changed |
| `question` | `{ message, awaiting: true }` | Agent needs user input |
| `done` | `{ invoice_id }` | Invoice confirmed |
| `error` | `{ message }` | Agent error or timeout |
| `ping` | — | Keepalive (every 30s) |

---

### `POST /api/v1/invoice/reply`

Send user reply after a `question` event.

**Request:**
```json
{ "session_id": "uuid", "reply": "yes, that's correct" }
```

**Errors:** `404` session not found · `409` session not awaiting reply

---

### `GET /api/v1/invoice/{invoice_id}`

Get full invoice details after `done`.

**Response:** See `InvoiceDetailResponse` schema in `/docs`.

---

### `POST /api/v1/audio/transcribe?language=fr`

Transcribe audio to text via Whisper.

**Request:** `multipart/form-data` with field `audio` (any audio format).

**Query param:** `language` — BCP-47 code (default: `fr`).

**Response:**
```json
{ "transcript": "Invoice Marie Dupont for two hours..." }
```

**Errors:** `400` no file provided

---

### `POST /api/v1/audio/tts`

Convert text to speech (OpenAI TTS). Returns MP3 audio stream.

**Request:**
```json
{ "text": "Here is your invoice summary...", "voice": "alloy" }
```

Available voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.

**Errors:** `400` empty text

---

## Error Handling

| HTTP | When | SDK behavior |
|------|------|-------------|
| 404 | Session not found | `onError` called |
| 409 | Session not awaiting reply | `onError` called |
| 400 | Bad request | `onError` called |
| SSE `error` event | Agent error / 5-min timeout | `onError` called, stream closed |

---

## Known Constraints

- **No authentication:** `user_id` is trusted from the request body. Secure before production.
- **In-process sessions:** Not compatible with multi-worker deployments. Upgrade path: Redis pub/sub.
- **Transcription language:** Defaults to `fr`. Override with `?language=en` (or other BCP-47 codes).
````

- [ ] **Step 2: Run full test suite one last time**

```bash
uv run pytest -v
```

Expected: all PASSED.

- [ ] **Step 3: Commit**

```bash
git add docs/README.md
git commit -m "docs: add full API + SDK README"
```

---

## Final Checklist

- [ ] All tests pass: `uv run pytest -v`
- [ ] Server starts cleanly: `uvicorn main:app --reload`
- [ ] `/docs` (Swagger) shows all 6 endpoints with descriptions
- [ ] `test_ui.html` works end-to-end at `http://localhost:8000/ui`
- [ ] Supabase migration deployed: `supabase/migrations/001_assign_invoice_number_atomic.sql`
