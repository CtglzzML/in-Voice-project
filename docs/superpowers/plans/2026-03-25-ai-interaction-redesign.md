# AI Interaction Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the user/AI interaction zone in `create_invoice.html` — status bar with dot+waveform, missing fields chips, TTS auto-play on questions, and auto-listen after TTS ends.

**Architecture:** Modify 4 existing files in-place. CSS additions go at end of `create_invoice.css`. HTML changes are scoped to `.manual-entry-card` only. JS additions are surgical — rewrite status functions to use classList, add TTS+auto-listen to `agent-stream.js`, register callback in `recorder.js` to avoid circular dependency.

**Tech Stack:** Vanilla JS ES modules (Vite), HTML5 Audio API, Web Speech API, Server-Sent Events, FastAPI backend at `http://localhost:8000/api/v1`

---

## File Map

| File | Change |
|------|--------|
| `css/create_invoice.css` | Append new classes at end of file |
| `pages/create_invoice.html` | Modify `.manual-entry-card` internals only |
| `src/frontend/agent-stream.js` | Rewrite status functions + add TTS/chips/callback |
| `src/frontend/recorder.js` | Add 1 line after `init()` |

---

### Task 1: Add CSS for new components

**Files:**
- Modify: `css/create_invoice.css` (append at end)

- [ ] **Step 1: Append new CSS classes at the end of `css/create_invoice.css`**

```css
/* ===========================
   AI INTERACTION REDESIGN
   =========================== */

/* Status bar */
.ai-status { display:flex; align-items:center; gap:10px; background:rgba(98,88,143,0.08); border:1px solid rgba(98,88,143,0.28); border-radius:5px; padding:10px 14px; }
.ai-status.hidden { display:none; }
.ai-status-dot { width:8px; height:8px; border-radius:50%; background:#62588f; box-shadow:0 0 8px rgba(98,88,143,0.45); flex-shrink:0; }
.ai-status.thinking .ai-status-dot { animation:dot-pulse 1.4s ease-in-out infinite; }
@keyframes dot-pulse { 0%,100%{box-shadow:0 0 4px rgba(98,88,143,0.3)} 50%{box-shadow:0 0 12px rgba(98,88,143,0.7)} }

/* Waveform bars (visible only in thinking state) */
.waveform-bars { display:none; gap:3px; align-items:center; }
.ai-status.thinking .waveform-bars { display:flex; }
.waveform-bars span { display:inline-block; width:3px; border-radius:2px; background:#62588f; }
.waveform-bars span:nth-child(1) { height:10px; opacity:0.4; animation:wave 1s ease-in-out infinite 0s; }
.waveform-bars span:nth-child(2) { height:16px; opacity:0.7; animation:wave 1s ease-in-out infinite 0.15s; }
.waveform-bars span:nth-child(3) { height:8px;  opacity:0.5; animation:wave 1s ease-in-out infinite 0.3s; }
.waveform-bars span:nth-child(4) { height:13px; opacity:0.8; animation:wave 1s ease-in-out infinite 0.45s; }
.waveform-bars span:nth-child(5) { height:6px;  opacity:0.3; animation:wave 1s ease-in-out infinite 0.6s; }
@keyframes wave { 0%,100%{transform:scaleY(0.6)} 50%{transform:scaleY(1.3)} }

/* Done state */
.ai-status.done { background:#f0fdf4; border-color:#86efac; }
.ai-status.done .ai-status-dot { background:#16a34a; box-shadow:0 0 8px rgba(22,163,74,0.45); animation:none; }
.ai-status.done #status-text { color:#15803d; }

/* Error state */
.ai-status.error { background:#fff1f2; border-color:#fecdd3; }
.ai-status.error .ai-status-dot { background:#dc2626; box-shadow:0 0 8px rgba(220,38,38,0.45); animation:none; }
.ai-status.error #status-text { color:#dc2626; }

/* Missing fields chips */
.missing-fields { display:flex; gap:6px; flex-wrap:wrap; }
.missing-fields.hidden { display:none; }
.field-chip { font-size:0.78rem; font-weight:600; padding:3px 10px; border-radius:20px; border:1px solid; transition:all 0.2s ease; }
.field-chip.missing { background:#fffbeb; border-color:#fde68a; color:#b45309; }
.field-chip.filled  { background:#f0fdf4; border-color:#86efac; color:#16a34a; }

/* TTS bars inside agent-badge */
.tts-bars { display:none; gap:2px; align-items:center; margin-left:4px; }
.tts-bars.playing { display:flex; }
.tts-bars span { display:inline-block; width:2px; border-radius:1px; background:#62588f; }
.tts-bars span:nth-child(1) { height:8px;  opacity:0.5; animation:wave 0.8s ease-in-out infinite 0s; }
.tts-bars span:nth-child(2) { height:12px; opacity:0.9; animation:wave 0.8s ease-in-out infinite 0.2s; }
.tts-bars span:nth-child(3) { height:6px;  opacity:0.4; animation:wave 0.8s ease-in-out infinite 0.4s; }
```

