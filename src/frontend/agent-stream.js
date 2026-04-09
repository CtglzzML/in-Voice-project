// src/frontend/agent-stream.js
import { formUpdater } from './form-updater.js';

export const BASE_URL = window.INVOICE_BASE_URL ?? 'http://localhost:8000/api/v1';

export const agentStream = (() => {
  let sessionId = null;
  let eventSource = null;

  const _statusBox = document.querySelector('#agent-status');
  const _statusText = document.querySelector('#status-text');

  let _listenForReplyFn = null;
  let _ttsInProgress = false;

  function registerListenCallback(fn) { _listenForReplyFn = fn; }

  function _showTtsBars(show) {
    const bars = document.querySelector('.tts-bars');
    if (bars) {
      if (show) bars.classList.remove('hidden');
      else bars.classList.add('hidden');
    }
  }

  async function _playTTS(text) {
    const res = await fetch(`${BASE_URL}/audio/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'alloy' })
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _showTtsBars(true);
    return new Promise(resolve => {
      audio.onended = () => { _showTtsBars(false); URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { _showTtsBars(false); URL.revokeObjectURL(url); resolve(); };
      audio.play();
    });
  }

  function _setStatusBox(message) {
    if (_statusBox) { _statusBox.classList.remove('hidden'); }
    if (_statusText) _statusText.textContent = message;
  }

  function _showStatus(message) {
    if (_statusBox) {
      _statusBox.classList.add('thinking');
      _statusBox.classList.remove('done', 'error');
    }
    _setStatusBox(message);
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.add('pulse');
  }

  function _showError(message) {
    if (_statusBox) {
      _statusBox.classList.add('error');
      _statusBox.classList.remove('thinking', 'done');
    }
    _setStatusBox(`Error: ${message}`);
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.remove('pulse');
    _resetRecordBtn();
  }

  function _onDone(invoiceId, invoiceNumber) {
    if (_statusBox) {
      _statusBox.classList.add('done');
      _statusBox.classList.remove('thinking', 'error');
    }
    _setStatusBox('✓ Invoice created! You can edit the fields below.');
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.remove('pulse');
    _hideQuestion();
    if (invoiceNumber) formUpdater.setInvoiceNumber(invoiceNumber);
    formUpdater.unlockForm();
    _resetRecordBtn();
    if (eventSource) eventSource.close();
  }

  async function start(transcript) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    sessionId = null;

    // Get Supabase session token
    if (!window._supabase) { _showError('Auth client not initialized.'); _resetRecordBtn(); return; }
    const { data, error } = await window._supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) { _showError('Not authenticated. Please log in again.'); _resetRecordBtn(); return; }

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
        if (res.status === 401) {
          _showError('Session expired. Please log in again.');
          _resetRecordBtn();
          return;
        }
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
    switch (event.type.toLowerCase()) {
      case 'message':
      case 'thinking':
        _showStatus(event.content || event.message || 'Agent processing...');
        break;
      case 'profile':
        formUpdater.updateProfile(event.data);
        break;
      case 'invoice_updated':
      case 'invoice_update':
        formUpdater.update(event.field, event.value);
        _markFieldFilled(event.field);
        break;
      case 'waiting_user_input':
      case 'question':
        _showQuestion(event.message);
        break;
      case 'need_client_info':
        _showInlineClientForm(event.data?.name || '');
        break;
      case 'client_suggestions':
        _showClientSuggestions(event.message, event.suggestions);
        break;
      case 'ui_action':
        if (event.action === 'show_create_client_inline') {
          _showInlineClientForm(event.data?.name || '');
        }
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

      if (!res.ok) {
        if (res.status === 409) {
          _showStatus('Not expecting a reply at the moment.');
        } else {
          _showError(`Reply error: ${res.status}`);
        }
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

  let _autoListenTimeout = null;

  async function _showQuestion(message) {
    const box     = document.querySelector('#question-box');
    const text    = document.querySelector('#question-text');
    const input   = document.querySelector('#reply-input');
    const sendBtn = document.querySelector('#reply-send-btn');
    const micBtn  = document.querySelector('#reply-mic-btn');
    
    if (box)     box.classList.remove('hidden');
    if (text)    text.textContent = message;
    
    if (input) { 
      input.classList.remove('hidden');
      input.value = ''; 
      input.focus(); 
    }
    if (sendBtn) {
      sendBtn.classList.remove('hidden');
      sendBtn.disabled = false;
    }
    if (micBtn)  micBtn.classList.add('auto-listening');
    _setStatusBox('Waiting for your reply…');
    
    if (_statusBox) {
      _statusBox.classList.remove('thinking', 'done', 'error');
    }
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.remove('pulse');

    if (!_ttsInProgress) {
      _ttsInProgress = true;
      await _playTTS(message);
      _ttsInProgress = false;
      clearTimeout(_autoListenTimeout);
      
      const form = document.querySelector('#inline-client-form');
      if (form && !form.classList.contains('hidden')) {
        // If inline form is visible, do not auto listen
        return;
      }

      _autoListenTimeout = setTimeout(() => {
        _listenForReplyFn?.();
        if (input) {
          const oldPlaceholder = input.placeholder;
          input.placeholder = 'Listening...';
          setTimeout(() => { input.placeholder = oldPlaceholder; }, 5000);
        }
      }, 1000);
    }
  }

  function _hideQuestion() {
    _ttsInProgress = false;
    clearTimeout(_autoListenTimeout);
    const box = document.querySelector('#question-box');
    if (box) box.classList.add('hidden');
    _hideClientSuggestions();
    _hideInlineClientForm();
  }

  function _showClientSuggestions(message, suggestions) {
    const box  = document.querySelector('#client-suggestions-box');
    const msg  = document.querySelector('#client-suggestions-msg');
    const list = document.querySelector('#client-suggestions-list');

    if (!box || !list) return;

    box.classList.remove('hidden');
    if (msg) msg.textContent = message;
    _setStatusBox('Select a client or create a new one');
    if (_statusBox) {
      _statusBox.classList.remove('thinking', 'done', 'error');
    }
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.remove('pulse');

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
  }

  function _hideClientSuggestions() {
    const box = document.querySelector('#client-suggestions-box');
    if (box) box.classList.add('hidden');
  }

  function _showInlineClientForm(clientName) {
    const form = document.querySelector('#inline-client-form');
    if (!form) return;

    form.dataset.clientName = clientName;

    const nameInput    = form.querySelector('#icf-name');
    const emailInput   = form.querySelector('#icf-email');
    const phoneInput   = form.querySelector('#icf-phone');
    const submitBtn    = form.querySelector('#icf-submit');
    const errorMsg     = form.querySelector('#icf-error');

    if (nameInput)    nameInput.value    = clientName || '';
    if (emailInput)   emailInput.value   = '';
    if (phoneInput)   phoneInput.value   = '';
    if (errorMsg)     errorMsg.textContent = '';

    form.classList.remove('hidden');
    clearTimeout(_autoListenTimeout);

    if (submitBtn) {
      submitBtn.onclick = () => {
        const name    = nameInput?.value.trim() || form.dataset.clientName || '';
        const email   = emailInput?.value.trim()   || '';
        const phone   = phoneInput?.value.trim()   || '';

        form.classList.add('hidden');
        sendReply(JSON.stringify({ name, email, phone }));
        _showStatus("Creating client...");
      };
    }
  }

  function _hideInlineClientForm() {
    const form = document.querySelector('#inline-client-form');
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

  const MANDATORY_FIELDS = ['client_id', 'lines', 'tva_rate', 'due_date', 'payment_terms'];
  function _markFieldFilled(field) {
    if (!MANDATORY_FIELDS.includes(field)) return;
    const chip = document.querySelector(`#missing-fields .field-chip[data-field="${field}"]`);
    if (!chip) return;
    if (chip.classList.contains('filled')) return;
    const missingFields = document.querySelector('#missing-fields');
    if (missingFields) missingFields.classList.remove('hidden');
    chip.classList.remove('missing');
    chip.classList.add('filled');
    chip.textContent = `✓ ${chip.textContent.replace('· ', '')}`;
  }

  function isActive() { return !!sessionId; }

  function abandonSession() {
    if (eventSource) { eventSource.close(); eventSource = null; }
    sessionId = null;
    _hideQuestion();
    _resetRecordBtn();
    
    if (_statusBox) {
      _statusBox.classList.add('hidden');
      _statusBox.classList.remove('thinking', 'done', 'error');
    }
    
    const abandonBtn = document.querySelector('#abandon-btn');
    if (abandonBtn) abandonBtn.style.display = 'none';
    
    sessionStorage.removeItem('invoiceDraft');
    localStorage.removeItem('persistentInvoiceDraft');
    location.reload();
  }

  return { start, sendReply, registerListenCallback, isActive, abandonSession };
})();
