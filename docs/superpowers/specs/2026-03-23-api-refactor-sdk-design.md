# Design Spec — API Refactor + Vanilla JS SDK

**Date:** 2026-03-23
**Project:** IA Invoice Agent
**Status:** Approved

---

## Goal

1. Clean and reorganize the FastAPI backend into a stable, versioned API
2. Create `sdk/invoice-sdk.js` — a high-level vanilla JS client with callbacks
3. Enrich OpenAPI (Swagger) documentation + write a complete `README.md`

---

## 1. File Structure

### Before
```
src/
  api/routes.py        ← all endpoints mixed together
  agent/runner.py
  agent/tools.py
  agent/extractor.py
  db/supabase.py
  db/models.py
  sessions/manager.py
```

### After
```
src/
  api/
    routes/
      invoice.py       ← start, stream, reply, get_invoice
      audio.py         ← transcribe, tts
    schemas.py         ← unchanged
  agent/               ← unchanged
  db/
    supabase.py        ← + fix assign_invoice_number → atomic Postgres RPC
    models.py          ← unchanged
  sessions/            ← unchanged
sdk/
  invoice-sdk.js       ← new
docs/
  README.md            ← new
  superpowers/specs/   ← this file
```

### `main.py` changes
Include both routers under `/api/v1/`:
```python
app.include_router(invoice_router, prefix="/api/v1")
app.include_router(audio_router, prefix="/api/v1")
```

---

## 2. API Endpoints (after refactor)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/invoice/start` | Start a new invoice session |
| GET | `/api/v1/invoice/stream` | SSE stream for session events |
| POST | `/api/v1/invoice/reply` | Send user reply to agent |
| GET | `/api/v1/invoice/{invoice_id}` | Get finalized invoice details |
| POST | `/api/v1/audio/transcribe` | Transcribe audio (Whisper) |
| POST | `/api/v1/audio/tts` | Text-to-speech (OpenAI TTS) |

---

## 3. Backend Refactor Scope

### Split routes
- `src/api/routes/invoice.py` — invoice flow (start, stream, reply, get_invoice)
- `src/api/routes/audio.py` — audio utilities (transcribe, tts)
- Remove inline imports inside route functions (move to top of file)

### Fix technical debt
- `assign_invoice_number` in `supabase.py`: replace count-then-write with an atomic Postgres RPC (`assign_invoice_number_atomic`) to eliminate race condition

### OpenAPI enrichment
- Add `summary` and `description` to every endpoint
- Add `response_model` types where missing
- Add example payloads via `openapi_extra` or Pydantic `model_config`
- Document all error codes (400, 404, 409)

### Error handling
- Centralized FastAPI exception handlers for `SessionNotFound` and `SessionNotAwaiting`
- No try/except duplication in routes

---

## 4. SDK — `sdk/invoice-sdk.js`

### Public interface

```js
const agent = new InvoiceAgent({
  baseUrl: 'http://localhost:8000',
  userId: 'uuid-xxx',

  onQuestion: async (question) => {
    // Must return Promise<string> — the user's answer
    speak(question);
    return await listenMic();
  },

  onUpdate: (field, value) => {
    // Called on every invoice_update SSE event
    updateUI(field, value);
  },

  onDone: (invoiceId) => {
    // Called when invoice is finalized
    showSuccess(invoiceId);
  },

  onError: (message) => {
    // Called on agent error or timeout
    showError(message);
  },
});

await agent.start(transcript);           // start from text transcript
await agent.startFromAudio(audioBlob);   // start from audio — SDK transcribes first
```

### What the SDK handles internally (invisible to the consumer)
- `POST /api/v1/invoice/start` → obtain `session_id`
- `EventSource` on `/api/v1/invoice/stream?session_id=...`
- Parse SSE events:
  - `thinking` → ignored (or optional `onThinking` callback)
  - `question` → call `onQuestion`, await reply, `POST /api/v1/invoice/reply`
  - `invoice_update` → call `onUpdate(field, value)`
  - `done` → call `onDone(invoiceId)`, close stream
  - `error` → call `onError(message)`, close stream
  - `ping` → ignored (keepalive)
- Auto-reconnect on SSE disconnect (replay last question on reconnect)
- For `startFromAudio`: `POST /api/v1/audio/transcribe` first, then `start`

### No dependencies
Pure vanilla JS, no bundler required. Works as a `<script src="sdk/invoice-sdk.js">` import.

---

## 5. Documentation

### Swagger (auto-generated, enriched)
- Available at `/docs`
- Every endpoint has `summary`, `description`, request/response examples
- Error codes documented per endpoint

### `README.md` structure
```
# Invoice AI Agent — API

## Quick Start (30 seconds)
  → copy invoice-sdk.js
  → minimal working example (20 lines)

## Flow Diagram
  transcript → /start → /stream (SSE) → question/reply loop → done

## SDK Reference
  new InvoiceAgent(options)
  agent.start(transcript)
  agent.startFromAudio(blob)
  Callbacks: onQuestion, onUpdate, onDone, onError

## API Reference
  All 6 endpoints with curl examples

## SSE Event Types
  table: type | when | payload shape

## Error Handling
  HTTP codes + expected client behavior
```

---

## 6. Out of Scope

- Authentication (user_id still trusted from request body — known debt, pre-production fix)
- Multi-worker session persistence (Redis upgrade path documented but not implemented)
- npm package publishing
- Low-level SDK layer (only high-level `InvoiceAgent` class)

---

## 7. Implementation Order

1. Split routes → `invoice.py` + `audio.py`
2. Add versioning `/api/v1/` in `main.py`
3. Fix `assign_invoice_number` race condition
4. Enrich OpenAPI descriptions + response models
5. Centralize exception handlers
6. Write `sdk/invoice-sdk.js`
7. Write `docs/README.md`
