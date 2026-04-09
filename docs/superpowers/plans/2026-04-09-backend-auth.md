# Backend Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Supabase JWT on `POST /invoice/start` and extract `user_id` server-side instead of trusting the request body.

**Architecture:** New FastAPI dependency `get_current_user` reads the `Authorization: Bearer <token>` header, calls `supabase_client.auth.get_user(token)` to validate, and returns the user UUID. The route injects this dependency; `user_id` is removed from the request body. The frontend passes its session token in the header.

**Tech Stack:** FastAPI `Depends`, supabase-py v2 `auth.get_user()`, httpx AsyncClient for tests.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/api/auth.py` | **Create** | FastAPI dependency `get_current_user` |
| `src/api/schemas.py` | **Modify** | Remove `user_id` from `StartRequest` |
| `src/api/routes/invoice.py` | **Modify** | Inject `get_current_user` into `/start` |
| `tests/test_routes.py` | **Modify** | Update existing test + add 3 auth tests |
| `src/frontend/agent-stream.js` | **Modify** | Add Authorization header, remove user_id from body |

---

### Task 1: Create `src/api/auth.py` with failing tests

**Files:**
- Create: `src/api/auth.py`
- Modify: `tests/test_routes.py`

- [ ] **Step 1: Add the three new auth tests at the bottom of `tests/test_routes.py`**

```python
# --- Auth tests ---

@pytest.mark.asyncio
async def test_start_no_auth_header_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/invoice/start", json={"transcript": "test"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing authorization header"


@pytest.mark.asyncio
async def test_start_malformed_auth_returns_401():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/invoice/start",
            json={"transcript": "test"},
            headers={"Authorization": "NotBearer token"},
        )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid authorization format"


@pytest.mark.asyncio
async def test_start_invalid_token_returns_401():
    with patch("src.api.auth._get_client") as mock_client:
        mock_client.return_value.auth.get_user.side_effect = Exception("invalid token")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/invoice/start",
                json={"transcript": "test"},
                headers={"Authorization": "Bearer bad.token.here"},
            )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid or expired token"
```

- [ ] **Step 2: Run to confirm all 3 tests fail**

```bash
uv run pytest tests/test_routes.py::test_start_no_auth_header_returns_401 tests/test_routes.py::test_start_malformed_auth_returns_401 tests/test_routes.py::test_start_invalid_token_returns_401 -v
```

Expected: 3 FAILs (route doesn't check auth yet).

- [ ] **Step 3: Create `src/api/auth.py`**

```python
# src/api/auth.py
from typing import Optional
from fastapi import Header, HTTPException
from src.db.supabase import _get_client


def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    token = authorization[len("Bearer "):]
    try:
        response = _get_client().auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return response.user.id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
```

- [ ] **Step 4: Run the 3 new tests — they should still fail** (route not wired yet, so `/start` doesn't call `get_current_user` yet)

```bash
uv run pytest tests/test_routes.py::test_start_no_auth_header_returns_401 tests/test_routes.py::test_start_malformed_auth_returns_401 tests/test_routes.py::test_start_invalid_token_returns_401 -v
```

Expected: still FAILing (will pass after Task 2).

---

### Task 2: Wire the dependency + update schema and route

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `src/api/routes/invoice.py`
- Modify: `tests/test_routes.py` (update existing `test_start_returns_session_id`)

- [ ] **Step 1: Update `src/api/schemas.py` — remove `user_id`**

Replace the entire file with:

```python
# src/api/schemas.py
from pydantic import BaseModel


class StartRequest(BaseModel):
    transcript: str


class StartResponse(BaseModel):
    session_id: str


class ReplyRequest(BaseModel):
    session_id: str
    reply: str
```

- [ ] **Step 2: Update `src/api/routes/invoice.py` — inject the dependency**

Replace the entire file with:

```python
# src/api/routes/invoice.py
import asyncio
import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sse_starlette.sse import EventSourceResponse
from src.api.schemas import StartRequest, StartResponse, ReplyRequest
from src.api.auth import get_current_user
from src.sessions.manager import session_store
from src.agent.runner import run_agent
from src.db.supabase import get_invoice
from src.db.models import InvoiceDetailResponse

router = APIRouter(prefix="/invoice", tags=["Invoice"])