- [ ] **Step 2: Verify no existing CSS is broken**

Open `pages/create_invoice.html` in a browser (via Vite: `npm run dev` or direct file). Confirm the page still looks identical — no new components visible yet (all hidden).

- [ ] **Step 3: Commit**

```bash
git add css/create_invoice.css
git commit -m "style: add AI interaction components CSS (status bar, chips, TTS bars)"
```

---

### Task 2: Update HTML — status bar, missing fields chips, tts-bars

**Files:**
- Modify: `pages/create_invoice.html` (inside `.manual-entry-card` only)

Context: The current `.manual-entry-card` starts at line ~41. It contains `#agent-status`, `#question-box`, `.manual-actions`, etc.

- [ ] **Step 1: Replace `#agent-status` inner HTML**

Find this block (lines ~42-47):
```html
<div id="agent-status" class="agent-status hidden">
  <div class="agent-dots">
    <span></span><span></span><span></span>
  </div>
  <span id="status-text"></span>
</div>
```

Replace with:
```html
<div id="agent-status" class="ai-status hidden">
  <div class="ai-status-dot"></div>
  <span id="status-text"></span>
  <div class="waveform-bars">
    <span></span><span></span><span></span><span></span><span></span>
  </div>
</div>
```

- [ ] **Step 2: Add `#missing-fields` after `#agent-status` — inside `.manual-entry-card`**

Immediately after the `#agent-status` closing `</div>`, add:
```html
<div id="missing-fields" class="missing-fields hidden">
  <span class="field-chip missing" data-field="client_id">· Client</span>
  <span class="field-chip missing" data-field="lines">· Lignes</span>
  <span class="field-chip missing" data-field="tva_rate">· TVA</span>
  <span class="field-chip missing" data-field="due_date">· Échéance</span>
  <span class="field-chip missing" data-field="payment_terms">· Conditions</span>
</div>
```

**Important:** This must be a child of `.manual-entry-card`, NOT a direct child of `.voice-zone`, to avoid the `.voice-zone > div` generic CSS rules.

- [ ] **Step 3: Add `.tts-bars` in `.agent-badge`**

Find this block inside `#question-box`:
```html
<div class="agent-badge">
  <span class="agent-badge-dot"></span>
  <span class="agent-badge-text">AI ASSISTANT</span>
</div>
```

Replace with:
```html
<div class="agent-badge">
  <span class="agent-badge-dot"></span>
  <span class="agent-badge-text">AI ASSISTANT</span>
  <span class="tts-bars">
    <span></span><span></span><span></span>
  </span>
</div>
```

- [ ] **Step 4: Verify HTML structure in browser**

Open `pages/create_invoice.html`. Confirm:
- Page looks identical (all new components are hidden by default)
- No layout shift or broken styles
- Browser DevTools shows `#agent-status` has class `ai-status hidden`, `#missing-fields` is inside `.manual-entry-card`

- [ ] **Step 5: Commit**

```bash
git add pages/create_invoice.html
git commit -m "feat: update voice zone HTML — ai-status structure, missing-fields chips, tts-bars"
```

---

### Task 3: Rewrite status functions in `agent-stream.js` to use classList

**Files:**
- Modify: `src/frontend/agent-stream.js`

This task rewrites the existing `_setStatusBox`, `_showStatus`, `_showError`, `_onDone` functions to use CSS classes instead of inline styles, and removes the dead `.spinner` reference.

- [ ] **Step 1: Remove `_spinner` variable and rewrite the 4 status functions**

Find and replace this block (lines ~10-36):
```js
const _statusBox = document.querySelector('#agent-status');
const _statusText = document.querySelector('#status-text');
const _spinner = _statusBox?.querySelector('.spinner');

function _setStatusBox(message, { color = '', showSpinner }) {
  if (_statusBox) { _statusBox.classList.remove('hidden'); _statusBox.style.color = color; }
  if (_spinner) _spinner.style.display = showSpinner ? 'block' : 'none';
  if (_statusText) _statusText.textContent = message;
}

function _showStatus(message) {
  _setStatusBox(message, { showSpinner: true });
}

function _showError(message) {
  _setStatusBox(`Error: ${message}`, { color: 'red', showSpinner: false });
  _resetRecordBtn();
}

function _onDone(invoiceId, invoiceNumber) {
  _setStatusBox('✓ Invoice created! You can edit the fields below.', { color: 'green', showSpinner: false });
  _hideQuestion();
  if (invoiceNumber) formUpdater.setInvoiceNumber(invoiceNumber);
  formUpdater.unlockForm();
  _resetRecordBtn();
  if (eventSource) eventSource.close();
}
```

