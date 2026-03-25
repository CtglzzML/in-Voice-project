# Design : Redesign Interaction IA — in-Voice

Date : 2026-03-25

## Contexte

Le frontend `create_invoice.html` a ses 4 modules JS fonctionnels (`agent-stream.js`, `recorder.js`, `form-updater.js`, `create-invoice.js`) et le flow SSE backend est opérationnel. Ce spec couvre uniquement la couche interaction user/IA — les autres pages et le layout général ne sont pas touchés.

## Décisions de design

| Question | Choix |
|---|---|
| Style d'interaction | Status bar + prompt (compact, informatif) |
| TTS | Automatique — l'IA lit chaque question à voix haute |
| Auto-écoute | Oui — micro s'active 1s après la fin du TTS |
| Colorimétrie | Thème existant conservé intégralement (`#f3f3f3`, `#62588f`, `#de7768`) |
| Approche implémentation | A — modification in-place des modules existants |

## Composants visuels

Les 3 composants vivent dans `.manual-entry-card` (conteneur existant inchangé).

### 1. Status bar (`#agent-status`)

Remplace la div texte simple actuelle. Structure :
```html
<div id="agent-status" class="ai-status hidden">
  <div class="ai-status-dot"></div>
  <span id="status-text"></span>
  <div class="waveform-bars">
    <span></span><span></span><span></span><span></span><span></span>
  </div>
</div>
```

Styles : fond `rgba(98,88,143,0.08)`, border `rgba(98,88,143,0.28)`, border-radius `5px`, dot violet pulsant. Waveform visible uniquement quand `thinking`.

États :
- **thinking** : dot pulse + waveform animée + texte gris
- **waiting** : dot statique + texte "En attente de votre réponse…"
- **done** : fond `#f0fdf4`, dot vert, texte vert
- **error** : texte rouge, pas de waveform

### 2. Missing fields chips (`#missing-fields`)

Nouveau composant, ajouté juste après `#agent-status`. Initialement masqué, apparaît dès le premier `invoice_update`.

```html
<div id="missing-fields" class="missing-fields hidden">
  <span class="field-chip missing" data-field="client_id">· Client</span>
  <span class="field-chip missing" data-field="lines">· Lignes</span>
  <span class="field-chip missing" data-field="tva_rate">· TVA</span>
  <span class="field-chip missing" data-field="due_date">· Échéance</span>
  <span class="field-chip missing" data-field="payment_terms">· Conditions</span>
</div>
```

Styles :
- `.field-chip.missing` : fond `#fffbeb`, border `#fde68a`, texte `#b45309`
- `.field-chip.filled` : fond `#f0fdf4`, border `#86efac`, texte `#16a34a`, préfixe `✓`

Mapping backend → chip : `client_id` → Client, `lines` → Lignes, `tva_rate` → TVA, `due_date` → Échéance, `payment_terms` → Conditions.

### 3. Prompt zone (`#question-box`)

Structure existante conservée, 2 ajouts :
1. `.tts-bars` dans `.agent-badge` (indicateur TTS animé, visible pendant la lecture)
2. Input placeholder change en "Écoute en cours…" pendant auto-listen (remis à "Type your reply…" ensuite)

```html
<!-- dans .agent-badge, après .agent-badge-text -->
<span class="tts-bars hidden">
  <span></span><span></span><span></span>
</span>
```

## Changements JS

### `agent-stream.js`

**Remplacement de `_setStatusBox` / `_showStatus` / `_showError` / `_onDone`**

Les fonctions actuelles utilisent `style.color` et `style.display` inline, et référencent un `.spinner` qui n'existera plus. Ces 4 fonctions sont réécrites pour utiliser exclusivement `classList` :

