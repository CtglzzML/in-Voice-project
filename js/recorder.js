// js/recorder.js
// Responsibility: audio capture — Web Speech API + Whisper fallback
// Supports two modes:
//   - startMain()  : captures the initial invoice request (manual trigger)
//   - listenForReply() : auto-activates after an agent question (no click needed)

const recorder = (() => {
  let recognition = null;
  let mediaRecorder = null;

  // ─── Public init (wires manual record button + typed reply) ───────────────

  function init() {
    const recordBtn   = document.querySelector('#record-btn');
    const replyInput  = document.querySelector('#reply-input');
    const replySendBtn = document.querySelector('#reply-send-btn');
    const replyMicBtn = document.querySelector('#reply-mic-btn');

    if (!recordBtn) { console.error('recorder.js: #record-btn not found'); return; }

    recordBtn.addEventListener('click', () => {
      if (recognition || mediaRecorder) return;
      _setRecordingState(true);
      _startCapture('en-US', _onMainTranscript);
    });

    // Typed reply — still supported as fallback
    if (replySendBtn) replySendBtn.addEventListener('click', () => {
      agentStream.sendReply(replyInput.value);
    });
    if (replyInput) replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') agentStream.sendReply(replyInput.value);
    });

    // Mic button in reply box — user clicks to speak reply
    if (replyMicBtn) replyMicBtn.addEventListener('click', () => {
      if (recognition || mediaRecorder) return;
      replyMicBtn.classList.remove('auto-listening');
      listenForReply();
    });
  }

  // ─── Auto-listen for conversational reply ─────────────────────────────────
  // Called by agentStream when a question event arrives.

  function listenForReply() {
    const replyInput = document.querySelector('#reply-input');
    const replyBox   = document.querySelector('.reply-row');

    _setAutoListenState(true);

    _startCapture('en-US', (transcript) => {
      _setAutoListenState(false);

      if (!transcript) {
        // Nothing captured — let user type instead
        if (replyInput) replyInput.focus();
        return;
      }

      // Show transcript briefly so user can see what was captured
      if (replyInput) replyInput.value = transcript;

      // Auto-send after 1.5 s — user can edit or cancel in that window
      const sendBtn = document.querySelector('#reply-send-btn');
      let countdown = null;

      const cancelEl = _showAutoSendCountdown(() => {
        clearTimeout(countdown);
      });

      countdown = setTimeout(() => {
        cancelEl.remove();
        agentStream.sendReply(transcript);
      }, 1500);
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  function _startCapture(lang, callback) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      _startWebSpeech(lang, callback);
    } else {
      _startWhisper(callback);
    }
  }

  function _startWebSpeech(lang, callback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SpeechRecognition();
    recognition = r;
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;

    // `done` is local to this closure — prevents double-callback regardless
    // of the order onresult / onerror / onend fire (onend always fires last in Chrome)
    let done = false;
    const once = (fn) => (...args) => { if (done) return; done = true; recognition = null; fn(...args); };

    r.onresult = once((e) => {
      const transcript = e.results[0][0].transcript;
      const confidence = e.results[0][0].confidence;
      console.log('[recorder] transcript:', JSON.stringify(transcript), '| confidence:', confidence.toFixed(3));
      callback(transcript);
    });

    r.onerror = once((err) => {
      console.warn('[recorder] Web Speech error:', err.error);
      if (err.error === 'no-speech') {
        callback('');
      } else {
        _startWhisper(callback);
      }
    });

    // onend fires after onresult/onerror — only reaches callback if neither fired
    r.onend = once(() => callback(''));

    r.start();
  }

  function _startWhisper(callback) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const chunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const transcript = await _transcribeWhisper(blob);
        callback(transcript);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      }, 10000);
    }).catch(() => {
      _showError('Microphone access denied.');
    });
  }

  async function _transcribeWhisper(blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    try {
      const res  = await fetch(`${BASE_URL}/audio/transcribe`, { method: 'POST', body: formData });
      const data = await res.json();
      return data.transcript || '';
    } catch (e) {
      _showError(`Transcription error: ${e.message}`);
      return '';
    }
  }

  function _stopCurrentCapture() {
    if (recognition)    { recognition.stop(); recognition = null; }
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }

  // ─── UI state helpers ─────────────────────────────────────────────────────

  function _setRecordingState(active) {
    const btn = document.querySelector('#record-btn');
    if (!btn) return;
    btn.disabled = active;
    btn.classList.toggle('recording', active);
    const label = btn.querySelector('.record-btn-label');
    if (label) label.textContent = active ? 'Listening…' : 'Start recording';
  }

  function _setAutoListenState(active) {
    const micBtn   = document.querySelector('#reply-mic-btn');
    const replyRow = document.querySelector('.reply-row');
    if (micBtn) micBtn.classList.toggle('auto-listening', active);
    if (replyRow) replyRow.classList.toggle('auto-listening', active);
  }

  // Shows a "Sending in 1s… Cancel" pill — returns the element so caller can remove it
  function _showAutoSendCountdown(onCancel) {
    const replyRow = document.querySelector('.reply-row');
    const el = document.createElement('div');
    el.className = 'auto-send-bar';
    el.innerHTML = `<span>Sending…</span><button class="cancel-send-btn">Cancel</button>`;
    el.querySelector('.cancel-send-btn').addEventListener('click', () => {
      el.remove();
      onCancel();
    });
    replyRow?.parentNode?.insertBefore(el, replyRow.nextSibling) ?? document.querySelector('.question-box')?.appendChild(el);
    return el;
  }

  function _onMainTranscript(transcript) {
    _setRecordingState(false);
    if (!transcript) {
      _showError('No speech detected — try again.');
      return;
    }
    agentStream.start(transcript);
  }

  function _showError(msg) {
    const box  = document.querySelector('#agent-status');
    const text = document.querySelector('#status-text');
    if (box)  { box.classList.remove('hidden'); box.style.color = 'red'; }
    if (text) text.textContent = msg;
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { listenForReply };
})();
