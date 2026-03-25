// src/frontend/agent-stream.js
import { formUpdater } from './form-updater.js';

export const BASE_URL = window.INVOICE_BASE_URL ?? 'http://localhost:8000/api/v1';

export const agentStream = (() => {
  let sessionId = null;
  let eventSource = null;

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

  async function start(transcript) {
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
      _openStream(0);
    } catch (e) {
      _showError(`Network error: ${e.message}`);
      _resetRecordBtn();
    }
  }

  function _openStream(retryCount = 0) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`${BASE_URL}/invoice/stream?session_id=${sessionId}`);

    eventSource.onmessage = (e) => {
      _handleEvent(JSON.parse(e.data));
    };

    eventSource.onerror = () => {
      eventSource.close();
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      _showError(`Connection lost. Reconnecting in ${delay/1000}s...`);
      setTimeout(() => _openStream(retryCount + 1), delay);
    };
  }

  function _handleEvent(event) {
    switch (event.type) {
      case 'thinking':
        _showStatus(event.message || 'Agent thinking...');
        break;
      case 'profile':
        formUpdater.updateProfile(event.data);
        break;
      case 'invoice_update':
        formUpdater.update(event.field, event.value);
        break;
      case 'question':
        _showQuestion(event.message);
        break;
      case 'client_suggestions':
        _showClientSuggestions(event.message, event.suggestions);
        break;
      case 'client_form_needed':
        _showNewClientForm(event.extracted_name || '');
        break;
      case 'done':
        _onDone(event.invoice_id, event.invoice_number);
        break;
      case 'error':
        _showError(event.message || 'Agent error.');
        if (eventSource) eventSource.close();
        break;
      case 'ping':
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

      if (!res.ok && res.status !== 409) {
        _showError(`Reply error: ${res.status}`);
        sendBtn.disabled = false;
        return;
      }
    } catch (e) {
      _showError(`Network error: ${e.message}`);
      sendBtn.disabled = false;
      return;
    }

    _hideQuestion();
    _showStatus('Agent thinking...');
  }

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
    _setStatusBox('Waiting for your reply…', { showSpinner: false });
  }

  function _hideQuestion() {
    const box = document.querySelector('#question-box');
    if (box) box.classList.add('hidden');
    _hideClientSuggestions();
    _hideNewClientForm();
  }

  function _showClientSuggestions(message, suggestions) {
    const box  = document.querySelector('#client-suggestions-box');
    const msg  = document.querySelector('#client-suggestions-msg');
    const list = document.querySelector('#client-suggestions-list');
    const newBtn = document.querySelector('#new-client-btn');

    if (!box || !list) return;

    box.classList.remove('hidden');
    if (msg) msg.textContent = message;
    _setStatusBox('Sélectionnez un client ou créez-en un nouveau', { showSpinner: false });

    list.innerHTML = '';
    suggestions.forEach(c => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.innerHTML = `<strong>${c.name}</strong><br><small>${c.address || ''}</small>`;
      card.addEventListener('click', () => {
        _hideClientSuggestions();
        sendReply(JSON.stringify({ client_id: c.id, client_name: c.name }));
      });
      list.appendChild(card);
    });

    if (newBtn) {
      newBtn.onclick = () => {
        _hideClientSuggestions();
        _showNewClientForm('');
      };
    }
  }

  function _hideClientSuggestions() {
    const box = document.querySelector('#client-suggestions-box');
    if (box) box.classList.add('hidden');
  }

  function _showNewClientForm(extractedName) {
    const form = document.querySelector('#new-client-form');
    if (!form) return;

    const nameInput    = form.querySelector('#ncf-name');
    const addressInput = form.querySelector('#ncf-address');
    const emailInput   = form.querySelector('#ncf-email');
    const phoneInput   = form.querySelector('#ncf-phone');
    const submitBtn    = form.querySelector('#ncf-submit');
    const errorMsg     = form.querySelector('#ncf-error');

    if (nameInput)    nameInput.value    = extractedName || '';
    if (addressInput) addressInput.value = '';
    if (emailInput)   emailInput.value   = '';
    if (phoneInput)   phoneInput.value   = '';
    if (errorMsg)     errorMsg.textContent = '';

    form.classList.remove('hidden');
    _setStatusBox('Nouveau client — remplissez le formulaire', { showSpinner: false });

    // Focus first empty field
    if (nameInput && !nameInput.value) nameInput.focus();
    else if (addressInput) addressInput.focus();

    if (submitBtn) {
      submitBtn.onclick = () => {
        const name    = nameInput?.value.trim()    || '';
        const address = addressInput?.value.trim() || '';
        const email   = emailInput?.value.trim()   || '';
        const phone   = phoneInput?.value.trim()   || '';

        if (!name || !address) {
          if (errorMsg) errorMsg.textContent = 'Nom et adresse sont obligatoires.';
          return;
        }

        form.classList.add('hidden');
        sendReply(JSON.stringify({ name, address, email, phone }));
        _showStatus('Création du client...');
      };
    }
  }

  function _hideNewClientForm() {
    const form = document.querySelector('#new-client-form');
    if (form) form.classList.add('hidden');
  }

  function _resetRecordBtn() {
    const btn = document.querySelector('#record-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('recording');
    const label = btn.querySelector('.record-btn-label');
    if (label) label.textContent = 'Start recording';
  }

  return { start, sendReply };
})();
