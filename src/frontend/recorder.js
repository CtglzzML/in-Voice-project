// src/frontend/recorder.js
import { agentStream, BASE_URL } from './agent-stream.js';

export const recorder = (() => {
  let recognition = null;
  let mediaRecorder = null;

  function init() {
    agentStream.registerListenCallback(() => listenForReply());
    const recordBtn   = document.querySelector('#record-btn');
    const replyInput  = document.querySelector('#reply-input');
    const replySendBtn = document.querySelector('#reply-send-btn');
    const replyMicBtn = document.querySelector('#reply-mic-btn');

    if (!recordBtn) { return; }

    recordBtn.addEventListener('click', () => {
      if (recognition || mediaRecorder) return;
      if (typeof agentStream.isActive === 'function' && agentStream.isActive()) {
        listenForReply();
        return;
      }
      _setRecordingState(true);
      _startCapture('en-US', _onMainTranscript);
    });
    
    const abandonBtn = document.querySelector('#abandon-btn');
    if (abandonBtn) {
        abandonBtn.addEventListener('click', () => {
            if (typeof agentStream.abandonSession === 'function') {
                agentStream.abandonSession();
            }
        });
    }

    if (replySendBtn) replySendBtn.addEventListener('click', () => {
      agentStream.sendReply(replyInput.value);
    });
    if (replyInput) replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') agentStream.sendReply(replyInput.value);
    });

    if (replyMicBtn) replyMicBtn.addEventListener('click', () => {
      if (recognition || mediaRecorder) return;
      replyMicBtn.classList.remove('auto-listening');
      listenForReply();
    });
  }

  function listenForReply() {
    if (recognition || mediaRecorder) return;

    const replyInput = document.querySelector('#reply-input');

    _setAutoListenState(true);
    _setRecordingState(true);

    _startCapture('en-US', (transcript) => {
      _setAutoListenState(false);
      _setRecordingState(false);

      if (!transcript) {
        if (replyInput) replyInput.focus();
        return;
      }

      if (replyInput) replyInput.value = transcript;

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

    let done = false;
    const once = (fn) => (...args) => { if (done) return; done = true; recognition = null; fn(...args); };

    r.onresult = once((e) => {
      const transcript = e.results[0][0].transcript;
      callback(transcript);
    });

    r.onerror = once((err) => {
      console.warn('SpeechRecognition error:', err.error);
      if (err.error === 'not-allowed') {
        _showError('Access to microphone refused.');
        callback('');
      } else {
        _startWhisper(callback);
      }
    });

    r.onend = once(() => {
      console.warn('SpeechRecognition ended with no result. Falling back to Whisper.');
      _startWhisper(callback);
    });
    r.start();
  }

  let vadContext = null;
  let vadAnalyser = null;
  let vadSilenceTimer = null;

  function _startWhisper(callback) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const chunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      
      vadContext = new (window.AudioContext || window.webkitAudioContext)();
      vadAnalyser = vadContext.createAnalyser();
      vadAnalyser.fftSize = 512;
      const src = vadContext.createMediaStreamSource(stream);
      src.connect(vadAnalyser);
      
      let isSpeaking = false;
      let speechStarted = null;
      const monBuf = new Float32Array(vadAnalyser.frequencyBinCount);
      const VAD_THRESHOLD = 0.005; // Lowered tuning threshold
      const MIN_SPEECH_MS = 400;
      const SILENCE_MS = 1500;
      
      let initialSilenceTimer = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      }, 7000); // Wait max 7 seconds before giving up if no sound
      
      function checkLevel() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        
        vadAnalyser.getFloatTimeDomainData(monBuf);
        let sum = 0;
        for (let i = 0; i < monBuf.length; i++) sum += monBuf[i] * monBuf[i];
        const rms = Math.sqrt(sum / monBuf.length);
        
        if (rms > VAD_THRESHOLD) {
          clearTimeout(vadSilenceTimer);
          clearTimeout(initialSilenceTimer);
          vadSilenceTimer = null;
          if (!isSpeaking) {
            isSpeaking = true;
            speechStarted = Date.now();
          }
        } else if (isSpeaking && !vadSilenceTimer) {
          vadSilenceTimer = setTimeout(() => {
            vadSilenceTimer = null;
            const dur = Date.now() - speechStarted;
            if (dur >= MIN_SPEECH_MS) {
              if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            } else {
              isSpeaking = false; 
            }
          }, SILENCE_MS);
        }
        requestAnimationFrame(checkLevel);
      }
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (vadContext) { vadContext.close(); vadContext = null; }
        mediaRecorder = null;
        
        if (chunks.length === 0) { callback(''); return; }
        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        const loader = _showAutoSendCountdown(() => {});
        loader.innerHTML = '<span>Transcription in progress...</span>';
        
        const transcript = await _transcribeWhisper(blob);
        loader.remove();
        callback(transcript);
      };

      mediaRecorder.start(50);
      checkLevel();
      
      // Safety ultimate fallback
      setTimeout(() => {
        if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      }, 15000);
      
    }).catch(() => {
      _showError('Access to microphone refused.');
      callback('');
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

  function _setRecordingState(active) {
    const btn = document.querySelector('#record-btn');
    if (!btn) return;
    btn.disabled = active;
    btn.classList.toggle('recording', active);
    const label = btn.querySelector('.record-btn-label');
    if (label) label.textContent = active ? "I'm listening…" : 'Start recording';
  }

  function _setAutoListenState(active) {
    const micBtn   = document.querySelector('#reply-mic-btn');
    const replyRow = document.querySelector('.reply-row');
    if (micBtn) micBtn.classList.toggle('auto-listening', active);
    if (replyRow) replyRow.classList.toggle('auto-listening', active);
  }

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
      _showError('No voice detected — try again (or write your request down below).');
      return;
    }
    agentStream.start(transcript);
  }

  function _showError(msg) {
    const box  = document.querySelector('#agent-status');
    const text = document.querySelector('#status-text');
    if (box)  { 
      box.classList.remove('hidden', 'thinking', 'done'); 
      box.classList.add('error');
    }
    if (text) text.textContent = msg;
    const dot = document.querySelector('.ai-status-dot');
    if (dot) dot.classList.remove('pulse');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { listenForReply };
})();
