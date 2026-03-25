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
    models.py          ← unchanged + InvoiceDetailResponse schema
  sessions/            ← unchanged
sdk/
  invoice-sdk.js       ← new
docs/
  README.md            ← new
  superpowers/specs/   ← this file
```

### `main.py` changes
Include both routers under `/api/v1/` in a single atomic change (steps 1+2 are one commit):
```python
app.include_router(invoice_router, prefix="/api/v1")
app.include_router(audio_router, prefix="/api/v1")
```

### Breaking URL changes (migration note)
The following URLs change as part of this refactor. Any existing client (e.g. `test_ui.html`) must be updated:

| Before | After |
|--------|-------|
| `POST /api/invoice/start` | `POST /api/v1/invoice/start` |
| `GET /api/invoice/stream` | `GET /api/v1/invoice/stream` |
| `POST /api/invoice/reply` | `POST /api/v1/invoice/reply` |
| `GET /api/invoice/{id}` | `GET /api/v1/invoice/{id}` |
| `POST /api/invoice/transcribe` | `POST /api/v1/audio/transcribe` |
| `POST /api/invoice/tts` | `POST /api/v1/audio/tts` |

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

### Split routes (atomic with versioning — single commit)
- `src/api/routes/invoice.py` — invoice flow (start, stream, reply, get_invoice)
- `src/api/routes/audio.py` — audio utilities (transcribe, tts)
- Remove inline imports inside route functions (move to top of file)

### Response schemas
Add the following Pydantic models to `src/db/models.py`:

```python
class InvoiceLineResponse(BaseModel):
    description: str
    qty: float
    unit_price: float
    total: float

class InvoiceDetailResponse(BaseModel):
    id: str
    user_id: str
    status: str                        # draft | confirmed
    invoice_number: Optional[str]      # None until finalized
    issue_date: str                    # ISO date
    due_date: Optional[str]
    payment_terms: Optional[str]
    client_id: Optional[str]
    lines: list[InvoiceLineResponse]
    tva_rate: Optional[float]
    subtotal: Optional[float]
    tva_amount: Optional[float]
    total: Optional[float]

class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"               # OpenAI voice name
```

`GET /api/v1/invoice/{invoice_id}` uses `response_model=InvoiceDetailResponse`.
`POST /api/v1/audio/tts` uses `TTSRequest` body (replaces current untyped `dict`).

### Fix technical debt
- `assign_invoice_number` in `supabase.py`: replace count-then-write with an atomic Postgres RPC (`assign_invoice_number_atomic`) to eliminate race condition

### OpenAPI enrichment
- Add `summary` and `description` to every endpoint
- Add example payloads via Pydantic `model_config` / `openapi_extra`
- Document all error codes (400, 404, 409) per endpoint

### Audio language
`POST /api/v1/audio/transcribe` currently hardcodes `language="en"`. Add an optional `language` query parameter (default `"fr"` since the primary user is French):
```
POST /api/v1/audio/transcribe?language=fr
```

### Error handling
- Centralized FastAPI exception handlers for `SessionNotFound` → 404 and `SessionNotAwaiting` → 409
- No try/except duplication in routes

---

## 4. SSE Event Types (complete)

| type | when | payload |
|------|------|---------|
| `thinking` | before each tool call | `{ type, message: string }` |
| `profile` | after user profile loaded | `{ type, data: UserProfile }` — UI hint only, no action required |
| `invoice_update` | after each field change | `{ type, field: string, value: any }` |
| `question` | agent needs user input | `{ type, message: string, awaiting: true }` |
| `done` | invoice finalized | `{ type, invoice_id: string }` |
| `error` | agent error or timeout | `{ type, message: string }` |
| `ping` | keepalive every 30s | `{ type: "ping" }` |

**Important:** A single agent action can emit multiple `invoice_update` events in sequence. For example, updating `lines` triggers separate events for `lines`, `subtotal`, `tva_amount`, and `total`. The SDK consumer must handle bursts.

**UI-only `invoice_update` fields** (emitted by the backend but not stored on invoice): `client_name` (when client is found/created), `status` (when draft is created).

---

## 5. SDK — `sdk/invoice-sdk.js`

### Public interface

```js
const agent = new InvoiceAgent({
  baseUrl: 'http://localhost:8000',
  userId: 'uuid-xxx',

  // Must return Promise<string> — the user's spoken answer
  onQuestion: async (question) => {
    speak(question);
    return await listenMic();
  },

  // Called for every invoice_update SSE event (may fire in bursts)
  // field can be: client_id, client_name, due_date, payment_terms,
  //               lines, tva_rate, subtotal, tva_amount, total, status
  onUpdate: (field, value) => {
    updateUI(field, value);
  },

  // Called when invoice is finalized — use invoiceId to fetch full details
  // via GET /api/v1/invoice/{invoiceId}
  onDone: (invoiceId) => {
    showSuccess(invoiceId);
  },

  onError: (message) => {
    showError(message);
  },

  // Optional: called before each agent tool call with a status message
  onThinking: (message) => {
    showSpinner(message);
  },
});