Replace with:
```js
const _statusBox = document.querySelector('#agent-status');
const _statusText = document.querySelector('#status-text');

function _showStatus(message) {
  if (!_statusBox) return;
  _statusBox.classList.remove('hidden', 'done', 'error');
  _statusBox.classList.add('thinking');
  if (_statusText) _statusText.textContent = message;
}

function _showError(message) {
  if (!_statusBox) return;
  _statusBox.classList.remove('hidden', 'thinking', 'done');
  _statusBox.classList.add('error');
  if (_statusText) _statusText.textContent = `Error: ${message}`;
  _resetRecordBtn();
}

function _onDone(invoiceId, invoiceNumber) {
  if (_statusBox) {
    _statusBox.classList.remove('hidden', 'thinking', 'error');
    _statusBox.classList.add('done');
  }
  if (_statusText) _statusText.textContent = '✓ Invoice created! You can edit the fields below.';
  _hideQuestion();
  if (invoiceNumber) formUpdater.setInvoiceNumber(invoiceNumber);
  formUpdater.unlockForm();
  _resetRecordBtn();
  if (eventSource) eventSource.close();
}
```

- [ ] **Step 2: Verify status states work in browser**

Start the FastAPI backend: `uvicorn main:app --reload`

Open `pages/create_invoice.html`. Open DevTools console. Manually test by pasting in console:
```js
// thinking state
document.querySelector('#agent-status').classList.remove('hidden','done','error'); document.querySelector('#agent-status').classList.add('thinking'); document.querySelector('#status-text').textContent = 'Searching...';
// done state
document.querySelector('#agent-status').classList.remove('thinking','error'); document.querySelector('#agent-status').classList.add('done'); document.querySelector('#status-text').textContent = '✓ Invoice created!';
// error state
document.querySelector('#agent-status').classList.remove('thinking','done'); document.querySelector('#agent-status').classList.add('error'); document.querySelector('#status-text').textContent = 'Error: something went wrong';
```

Expected: dot color, background, and text color change correctly for each state. Waveform bars visible only in `thinking`.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/agent-stream.js
git commit -m "refactor: replace inline style status updates with classList in agent-stream.js"
```

---

### Task 4: Add TTS, auto-listen, missing fields tracking to `agent-stream.js`

**Files:**
- Modify: `src/frontend/agent-stream.js`

- [ ] **Step 1: Add module-level variables and `registerListenCallback`**

At the top of the IIFE (just after `let eventSource = null;`), add:
```js
let _listenForReplyFn = null;
let _ttsInProgress = false;
```

Add `registerListenCallback` as a new function inside the IIFE:
```js
function registerListenCallback(fn) {
  _listenForReplyFn = fn;
}
```

Expose it in the return statement: change `return { start, sendReply };` to `return { start, sendReply, registerListenCallback };`

- [ ] **Step 2: Add `_showTtsBars` helper and `_playTTS` function**

Add these two functions inside the IIFE (before `_showQuestion`):
```js
function _showTtsBars(visible) {
  const bars = document.querySelector('.tts-bars');
  if (!bars) return;
  bars.classList.toggle('playing', visible);
}

