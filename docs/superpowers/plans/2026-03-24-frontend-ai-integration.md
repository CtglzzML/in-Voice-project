# Frontend AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecter le formulaire `create_invoice.html` au backend FastAPI IA via 3 modules JS (recorder, agent-stream, form-updater) pour remplir automatiquement la facture par la voix.

**Architecture:** 3 modules JS indépendants avec responsabilités séparées — `recorder.js` gère la capture audio, `agent-stream.js` gère la connexion SSE et les appels API, `form-updater.js` met à jour le DOM. Le HTML est modifié minimalement (ajout d'IDs, 2 nouvelles zones, imports).

**Tech Stack:** Vanilla JS (ES6 modules), Web Speech API, EventSource (SSE), Fetch API, FastAPI backend sur `http://localhost:8000`

**Spec:** `docs/superpowers/specs/2026-03-24-frontend-ai-integration-design.md`

---

## File Map

| Fichier | Action | Responsabilité |
|---|---|---|
| `pages/create_invoice.html` | Modifier | Ajout IDs + zones HTML + imports scripts |
| `js/form-updater.js` | Créer | Mapper les events backend → inputs DOM |
| `js/agent-stream.js` | Créer | SSE + POST /start + POST /reply |
| `js/recorder.js` | Créer | Web Speech API + fallback Whisper |
| `css/create_invoice.css` | Modifier | Styles pour agent-status, question-box, spinner |

---

## Task 1 : Modifications HTML

**Files:**
- Modify: `pages/create_invoice.html`

- [ ] **Step 1 : Ajouter `id="record-btn"` au bouton existant (ligne 29)**

Remplacer :
```html
<button class="record-btn">🎤 Start recording</button>
```
Par :
```html
<button id="record-btn" class="record-btn">🎤 Start recording</button>
```

- [ ] **Step 2 : Ajouter la zone statut agent après le bouton record**

Insérer juste après `<button id="record-btn" ...>` :
```html
<div id="agent-status" class="hidden">
  <div class="spinner"></div>
  <span id="status-text">L'agent réfléchit...</span>
</div>

<div id="question-box" class="hidden">
  <p id="question-text"></p>
  <div class="question-reply">
    <input id="reply-input" type="text" placeholder="Votre réponse...">
    <button id="reply-mic-btn">🎤</button>
    <button id="reply-send-btn">Envoyer</button>
  </div>
</div>
```

- [ ] **Step 3 : Ajouter `id="item-list-body"` au `<tbody>` de la table (ligne 105)**

La table a un `<tbody>` implicite. Rendre le tbody explicite avec un ID :
```html
<table class="item-list">
  <tbody id="item-list-body">
  </tbody>
</table>
```
Note : on cible le `<tbody>` et non le `<table>` pour ne pas écraser les `<thead>` lors des mises à jour.

- [ ] **Step 4 : Ajouter des IDs aux totaux (section `.preview-totals`)**

Remplacer les `<span>` des totaux :
```html
<div class="preview-total-row">
  <span>Subtotal:</span>
  <span id="total-subtotal">$0.00</span>
</div>
<div class="preview-total-row">
  <span id="total-tva-label">Tax (0%):</span>
  <span id="total-tva">$0.00</span>
</div>
<div class="preview-total-divider"></div>
<div class="preview-total-row preview-total-final">
  <span>TOTAL:</span>
  <span id="total-final">$0.00</span>
</div>
```

- [ ] **Step 5 : Ajouter `window.INVOICE_USER_ID` et les imports scripts avant `</body>`**

```html
<script>
  window.INVOICE_USER_ID = "test-user-1"; // TODO: remplacer par l'ID de session réel
</script>
<script src="../js/form-updater.js"></script>
<script src="../js/agent-stream.js"></script>
<script src="../js/recorder.js"></script>
```

- [ ] **Step 6 : Vérifier visuellement dans le navigateur**

Ouvrir `pages/create_invoice.html` directement dans le navigateur.
Vérifier que la page s'affiche sans erreur et que le bouton record est visible.

- [ ] **Step 7 : Commit**

```bash
git add pages/create_invoice.html
git commit -m "feat: add IDs and AI integration zones to create_invoice.html"
```

---

## Task 2 : CSS pour les nouvelles zones

**Files:**
- Modify: `css/create_invoice.css`

- [ ] **Step 1 : Ajouter les styles**

Ajouter à la fin de `css/create_invoice.css` :
```css
/* AI Agent zones */
.hidden {
  display: none;
}

#agent-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  color: #62588f;
  font-size: 0.9rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #62588f;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

#question-box {
  background: #f0eeff;
  border-left: 3px solid #62588f;
  border-radius: 4px;
  padding: 12px;
  margin-top: 10px;
}

#question-text {
  margin: 0 0 10px;
  font-size: 0.95rem;
  color: #333;
}

.question-reply {
  display: flex;
  gap: 8px;
  align-items: center;
}

#reply-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
}

#reply-mic-btn,
#reply-send-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #62588f;
  color: white;
  font-size: 0.85rem;
}

#reply-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2 : Vérifier visuellement**

Ouvrir `pages/create_invoice.html` dans le navigateur.
Retirer temporairement la classe `hidden` de `#agent-status` et `#question-box` dans le HTML pour vérifier le rendu, puis remettre.

- [ ] **Step 3 : Commit**

```bash
git add css/create_invoice.css
git commit -m "feat: add CSS for AI agent status and question zones"
```

---

## Task 3 : form-updater.js

**Files:**
- Create: `js/form-updater.js`

- [ ] **Step 1 : Créer le dossier et le fichier**

```bash
mkdir -p js
```

- [ ] **Step 2 : Écrire form-updater.js**

```javascript
// js/form-updater.js
// Responsabilité : mapper les events invoice_update et profile du backend sur les inputs DOM

const formUpdater = (() => {
  function update(field, value) {
    switch (field) {
      case 'client_name':
        _setInput('#client-name', value);
        _setPreview('.bill-box p', value);
        break;
      case 'due_date':
        _setInput('#inv-due', value);
        break;
      case 'tva_rate':
        _setInput('#inv-tax', value);
        document.querySelector('#total-tva-label').textContent = `Tax (${value}%):`;
        break;
      case 'lines':
        _renderLines(value);
        break;
      case 'subtotal':
        _setText('#total-subtotal', `$${parseFloat(value).toFixed(2)}`);
        break;
      case 'tva_amount':
        _setText('#total-tva', `$${parseFloat(value).toFixed(2)}`);
        break;
      case 'total':
        _setText('#total-final', `$${parseFloat(value).toFixed(2)}`);
        break;
      // client_id et status ignorés (pas d'input dédié)
    }
  }

  function updateProfile(data) {
    _setInput('#company-name', data.name);
    _setInput('#company-address', data.address);
    _setInput('#company-email', data.email);
    _setPreview('.preview-company', data.name);
  }

  function unlockForm() {
    document.querySelectorAll('#inv-number, #inv-date, #inv-due, #inv-tax').forEach(el => {
      el.disabled = false;
    });
    document.querySelectorAll('#company-name, #company-address, #company-phone, #company-email').forEach(el => {
      el.disabled = false;
    });
    document.querySelectorAll('#client-name, #client-address, #client-phone, #client-email').forEach(el => {
      el.disabled = false;
    });
  }

  function _setInput(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.value = value;
  }

  function _setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  }

  function _setPreview(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  }

  function _renderLines(lines) {
    // Cibler le tbody, pas la table (pour ne pas écraser les headers)
    const tbody = document.querySelector('#item-list-body');
    const template = document.querySelector('#non-empty-row');
    if (!tbody || !template) return;

    tbody.innerHTML = '';

    if (!lines || lines.length === 0) {
      const empty = document.querySelector('#empty-row');
      if (empty) tbody.appendChild(empty.content.cloneNode(true));
      return;
    }

    // Note: InvoiceLine backend utilise `qty` (pas `quantity`)
    lines.forEach(line => {
      const row = template.content.cloneNode(true);
      row.querySelector('.item-desc').value = line.description || '';
      row.querySelector('.item-qty').value = line.qty || 1;
      row.querySelector('.item-rate').value = line.unit_price || 0;
      const total = (line.qty || 1) * (line.unit_price || 0);
      row.querySelector('.item-total').textContent = `$${total.toFixed(2)}`;
      tbody.appendChild(row);
    });
  }

  return { update, updateProfile, unlockForm };
})();
```

- [ ] **Step 3 : Tester manuellement dans la console du navigateur**

Ouvrir `pages/create_invoice.html` dans le navigateur (avec le serveur FastAPI tournant ou en ouvrant le fichier directement).
Dans la console DevTools, coller :
```javascript
formUpdater.update('client_name', 'Acme Corp');
formUpdater.update('tva_rate', 20);
formUpdater.update('lines', [{description: 'Dev', quantity: 2, unit_price: 500}]);
formUpdater.update('subtotal', 1000);
formUpdater.update('total', 1200);
formUpdater.updateProfile({name: 'Ma Société', address: '1 rue Test', email: 'test@test.com'});
```
Vérifier que les champs se remplissent correctement.

- [ ] **Step 4 : Commit**

```bash
git add js/form-updater.js
git commit -m "feat: add form-updater.js — maps invoice_update events to DOM inputs"
```

---

## Task 4 : agent-stream.js

**Files:**
- Create: `js/agent-stream.js`

- [ ] **Step 1 : Écrire agent-stream.js**

```javascript
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
```

- [ ] **Step 2 : Vérifier dans la console**

Avec le serveur FastAPI tournant (`uvicorn main:app --reload`), ouvrir `pages/create_invoice.html` via un serveur local (ex: Live Server dans VS Code, ou `python -m http.server 3000` depuis la racine du projet).

Dans la console DevTools :
```javascript
agentStream.start("Facture pour Acme Corp, 2 jours de développement à 500€, TVA 20%");
```
Vérifier dans l'onglet Network que la requête POST `/api/v1/invoice/start` part et que le stream SSE s'ouvre.

- [ ] **Step 3 : Commit**

```bash
git add js/agent-stream.js
git commit -m "feat: add agent-stream.js — SSE client + invoice start/reply"
```

---

## Task 5 : recorder.js

**Files:**
- Create: `js/recorder.js`

- [ ] **Step 1 : Écrire recorder.js**

```javascript
// js/recorder.js
// Responsabilité : capture audio (Web Speech API + fallback Whisper)

const BASE_URL = 'http://localhost:8000/api/v1';

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
    if (!recordBtn) { console.error('recorder.js: #record-btn introuvable dans le HTML'); return; }
    if (!replyMicBtn) { console.error('recorder.js: #reply-mic-btn introuvable'); return; }
    if (!replySendBtn) { console.error('recorder.js: #reply-send-btn introuvable'); return; }
    if (!replyInput) { console.error('recorder.js: #reply-input introuvable'); return; }

    recordBtn.addEventListener('click', () => {
      recordBtn.disabled = true;
      recordBtn.textContent = '🎤 Écoute...';
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
      console.error('Accès micro refusé:', err);
      _showError('Accès au microphone refusé.');
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
      _showError(`Erreur transcription : ${e.message}`);
      return '';
    }
  }

  function _onMainTranscript(transcript) {
    if (!transcript) {
      _showError('Aucun texte capté. Réessayez.');
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
```

- [ ] **Step 2 : Test complet end-to-end**

1. Démarrer le backend : `uvicorn main:app --reload`
2. Servir le frontend : depuis la racine du projet, `python -m http.server 3000`
3. Ouvrir `http://localhost:3000/pages/create_invoice.html`
4. Cliquer "Start recording", parler (ex: "Facture pour Acme, 3 jours de dev à 400 euros, TVA 20%")
5. Vérifier :
   - Spinner visible
   - Les champs du formulaire se remplissent au fur et à mesure
   - Si l'agent pose une question, la `question-box` apparaît
   - Répondre par texte ou micro → l'agent continue
   - À la fin, message "Facture créée !" et champs éditables

- [ ] **Step 3 : Commit final**

```bash
git add js/recorder.js
git commit -m "feat: add recorder.js — Web Speech API + Whisper fallback"
```

---

## Task 6 : Push sur ai-backend-eliott

> ⚠️ Nécessite que CtglzzML t'ait ajouté comme collaborateur avec accès en écriture.

- [ ] **Step 1 : Vérifier que tout est commité**

```bash
git status
```
Doit afficher "nothing to commit, working tree clean".

- [ ] **Step 2 : Push**

```bash
git push origin feature/api-v1-sdk:ai-backend-eliott
```

---

## Résumé des fichiers créés/modifiés

| Fichier | Changement |
|---|---|
| `pages/create_invoice.html` | IDs, zones agent-status + question-box, imports |
| `css/create_invoice.css` | Styles spinner, question-box, hidden |
| `js/form-updater.js` | Nouveau — mapping events → DOM |
| `js/agent-stream.js` | Nouveau — SSE client |
| `js/recorder.js` | Nouveau — capture audio |
