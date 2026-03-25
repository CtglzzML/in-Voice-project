# Design : Intégration IA Frontend — in-Voice

Date : 2026-03-24

## Contexte

Le backend FastAPI est complet avec 3 endpoints SSE. Le frontend `create_invoice.html` est statique sans JS. Ce spec couvre le JS d'intégration.

## Endpoints réels (préfixe `/api/v1`)

| Action | Endpoint |
|---|---|
| Démarrer l'agent | `POST /api/v1/invoice/start` |
| Stream SSE | `GET /api/v1/invoice/stream?session_id=xxx` |
| Répondre à l'agent | `POST /api/v1/invoice/reply` |
| Transcrire audio | `POST /api/v1/audio/transcribe` (multipart/form-data, champ `audio`) |

## User Flow

1. Utilisateur clique `.record-btn`
2. Web Speech API capte la voix → transcript (fallback : blob audio → `POST /api/v1/audio/transcribe` en multipart, champ `audio`)
3. Transcript + `user_id` envoyés à `POST /api/v1/invoice/start` → `session_id`
4. SSE ouvert sur `GET /api/v1/invoice/stream?session_id=xxx`
5. L'agent remplit le formulaire en temps réel via `invoice_update`
6. Si l'agent a besoin d'info → `question` event → zone de réponse apparaît
7. Utilisateur répond (texte ou micro, pas de réponse vide) → `POST /api/v1/invoice/reply`
8. À `done` → formulaire déverrouillé, éditable manuellement ; `invoice_id` disponible pour redirection future

## Architecture

```
pages/
  create_invoice.html       ← ajouts HTML (status, question-box, imports)
js/
  recorder.js               ← Web Speech API + fallback Whisper
  agent-stream.js           ← SSE + POST /reply
  form-updater.js           ← mise à jour DOM formulaire
```

**Ordre de chargement obligatoire** (dépendances) :
1. `form-updater.js` (aucune dépendance)
2. `agent-stream.js` (dépend de `formUpdater`)
3. `recorder.js` (dépend de `agentStream`)

## Modifications HTML (create_invoice.html)

### 1. Ajouter `id="record-btn"` au bouton existant
```html
<button id="record-btn" class="record-btn">🎤 Start recording</button>
```

### 2. Zone statut agent (panel gauche, sous record-btn)
```html
<div id="agent-status" class="hidden">
  <div class="spinner"></div>
  <span id="status-text">L'agent réfléchit...</span>
</div>
```

### 3. Zone question/réponse (sous agent-status)
```html
<div id="question-box" class="hidden">
  <p id="question-text"></p>
  <input id="reply-input" type="text" placeholder="Votre réponse...">
  <button id="reply-mic-btn">🎤</button>
  <button id="reply-send-btn">Envoyer</button>
</div>
```

### 4. Ajouter `id="item-list"` à la table existante
```html
<table id="item-list" class="item-list">
```

### 5. Ajouter IDs aux totaux (pour mise à jour par form-updater)
```html
<span id="total-subtotal">$0.00</span>
<span id="total-tva">$0.00</span>
<span id="total-final">$0.00</span>
```

### 6. Imports scripts (avant </body>)
```html
<script src="../js/form-updater.js"></script>
<script src="../js/agent-stream.js"></script>
<script src="../js/recorder.js"></script>
```

## Modules JS

### recorder.js
- Clic sur `#record-btn` → démarre Web Speech API (si supporté)
- Fallback si non supporté ou erreur : enregistre blob audio → `POST /api/v1/audio/transcribe` en `FormData` avec champ `audio` → transcript
- Transcript → `agentStream.start(transcript)`
- `#reply-mic-btn` : réutilise le même module pour capter une réponse ; ne s'active que si aucune session d'enregistrement principale n'est en cours

### agent-stream.js
- `start(transcript)` → `POST /api/v1/invoice/start { user_id, transcript }` → `session_id` → ouvre `EventSource`
- `user_id` : lu depuis `window.INVOICE_USER_ID` (variable globale définie dans le HTML ou par la page de login)
- Gestion des events :
  - `thinking` → spinner + texte statut
  - `profile` → `formUpdater.updateProfile(data)` (champs "Your company")
  - `invoice_update` → `formUpdater.update(field, value)`
  - `question` → affiche `#question-box` avec le texte
  - `done` → masque spinner, déverrouille formulaire, stocke `invoice_id`
  - `error` → affiche erreur, ferme SSE proprement
- `sendReply(text)` :
  - Bloque si `text` vide (validation avant envoi)
  - Désactive `#reply-send-btn` immédiatement après clic (évite double-envoi et 409)
  - `POST /api/v1/invoice/reply { session_id, reply }` → masque `#question-box`

### form-updater.js
- `update(field, value)` — mappe les champs `invoice_update` sur le DOM :

| Champ backend (`field`) | Élément HTML |
|---|---|
| `client_name` | `#client-name` |
| `client_id` | (stocké en variable JS, pas affiché) |
| `due_date` | `#inv-due` |
| `payment_terms` | (aucun input prévu — ignoré pour l'instant) |
| `tva_rate` | `#inv-tax` |
| `lines` | génère lignes dans `#item-list` via template `#non-empty-row` |
| `subtotal` | `#total-subtotal` |
| `tva_amount` | `#total-tva` |
| `total` | `#total-final` |
| `status` | (ignoré) |

- `updateProfile(data)` — remplit les champs "Your company" depuis l'event `profile`.
  Le handler SSE reçoit `{"type": "profile", "data": {...}}` — appeler avec `formUpdater.updateProfile(event.data)` :
  - `data.name` → `#company-name`
  - `data.address` → `#company-address`
  - `data.email` → `#company-email`
  - `#company-phone` : non rempli automatiquement (champ absent du modèle `UserProfile`)

- Non-destructif : ne touche que les champs reçus, laisse les autres intacts
- Les champs deviennent éditables manuellement après l'event `done`

## Gestion d'erreurs

| Cas | Comportement |
|---|---|
| Web Speech API non supporté | Fallback Whisper automatique, sans message |
| Erreur réseau sur `/start` | Affiche message erreur, réactive `#record-btn` |
| Event `error` SSE | Affiche message, ferme `EventSource` proprement |
| Réponse vide sur `#reply-send-btn` | Bloque l'envoi, focus sur `#reply-input` |
| Double-clic `#reply-send-btn` (409) | Bouton désactivé après premier clic |
| SSE reconnexion | Backend rejoue le dernier `question` event automatiquement si `awaiting_reply=true` |