@router.post(
    "/start",
    response_model=StartResponse,
    summary="Start an invoice session",
    description=(
        "Creates a new invoice session and starts the AI agent in the background. "
        "Returns a `session_id` to use with `/stream` and `/reply`. "
        "Requires a valid Supabase session token in the Authorization header."
    ),
)
async def start(
    body: StartRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    session_id = session_store.create(user_id)
    background_tasks.add_task(run_agent, session_id, user_id, body.transcript)
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
    session = session_store.get(session_id)

    already_connected = session["stream_connected"]
    session["stream_connected"] = True

    if already_connected:
        if session["awaiting_reply"] and session["last_question"]:
            await session["sse_queue"].put({
                "type": "WAITING_USER_INPUT",
                "message": session["last_question"],
                "awaiting": True,
            })
        elif session["status"] == "done" and session["invoice_id"]:
            await session["sse_queue"].put({"type": "DONE", "invoice_id": session["invoice_id"]})

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(session["sse_queue"].get(), timeout=30)
                yield {"data": json.dumps(event)}
                if event["type"].upper() in ("DONE", "ERROR"):
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
    await session_store.push_reply(body.session_id, body.reply)
    return {}


@router.get(
    "/{invoice_id:uuid}",
    response_model=InvoiceDetailResponse,
    summary="Get invoice details",
    description="Returns the full invoice record. Available immediately after the `done` SSE event.",
)
async def get_invoice_detail(invoice_id: str):
    invoice = await asyncio.get_event_loop().run_in_executor(None, get_invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
```

- [ ] **Step 3: Update `test_start_returns_session_id` to use dependency override**

In `tests/test_routes.py`, replace the existing `test_start_returns_session_id` function with:

```python
@pytest.mark.asyncio
async def test_start_returns_session_id():
    from src.api.auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "test-user-id"
    try:
        with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/invoice/start", json={"transcript": "test"})
            await asyncio.sleep(0)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 200
    assert "session_id" in resp.json()
```

Also update `test_stream_receives_event_pushed_to_queue` which also calls `/start`:

```python
@pytest.mark.asyncio
async def test_stream_receives_event_pushed_to_queue():
    from src.sessions.manager import session_store
    from src.api.auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "test-user-id"
    try:
        with patch("src.api.routes.invoice.run_agent", new=AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/invoice/start", json={"transcript": "test"})
        sid = resp.json()["session_id"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)

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
```

- [ ] **Step 4: Run the full test suite**

```bash
uv run pytest tests/test_routes.py -v
```

Expected: all tests PASS including the 3 new auth tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.py src/api/schemas.py src/api/routes/invoice.py tests/test_routes.py
git commit -m "feat(auth): validate Supabase JWT on /invoice/start via get_current_user dependency"
```

---

### Task 3: Update frontend to send Authorization header

**Files:**
- Modify: `src/frontend/agent-stream.js`

- [ ] **Step 1: Update the `start()` function in `src/frontend/agent-stream.js`**

Replace the `start` function (lines 84–122) with:

```js
async function start(transcript) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    sessionId = null;

    // Get Supabase session token
    const { data: { session } } = await window._supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { _showError('Not authenticated. Please log in again.'); return; }

    _showStatus('Starting agent...');

    try {
      const res = await fetch(`${BASE_URL}/invoice/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ transcript })
      });

      if (!res.ok) {
        let errStr = res.status;
        try {
           const err = await res.json();
           errStr = err.detail || res.status;
        } catch(e) {}
        _showError(`Start error: ${errStr}`);
        _resetRecordBtn();
        return;
      }

      const data = await res.json();
      sessionId = data.session_id;

      const abandonBtn = document.querySelector('#abandon-btn');
      if (abandonBtn) abandonBtn.style.display = 'inline-block';

      _openStream(0);
    } catch (e) {
      _showError(`Network error: ${e.message}`);
      _resetRecordBtn();
    }
  }
```

- [ ] **Step 2: Verify no other reference to `window.INVOICE_USER_ID` in `agent-stream.js`**

```bash
grep -n "INVOICE_USER_ID\|user_id" src/frontend/agent-stream.js
```

Expected: no matches (the field is gone).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/agent-stream.js
git commit -m "feat(frontend): pass Supabase JWT in Authorization header for /invoice/start"
```

---

### Task 4: Full test run + update CLAUDE.md debt note

**Files:**
- Modify: `CLAUDE.md` (remove the "No authentication" debt item)

- [ ] **Step 1: Run the full test suite**

```bash
uv run pytest -v
```

Expected: all tests PASS.

- [ ] **Step 2: Remove the resolved debt item from `CLAUDE.md`**

In `CLAUDE.md`, in the "Known technical debt" section, remove:

```
- No authentication: `user_id` is trusted from the request body. Must be secured before production.
```

And add in its place:

```
- `/stream` and `/reply` are not authenticated — session_id scoping limits blast radius but a stolen session_id gives access. Fix: validate JWT via WebSocket/cookie on stream connect.
- `GET /invoice/{id}` does not verify ownership — any authenticated user can read any invoice by ID if they know it.
```

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update known debt — /start now auth'd, document remaining gaps"
```