async function _playTTS(text) {
  try {
    const res = await fetch(`${BASE_URL}/audio/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'alloy' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _showTtsBars(true);
    return new Promise(resolve => {
      audio.onended = () => { _showTtsBars(false); URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { _showTtsBars(false); URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => { _showTtsBars(false); URL.revokeObjectURL(url); resolve(); });
    });
  } catch (e) {
    console.warn('TTS failed (silent fallback):', e);
  }
}
```

- [ ] **Step 3: Update `_showQuestion` to add TTS + auto-listen**

Find the existing `_showQuestion(message)` function and replace its body:
```js
function _showQuestion(message) {
  const box     = document.querySelector('#question-box');
  const text    = document.querySelector('#question-text');
  const input   = document.querySelector('#reply-input');
  const sendBtn = document.querySelector('#reply-send-btn');
  const micBtn  = document.querySelector('#reply-mic-btn');
  if (box)     box.classList.remove('hidden');
  if (text)    text.textContent = message;
  if (input)   { input.value = ''; input.focus(); }
  if (sendBtn) sendBtn.disabled = false;
  if (micBtn)  micBtn.classList.add('auto-listening');
  _showStatus('Waiting for your reply…');

  // TTS + auto-listen (skip if already in progress — SSE reconnect replay guard)
  if (_ttsInProgress) return;
  _ttsInProgress = true;

  (async () => {
    await _playTTS(message);
    await new Promise(r => setTimeout(r, 1000));
    if (input) input.placeholder = 'Écoute en cours…';
    _listenForReplyFn?.();
    if (input) setTimeout(() => { input.placeholder = 'Type your reply...'; }, 3000);
  })();
}
```

- [ ] **Step 4: Reset `_ttsInProgress` in `_hideQuestion`**

Find `_hideQuestion()` and add `_ttsInProgress = false;` at the top:
```js
function _hideQuestion() {
  _ttsInProgress = false;
  const box = document.querySelector('#question-box');
  if (box) box.classList.add('hidden');
  _hideClientSuggestions();
  _hideNewClientForm();
}
```

- [ ] **Step 5: Add `_markFieldFilled` and hook into `_handleEvent`**

Add this function inside the IIFE:
```js
const _MANDATORY_FIELDS = ['client_id', 'lines', 'tva_rate', 'due_date', 'payment_terms'];

function _markFieldFilled(field) {
  if (!_MANDATORY_FIELDS.includes(field)) return;
  const chip = document.querySelector(`#missing-fields .field-chip[data-field="${field}"]`);
  if (!chip) return;
  if (chip.classList.contains('filled')) return;
  const container = document.querySelector('#missing-fields');
  if (container) container.classList.remove('hidden');
  chip.classList.remove('missing');
  chip.classList.add('filled');
  chip.textContent = `✓ ${chip.textContent.replace('· ', '')}`;
}
```

In `_handleEvent`, update the `invoice_update` case:
```js
case 'invoice_update':
  formUpdater.update(event.field, event.value);
  _markFieldFilled(event.field);
  break;
```

- [ ] **Step 6: Verify in browser (DevTools)**

With backend running, open `pages/create_invoice.html`. In console:
```js
// Test chips appear and turn green
import('./src/frontend/agent-stream.js').then(m => {
  // simulate invoice_update for client_id
  document.querySelector('#missing-fields').classList.remove('hidden');
  const chip = document.querySelector('[data-field="client_id"]');
  chip.classList.remove('missing'); chip.classList.add('filled');
  chip.textContent = '✓ Client';
});
```

Or just run a real invoice flow: click record, say an invoice request, watch chips update in real time.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/agent-stream.js
git commit -m "feat: add TTS auto-play, auto-listen after TTS, missing fields chips tracking"
```

---

### Task 5: Register listen callback in `recorder.js`

**Files:**
- Modify: `src/frontend/recorder.js`

- [ ] **Step 1: Fix `_showError` in `recorder.js` to use classList**

Find this block in `_showError` (lines ~243-247):
```js
function _showError(msg) {
  const box  = document.querySelector('#agent-status');
  const text = document.querySelector('#status-text');
  if (box)  { box.classList.remove('hidden'); box.style.color = 'red'; }
  if (text) text.textContent = msg;
}
```

Replace with:
```js
function _showError(msg) {
  const box  = document.querySelector('#agent-status');
  const text = document.querySelector('#status-text');
  if (box) {
    box.classList.remove('hidden', 'thinking', 'done');
    box.classList.add('error');
  }
  if (text) text.textContent = msg;
}
```

- [ ] **Step 2: Register the listen callback after `init()`**

The `recorder` object is defined at the top of the IIFE with `const recorder = (() => { ... return { listenForReply }; })();`. After the closing `})();`, add:

```js
agentStream.registerListenCallback(() => recorder.listenForReply());
```

Note: `agentStream` is already imported at the top of `recorder.js` (`import { agentStream, BASE_URL } from './agent-stream.js';`). This is safe — it's a callback registration, not a call-time circular dep.

- [ ] **Step 3: Full end-to-end verification**

With backend running (`uvicorn main:app --reload`), open `pages/create_invoice.html` in browser.

1. Click "Start recording", say: *"Invoice Jean Dupont for 5 hours of web development at 120 euros"*
2. Expected sequence:
   - Status bar appears with purple dot pulsing + waveform → "Starting agent..."
   - Chips container appears, fields turn green as agent fills them
   - If agent asks a question: question box appears + TTS plays the question aloud + mic auto-activates 1s later
   - On done: status bar turns green "✓ Invoice created!"

- [ ] **Step 4: Commit**

```bash
git add src/frontend/recorder.js
git commit -m "feat: register auto-listen callback in recorder, fix _showError to use classList"
```

---

### Task 6: Final cleanup and verification

- [ ] **Step 1: Check `.gitignore` includes `.superpowers/`**

```bash
grep -q ".superpowers" .gitignore || echo ".superpowers/" >> .gitignore
git add .gitignore
```

- [ ] **Step 2: Run existing Python tests to confirm backend untouched**

```bash
uv run pytest
```

Expected: all tests pass (no backend changes were made).

- [ ] **Step 3: Final commit if .gitignore was updated**

```bash
git diff --staged --quiet || git commit -m "chore: add .superpowers to .gitignore"
```
