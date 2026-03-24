// js/agent-stream.js
// Responsabilité : SSE + POST /start + POST /reply

const BASE_URL = 'http://localhost:8000/api/v1';

const agentStream = (() => {
  let sessionId = null;
  let eventSource = null;

  async function start(transcript) {
    const userId = window.INVOICE_USER_ID;
    if (!userId) {
      _showError('INVOICE_USER_ID manquant dans window.');
      return;
    }

    _showStatus('Démarrage de l\'agent...');

    try {
      const res = await fetch(`${BASE_URL}/invoice/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, transcript })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        _showError(`Erreur démarrage : ${err.detail || res.status}`);
        _resetRecordBtn();
        return;
      }

      const data = await res.json();
      sessionId = data.session_id;
      _openStream();
    } catch (e) {
      _showError(`Erreur réseau : ${e.message}`);
      _resetRecordBtn();
    }
  }

  function _openStream() {
    eventSource = new EventSource(`${BASE_URL}/invoice/stream?session_id=${sessionId}`);

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      _handleEvent(event);
    };

    eventSource.onerror = () => {
      _showError('Connexion SSE interrompue.');
      eventSource.close();
    };
  }

  function _handleEvent(event) {
    switch (event.type) {
      case 'thinking':
        _showStatus(event.message || 'L\'agent réfléchit...');
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

      case 'done':
        _onDone(event.invoice_id);
        break;

      case 'error':
        _showError(event.message || 'Erreur agent.');
        eventSource.close();
        break;

      case 'ping':
        // keepalive, rien à faire
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
        // 409 = double envoi, ignorer silencieusement
        if (res.status !== 409) {
          _showError(`Erreur envoi réponse : ${res.status}`);
        }
      }
    } catch (e) {
      _showError(`Erreur réseau : ${e.message}`);
    }

    _hideQuestion();
    _showStatus('L\'agent réfléchit...');
  }

  function _showStatus(message) {
    const box = document.querySelector('#agent-status');
    const text = document.querySelector('#status-text');
    if (box) box.classList.remove('hidden');
    if (text) text.textContent = message;
  }

  function _showQuestion(message) {
    const box = document.querySelector('#question-box');
    const text = document.querySelector('#question-text');
    const input = document.querySelector('#reply-input');
    const sendBtn = document.querySelector('#reply-send-btn');
    if (box) box.classList.remove('hidden');
    if (text) text.textContent = message;
    if (input) { input.value = ''; input.focus(); }
    if (sendBtn) sendBtn.disabled = false;
  }

  function _hideQuestion() {
    const box = document.querySelector('#question-box');
    if (box) box.classList.add('hidden');
  }

  function _showError(message) {
    const box = document.querySelector('#agent-status');
    const text = document.querySelector('#status-text');
    if (box) { box.classList.remove('hidden'); box.style.color = 'red'; }
    if (text) text.textContent = `Erreur : ${message}`;
    _resetRecordBtn();
  }

  function _onDone(invoiceId) {
    const box = document.querySelector('#agent-status');
    const text = document.querySelector('#status-text');
    if (box) box.classList.remove('hidden');
    if (text) text.textContent = 'Facture créée ! Vous pouvez modifier les champs.';
    _hideQuestion();
    formUpdater.unlockForm();
    eventSource.close();
    // invoiceId disponible pour redirection future
    console.log('Invoice ID:', invoiceId);
  }

  function _resetRecordBtn() {
    const btn = document.querySelector('#record-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🎤 Start recording'; }
  }

  return { start, sendReply };
})();
