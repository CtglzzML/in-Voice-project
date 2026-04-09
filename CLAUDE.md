# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Run the server:**
```bash
uvicorn main:app --reload
```

**Run all tests:**
```bash
uv run pytest
```

**Run a single test file:**
```bash
uv run pytest tests/test_routes.py
```

**Install dependencies:**
```bash
uv sync
```

**Required env vars** (see `.env.example`):
```
SUPABASE_URL=
SUPABASE_KEY=
OPENAI_API_KEY=
```

## Architecture

Backend-only FastAPI service. The frontend (HTML/JS + Web Speech API) is external and not in this repo.

### Request flow

```
POST /api/invoice/start (user_id + transcript)
  → creates session in memory (asyncio.Queue pair)
  → spawns run_agent() as asyncio background task
  → returns session_id

GET /api/invoice/stream?session_id=xxx  (SSE)
  → streams events from session's sse_queue until type=done|error

POST /api/invoice/reply (session_id + reply)
  → unblocks a waiting agent by pushing to reply_queue
```

### Agent pipeline (`src/agent/`)

Two-step LLM pipeline:

1. **Extractor** (`extractor.py`): one-shot structured call with `gpt-4.1-mini` → `ExtractedInvoice` Pydantic model (all fields nullable). Runs before the main agent.

2. **Agent** (`runner.py`): LangChain `create_agent` with `gpt-4o`, tools bound to the current session. Pre-extracted data is injected into the system prompt. Fixed tool-call order: `get_user_profile` → `search_client` → `create_invoice_draft` → `update_invoice_field` (×N) → `ask_user_question` (if needed) → `finalize_invoice`.

### Session state (`src/sessions/manager.py`)

In-memory singleton `SessionStore`. Each session holds:
- `sse_queue`: events pushed backend → frontend
- `reply_queue`: user replies pushed frontend → agent (unblocks `ask_user_question`)
- `awaiting_reply`, `last_question`: for SSE reconnection replay
- Sessions auto-cleanup 5 min after `done` or `error`

**Suspend/resume pattern**: `tool_ask_user_question` pushes a `question` event to `sse_queue`, then `await reply_queue.get()` blocks the agent coroutine. `POST /api/invoice/reply` unblocks it.

### Database (`src/db/`)

Supabase (PostgreSQL). Lazy client init — `_get_client()` creates the singleton on first call, which lets tests monkeypatch it before any import-time connection.

Key DB rules:
- `invoice_number` (format `YYYY-MM-NNN`) assigned only at `finalize_invoice`, not on draft creation
- `subtotal`, `tva_amount`, `total` recomputed by backend on every `update_invoice_field` call for `lines` or `tva_rate`
- `search_clients` uses Postgres `search_clients_fuzzy` RPC (pg_trgm fuzzy matching)

Mandatory invoice fields before finalization: `client_id`, `due_date`, `payment_terms`, `lines`, `tva_rate`.

### SSE event types

| type | when |
|------|------|
| `thinking` | before each tool call (hardcoded message per tool) |
| `invoice_update` | after each `update_invoice_field` success |
| `question` | when agent needs user input |
| `done` | invoice confirmed |
| `error` | agent error or timeout |
| `ping` | keepalive every 30s |

## Known technical debt

- `assign_invoice_number` in `src/db/supabase.py` has a race condition (count-then-write, not atomic). Fix: replace with a Postgres RPC function running atomically.
- Sessions are in-process memory — incompatible with multi-worker deploys. Upgrade path: Redis pub/sub.
- `/stream` and `/reply` are not authenticated — session_id scoping limits blast radius but a stolen session_id gives access. Fix: pass JWT via cookie or query param on stream connect.
- `GET /invoice/{id}` does not verify ownership — any authenticated user can read any invoice by ID if they know it.