- Supprimer la variable `_spinner` et toutes ses références
- `_setStatusBox` : retirer `style.color` / `style.display` ; utiliser `classList.remove('hidden')` + toggle des classes `thinking` / `done` / `error` sur `_statusBox`
- `_showStatus(msg)` : ajoute class `thinking`, retire `done` / `error`, active `.ai-status-dot.pulse` et `.waveform-bars`
- `_showError(msg)` : ajoute class `error`, retire `thinking` / `done`, masque waveform — identique pour `recorder.js:246` qui doit aussi utiliser class plutôt que `style.color`
- `_onDone()` : ajoute class `done`, retire `thinking` / `error`

Les CSS des états sont définis dans `create_invoice.css` (section "Done state" + ajout "Error state").

**Nouvelles variables de module** à déclarer explicitement :
```js
let _listenForReplyFn = null;
let _ttsInProgress = false;
```

**1. `registerListenCallback(fn)`** — exposé publiquement. Stocke la référence à `recorder.listenForReply`. Appelé depuis `recorder.js` après init pour éviter la dépendance circulaire.

```js
let _listenForReplyFn = null;
function registerListenCallback(fn) { _listenForReplyFn = fn; }
```

**2. `_playTTS(text)`** — appelle `POST /api/v1/audio/tts`, lit le stream MP3 via `Audio`. Retourne une Promise qui resolve à la fin de la lecture (event `ended`). Affiche `.tts-bars` pendant la lecture, les masque après.

```js
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
```

**3. `_showQuestion(message)` — modifié**

Après affichage de la question :
1. Guard anti-double-TTS : si `_ttsInProgress === true`, skip TTS + auto-listen (cas SSE reconnect replay)
2. Appelle `await _playTTS(message)` (positionne `_ttsInProgress = true` avant, `false` après)
3. Attend 1s (`setTimeout 1000ms`)
4. Appelle `_listenForReplyFn?.()` (auto-écoute micro)
5. Met le placeholder de `#reply-input` à "Écoute en cours…" puis le remet après

`_ttsInProgress` est remis à `false` dans `_hideQuestion()` (appelé sur `reply` envoyé et sur `done`/`error`).

**4. `_handleEvent()` — ajout dans `invoice_update`**

```js
case 'invoice_update':
  formUpdater.update(event.field, event.value);
  _markFieldFilled(event.field);  // nouveau
  break;
```

**5. `_markFieldFilled(field)`**

```js
const MANDATORY_FIELDS = ['client_id', 'lines', 'tva_rate', 'due_date', 'payment_terms'];
function _markFieldFilled(field) {
  if (!MANDATORY_FIELDS.includes(field)) return;
  const chip = document.querySelector(`#missing-fields .field-chip[data-field="${field}"]`);
  if (!chip) return;
  if (chip.classList.contains('filled')) return;  // guard: agent may update same field multiple times
  const missingFields = document.querySelector('#missing-fields');
  if (missingFields) missingFields.classList.remove('hidden');
  chip.classList.remove('missing');
  chip.classList.add('filled');
  chip.textContent = `✓ ${chip.textContent.replace('· ', '')}`;
}
```

### `recorder.js`

Ajout après `init()` :
```js
agentStream.registerListenCallback(() => recorder.listenForReply());
```

Exposer `recorder` depuis le module : ajouter `listenForReply` dans le return (déjà présent).

## Changements HTML

**`pages/create_invoice.html`** — uniquement dans `.manual-entry-card` :

1. `#agent-status` : remplacer le contenu interne (dot + status-text + waveform-bars)
2. Ajouter `#missing-fields` avec les 5 chips juste après `#agent-status` — **à l'intérieur de `.manual-entry-card`**, pas directement dans `.voice-zone`, pour éviter les règles CSS génériques `.voice-zone > div`
3. Dans `#question-box > .agent-bubble > .agent-badge` : ajouter `.tts-bars`

## Changements CSS

**`css/create_invoice.css`** — ajouts en fin de fichier uniquement :

