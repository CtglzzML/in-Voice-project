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
