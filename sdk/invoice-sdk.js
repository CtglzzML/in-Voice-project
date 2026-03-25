/**
 * InvoiceAgent — Vanilla JS SDK for Invoice AI Agent API
 *
 * Usage:
 *   const agent = new InvoiceAgent({ baseUrl, userId, onQuestion, onUpdate, onDone, onError });
 *   await agent.start(transcript);           // from text
 *   await agent.startFromAudio(audioBlob);   // from audio (SDK transcribes)
 *   agent.stop();                            // cancel active session
 *
 * No dependencies. Works as <script src="sdk/invoice-sdk.js">.
 */
class InvoiceAgent {
  /**
   * @param {object} options
   * @param {string} options.baseUrl        - Backend base URL (no trailing slash)
   * @param {string} options.userId         - User UUID
   * @param {function} options.onQuestion   - async (question: string) => Promise<string>
   * @param {function} options.onUpdate     - (field: string, value: any) => void
   * @param {function} options.onDone       - (invoiceId: string) => void
   * @param {function} options.onError      - (message: string) => void
   * @param {function} [options.onThinking] - optional (message: string) => void
   */
  constructor({ baseUrl, userId, onQuestion, onUpdate, onDone, onError, onThinking }) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._userId = userId;
    this._onQuestion = onQuestion;
    this._onUpdate = onUpdate;
    this._onDone = onDone;
    this._onError = onError;
    this._onThinking = onThinking || null;

    this._sessionId = null;
    this._eventSource = null;
    this._awaitingReply = false;
  }

  /**
   * Cancel the active session and close the SSE stream.
   * Safe to call with no active session.
   */
  stop() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
    this._sessionId = null;
    this._awaitingReply = false;
  }

  /**
   * Start an invoice session from a text transcript.
   * Calls stop() first if a session is already active.
   * @param {string} transcript
   */
  async start(transcript) {
    this.stop();

    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/invoice/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: this._userId, transcript }),
      });
    } catch (err) {
      this._onError(`Network error starting session: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Failed to start session: HTTP ${resp.status}`);
      return;
    }

    const { session_id } = await resp.json();
    this._sessionId = session_id;
    this._listenToStream();
  }

  /**
   * Transcribe an audio Blob, then start a session with the transcript.
   * Calls onError if transcription fails (does not call start).
   * @param {Blob} audioBlob
   * @param {string} [language='fr']  - BCP-47 language code for Whisper
   */
  async startFromAudio(audioBlob, language = 'fr') {
    const form = new FormData();
    form.append('audio', audioBlob, audioBlob.name || 'audio.webm');

    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/audio/transcribe?language=${language}`, {
        method: 'POST',
        body: form,
      });
    } catch (err) {
      this._onError(`Network error during transcription: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Transcription failed: HTTP ${resp.status}`);
      return;
    }

    const { transcript } = await resp.json();
    await this.start(transcript);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _listenToStream() {
    const url = `${this._baseUrl}/api/v1/invoice/stream?session_id=${this._sessionId}`;
    this._eventSource = new EventSource(url);

    this._eventSource.onmessage = async (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return; // malformed event — ignore
      }
      await this._handleEvent(event);
    };

    this._eventSource.onerror = () => {
      // Browser EventSource auto-reconnects on transient errors.
      // On permanent failures (4xx, server closed), readyState becomes CLOSED.
      if (this._eventSource && this._eventSource.readyState === EventSource.CLOSED) {
        this._closeStream();
        this._onError('SSE connection closed unexpectedly');
      }
      // _awaitingReply flag suppresses duplicate `question` events on reconnect.
    };
  }

  async _handleEvent(event) {
    switch (event.type) {
      case 'thinking':
        if (this._onThinking) this._onThinking(event.message);
        break;

      case 'profile':
        // UI hint only — ignored by SDK
        break;

      case 'invoice_update':
        // May fire in bursts (e.g. lines + subtotal + tva_amount + total)
        this._onUpdate(event.field, event.value);
        break;

      case 'question':
        // Suppress duplicate delivery on SSE reconnect
        if (this._awaitingReply) break;
        this._awaitingReply = true;
        {
          // Capture sessionId before await — stop() may clear it during onQuestion
          const sessionId = this._sessionId;
          try {
            const reply = await this._onQuestion(event.message);
            this._awaitingReply = false;
            // Only post if the session wasn't replaced or cancelled during the await
            if (sessionId && this._sessionId === sessionId) {
              await this._postReply(reply, sessionId);
            }
          } catch (err) {
            this._awaitingReply = false;
            this._onError(`onQuestion handler threw: ${err.message}`);
          }
        }
        break;

      case 'done':
        this._closeStream();
        this._onDone(event.invoice_id);
        break;

      case 'error':
        this._closeStream();
        this._onError(event.message);
        break;

      case 'ping':
        // Keepalive — ignore
        break;
    }
  }

  async _postReply(reply, sessionId) {
    let resp;
    try {
      resp = await fetch(`${this._baseUrl}/api/v1/invoice/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, reply }),
      });
    } catch (err) {
      this._onError(`Network error sending reply: ${err.message}`);
      return;
    }

    if (!resp.ok) {
      this._onError(`Reply failed: HTTP ${resp.status}`);
    }
  }

  _closeStream() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }
}