await agent.start(transcript);           // start from text transcript
await agent.startFromAudio(audioBlob);   // start from audio — SDK transcribes first
agent.stop();                            // cancel active session and close stream
```

### Lifecycle
- Calling `start()` or `startFromAudio()` while a session is active calls `stop()` first (closes existing EventSource, discards old session)
- `stop()` is idempotent — safe to call with no active session

### What the SDK handles internally
- `POST /api/v1/invoice/start` → obtain `session_id`
- `EventSource` on `/api/v1/invoice/stream?session_id=...`
- Parse SSE events per table in section 4
- `question` handling: SDK tracks its own `_awaitingReply` flag; if a `question` event arrives while already awaiting (SSE reconnect replay), the duplicate is suppressed
- `done` / `error` → call callback, then `eventSource.close()`
- `profile` / `ping` / `thinking` → call optional callback or ignore
- SSE reconnect: browser `EventSource` reconnects automatically; SDK debounces duplicate `question` replays using the `_awaitingReply` flag
- `startFromAudio(blob)`:
  1. `POST /api/v1/audio/transcribe` with `FormData`
  2. On HTTP error or network failure → call `onError(message)` and return (do not call `start`)
  3. On success → call `start(transcript)`

### No dependencies
Pure vanilla JS, no bundler required. Works as `<script src="sdk/invoice-sdk.js">`.

---

## 6. Documentation

### Swagger (auto-generated, enriched)
- Available at `/docs`
- Every endpoint has `summary`, `description`, request/response examples
- Error codes documented per endpoint

### `README.md` structure
```
# Invoice AI Agent — API

## Quick Start (30 seconds)
  → copy invoice-sdk.js
  → minimal working example (~20 lines)

## Flow Diagram
  transcript/audio → start → stream (SSE) → question/reply loop → done
                                                                 → GET /{invoice_id}

## SDK Reference
  new InvoiceAgent(options) — all callbacks documented
  agent.start(transcript)
  agent.startFromAudio(blob)
  agent.stop()
  Callbacks: onQuestion, onUpdate, onDone, onError, onThinking (optional)
  onUpdate field names reference

## API Reference
  All 6 endpoints with curl examples + request/response shapes

## SSE Event Types
  Full table from section 4 of this spec

## Error Handling
  HTTP codes + expected client behavior
  startFromAudio error paths

## Known Constraints
  - No authentication (user_id trusted from body)
  - In-process sessions (not multi-worker safe)
  - Transcription default language: fr (override via ?language=)
```

---

## 7. Out of Scope

- Authentication (user_id still trusted from request body — known debt, pre-production fix)
- Multi-worker session persistence (Redis upgrade path documented but not implemented)
- npm package publishing
- Low-level SDK layer (only high-level `InvoiceAgent` class)

---

## 8. Implementation Order

Steps 1+2 are a single atomic commit (file split + versioning simultaneously to avoid broken intermediate state):

1. **[atomic]** Split routes into `invoice.py` + `audio.py` AND add `/api/v1/` prefix in `main.py` — update `test_ui.html` URLs in same commit
2. Add `InvoiceDetailResponse`, `TTSRequest` schemas to `models.py`
3. Fix `assign_invoice_number` race condition (atomic Postgres RPC)
4. Add `language` param to `/audio/transcribe`
5. Enrich OpenAPI descriptions + wire `response_model` on all endpoints
6. Centralize exception handlers (`SessionNotFound`, `SessionNotAwaiting`)
7. Write `sdk/invoice-sdk.js`
8. Write `docs/README.md`
