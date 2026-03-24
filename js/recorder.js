// js/recorder.js
// Responsabilité : capture audio (Web Speech API + fallback Whisper)

const recorder = (() => {
  let recognition = null;
  let mediaRecorder = null;
  let isRecordingForReply = false;

  function init() {
    const recordBtn = document.querySelector('#record-btn');
    const replyMicBtn = document.querySelector('#reply-mic-btn');
    const replySendBtn = document.querySelector('#reply-send-btn');
    const replyInput = document.querySelector('#reply-input');

    // Guards : si un ID est manquant dans le HTML, log clair au lieu d'un crash silencieux
    if (!recordBtn) { console.error('recorder.js: #record-btn not found in HTML'); return; }
    if (!replyMicBtn) { console.error('recorder.js: #reply-mic-btn not found'); return; }
    if (!replySendBtn) { console.error('recorder.js: #reply-send-btn not found'); return; }
    if (!replyInput) { console.error('recorder.js: #reply-input not found'); return; }

    recordBtn.addEventListener('click', () => {
      recordBtn.disabled = true;
      recordBtn.textContent = '🎤 Listening...';
      isRecordingForReply = false;
      _startCapture(_onMainTranscript);
    });

    replyMicBtn.addEventListener('click', () => {
      if (mediaRecorder || recognition) return; // déjà en cours
      isRecordingForReply = true;
      replyMicBtn.disabled = true;
      _startCapture((text) => {
        replyInput.value = text;
        replyMicBtn.disabled = false;
      });
    });

    replySendBtn.addEventListener('click', () => {
      agentStream.sendReply(replyInput.value);
    });

    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') agentStream.sendReply(replyInput.value);
    });
  }

  function _startCapture(callback) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      _startWebSpeech(callback);
    } else {
      _startWhisper(callback);
    }
  }

  function _startWebSpeech(callback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      recognition = null;
      callback(transcript);
    };

    recognition.onerror = () => {
      recognition = null;
      // Web Speech a échoué, fallback Whisper
      _startWhisper(callback);
    };

    recognition.start();
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

      // Arrêter après 10 secondes max
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 10000);
    }).catch(err => {
      console.error('Microphone access denied:', err);
      _showError('Microphone access denied.');
    });
  }

  async function _transcribeWhisper(blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    try {
      const res = await fetch(`${BASE_URL}/audio/transcribe`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return data.transcript || '';
    } catch (e) {
      _showError(`Transcription error: ${e.message}`);
      return '';
    }
  }

  function _onMainTranscript(transcript) {
    if (!transcript) {
      _showError('No speech detected. Try again.');
      const btn = document.querySelector('#record-btn');
      btn.disabled = false;
      btn.textContent = '🎤 Start recording';
      return;
    }
    agentStream.start(transcript);
  }

  function _showError(msg) {
    const text = document.querySelector('#status-text');
    const box = document.querySelector('#agent-status');
    if (box) { box.classList.remove('hidden'); box.style.color = 'red'; }
    if (text) text.textContent = msg;
  }

  // Initialiser au chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {};
})();