```css
/* AI Status bar */
.ai-status { display:flex; align-items:center; gap:10px; background:rgba(98,88,143,0.08); border:1px solid rgba(98,88,143,0.28); border-radius:5px; padding:10px 14px; }
.ai-status.hidden { display:none; }
.ai-status-dot { width:8px; height:8px; border-radius:50%; background:#62588f; box-shadow:0 0 8px rgba(98,88,143,0.45); flex-shrink:0; }
.ai-status-dot.pulse { animation:dot-pulse 1.4s ease-in-out infinite; }
@keyframes dot-pulse { 0%,100%{box-shadow:0 0 4px rgba(98,88,143,0.3)} 50%{box-shadow:0 0 12px rgba(98,88,143,0.7)} }

/* Waveform bars */
.waveform-bars { display:flex; gap:3px; align-items:center; }
.waveform-bars span { display:inline-block; width:3px; border-radius:2px; background:#62588f; }
.waveform-bars span:nth-child(1) { height:10px; opacity:0.4; animation:wave 1s ease-in-out infinite 0s; }
.waveform-bars span:nth-child(2) { height:16px; opacity:0.7; animation:wave 1s ease-in-out infinite 0.15s; }
.waveform-bars span:nth-child(3) { height:8px;  opacity:0.5; animation:wave 1s ease-in-out infinite 0.3s; }
.waveform-bars span:nth-child(4) { height:13px; opacity:0.8; animation:wave 1s ease-in-out infinite 0.45s; }
.waveform-bars span:nth-child(5) { height:6px;  opacity:0.3; animation:wave 1s ease-in-out infinite 0.6s; }
@keyframes wave { 0%,100%{transform:scaleY(0.6)} 50%{transform:scaleY(1.3)} }

/* Missing fields chips */
.missing-fields { display:flex; gap:6px; flex-wrap:wrap; }
.missing-fields.hidden { display:none; }
.field-chip { font-size:0.78rem; font-weight:600; padding:3px 10px; border-radius:20px; border:1px solid; }
.field-chip.missing { background:#fffbeb; border-color:#fde68a; color:#b45309; }
.field-chip.filled  { background:#f0fdf4; border-color:#86efac; color:#16a34a; }

/* TTS bars (in agent-badge) */
.tts-bars { display:flex; gap:2px; align-items:center; margin-left:4px; }
.tts-bars.hidden { display:none; }
.tts-bars span { display:inline-block; width:2px; border-radius:1px; background:#62588f; }
.tts-bars span:nth-child(1) { height:8px;  opacity:0.5; animation:wave 0.8s ease-in-out infinite 0s; }
.tts-bars span:nth-child(2) { height:12px; opacity:0.9; animation:wave 0.8s ease-in-out infinite 0.2s; }
.tts-bars span:nth-child(3) { height:6px;  opacity:0.4; animation:wave 0.8s ease-in-out infinite 0.4s; }

/* Done state */
.ai-status.done { background:#f0fdf4; border-color:#86efac; }
.ai-status.done .ai-status-dot { background:#16a34a; box-shadow:0 0 8px rgba(22,163,74,0.45); }
.ai-status.done #status-text { color:#15803d; }

/* Error state */
.ai-status.error { background:#fff1f2; border-color:#fecdd3; }
.ai-status.error .ai-status-dot { background:#dc2626; box-shadow:0 0 8px rgba(220,38,38,0.45); }
.ai-status.error #status-text { color:#dc2626; }
.ai-status.thinking .waveform-bars { display:flex; }
.ai-status:not(.thinking) .waveform-bars { display:none; }
```

## Gestion d'erreurs

| Cas | Comportement |
|---|---|
| TTS fetch échoue | Log console, auto-listen quand même (fallback silencieux) |
| TTS audio ne joue pas | `onerror` → resolve Promise → auto-listen quand même |
| `_listenForReplyFn` non enregistré | `?.()` → no-op silencieux |
| Chip field inconnu | `querySelector` retourne null → no-op |

## Fichiers modifiés

| Fichier | Type |
|---|---|
| `pages/create_invoice.html` | Modification partielle (voice zone uniquement) |
| `src/frontend/agent-stream.js` | Modification (4 ajouts) |
| `src/frontend/recorder.js` | Modification (1 ajout) |
| `css/create_invoice.css` | Ajout en fin de fichier |

Aucun autre fichier touché.
