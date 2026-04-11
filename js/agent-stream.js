// js/agent-stream.js
// Responsibility: SSE connection + POST /start + POST /reply

const BASE_URL = window.INVOICE_BASE_URL ?? 'http://localhost:8000/api/v1';

const agentStream = (() => {
  let sessionId = null;
  let eventSource = null;

  // Cache static DOM nodes once — they never change
  const _statusBox = document.querySelector('#agent-status');
  const _statusText = document.querySelector('#status-text');
  const _spinner = _statusBox?.querySelector('.spinner');

  // -- Status box helpers --

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
    eventSource.close();
  }

  // -- Core flow --

  async function start(transcript) {
    // Close any previous session before starting a new one
    if (eventSource) { eventSource.close(); eventSource = null; }
    sessionId = null;

    const userId = window.INVOICE_USER_ID;
    if (!userId) { _showError('INVOICE_USER_ID missing.'); return; }

    _showStatus('Starting agent...');

    try {
      const res = await fetch(`${BASE_URL}/invoice/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, transcript })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        _showError(`Start error: ${err.detail || res.status}`);
        _resetRecordBtn();
        return;
      }

      const data = await res.json();
      sessionId = data.session_id;
      _openStream();
    } catch (e) {
      _showError(`Network error: ${e.message}`);
      _resetRecordBtn();
    }
  }

  function _openStream() {
    eventSource = new EventSource(`${BASE_URL}/invoice/stream?session_id=${sessionId}`);

    eventSource.onmessage = (e) => {
      _handleEvent(JSON.parse(e.data));
    };

    eventSource.onerror = () => {
      _showError('Connection lost.');
      eventSource.close();
    };
  }

  function _handleEvent(event) {
    switch (event.type) {
      case 'thinking':
      case 'MESSAGE':
        _showStatus(event.message || event.content || 'Agent thinking...');
        break;

      case 'profile':
      case 'PROFILE':
        formUpdater.updateProfile(event.data);
        break;

      case 'invoice_update':
      case 'INVOICE_UPDATED':
        formUpdater.update(event.field, event.value);
        break;

      case 'question':
      case 'WAITING_USER_INPUT':
        _showQuestion(event.message);
        break;

      case 'done':
      case 'DONE':
        _onDone(event.invoice_id, event.invoice_number);
        break;

      case 'error':
      case 'ERROR':
        _showError(event.message || 'Agent error.');
        eventSource.close();
        break;

      case 'NEED_CLIENT_INFO':
        // V2: backend requests client info via form
        // For now treat as a status message; form display handled by question event preceding this
        break;

      case 'ping':
      case 'PING':
        break;
    }
  }

  async function sendReply(text) {
    if (!text.trim()) {
      document.querySelector('#reply-input').focus();
      return;
    }

    const sendBtn = document.querySelector('#reply-send-btn');
    sendBtn.disabled = true;

    try {
      const res = await fetch(`${BASE_URL}/invoice/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, reply: text })
      });

      if (!res.ok) {
        // 409 = double send (reply already received), ignore silently
        if (res.status !== 409) {
          _showError(`Reply error: ${res.status}`);
          sendBtn.disabled = false;
          return;
        }
      }
    } catch (e) {
      _showError(`Network error: ${e.message}`);
      sendBtn.disabled = false;
      return;
    }

    _hideQuestion();
    _showStatus('Agent thinking...');
  }

  // -- UI helpers --

  function _showQuestion(message) {
    const box     = document.querySelector('#question-box');
    const text    = document.querySelector('#question-text');
    const input   = document.querySelector('#reply-input');
    const sendBtn = document.querySelector('#reply-send-btn');
    const micBtn  = document.querySelector('#reply-mic-btn');
    if (box)     box.classList.remove('hidden');
    if (text)    text.textContent = message;
    if (input)   { input.value = ''; }
    if (sendBtn) sendBtn.disabled = false;
    
    // Hide the small mic button since we're using the main one
    if (micBtn)  micBtn.style.display = 'none';

    // Update main button label
    const recordBtnLabel = document.querySelector('.record-btn-label');
    if (recordBtnLabel) recordBtnLabel.textContent = 'Reply with voice';
  }

  function _hideQuestion() {
    const box = document.querySelector('#question-box');
    if (box) box.classList.add('hidden');
    
    const recordBtnLabel = document.querySelector('.record-btn-label');
    if (recordBtnLabel) recordBtnLabel.textContent = 'Start recording';
  }

  function _resetRecordBtn() {
    const btn = document.querySelector('#record-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('recording');
    btn.querySelector('.record-btn-label').textContent = 'Start recording';
  }

  return { start, sendReply };
})();
