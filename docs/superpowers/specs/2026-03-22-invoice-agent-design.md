# Invoice AI Agent — Design Spec
*Date: 2026-03-22*

## Contexte

Agent IA de création de factures en temps réel. L'utilisateur dicte sa facture via micro (Web Speech API côté frontend HTML/JS), l'agent LangChain comprend le transcript, charge le contexte depuis Supabase, et construit la facture champ par champ en streamant chaque étape au frontend via SSE.

Le frontend est développé par une équipe externe (HTML/JS). Ce projet couvre uniquement le backend.

---

## Architecture globale

```
[Frontend HTML/JS]
  │  1. Web Speech API → texte transcrit
  │  2. POST /api/invoice/start  (user_id + transcript)
  │  3. GET  /api/invoice/stream (SSE) ← events en live
  │
[FastAPI Backend]
  │
  ├── POST /api/invoice/start
  │     → génère session_id (UUID4 côté backend)
  │     → lance l'agent en background (asyncio task)
  │     → retourne session_id
  │
  ├── GET /api/invoice/stream?session_id=xxx  (SSE)
  │     → stream les events depuis la queue asyncio de la session
  │     → si session en état awaiting_reply : rejoue le dernier event question
  │
  └── POST /api/invoice/reply
        → injecte la réponse dans la reply_queue de la session
        → retourne 200 {} si OK, 404 si session inconnue, 409 si session non en attente
  │
[LangChain Agent]
  ├── Tool: get_user_profile(user_id)
  ├── Tool: search_client(name, user_id)
  ├── Tool: create_invoice_draft(session_id)
  ├── Tool: update_invoice_field(field: InvoiceField, value)
  ├── Tool: ask_user_question(message)
  └── Tool: finalize_invoice(session_id)
  │
[Supabase]
  ├── table: users
  ├── table: clients
  └── table: invoices
```

---

## Champs obligatoires d'une facture (référence légale FR)

Ces champs doivent tous être non-null avant que `finalize_invoice` soit appelé.

| Champ | Source |
|-------|--------|
| `invoice_number` | Généré auto |
| `issue_date` | Défaut = aujourd'hui |
| `due_date` | Demandé si absent (défaut : +30 jours) |
| `payment_terms` | Profil user ou demandé |
| Émetteur : `name`, `address`, `siret` | Profil user |
| Client : `name`, `address` | Table clients ou demandé |
| Au moins une ligne : `description`, `unit_price`, `qty` | Transcript ou demandé |
| `tva_rate` | Profil user (`default_tva`) ou demandé |

Les champs non-obligatoires (`logo_url`, `tva_number`, `client.company`, `client.email`) ne déclenchent pas de question.

---

## Schéma Supabase

```sql
-- Profil émetteur
users (
  id          uuid PRIMARY KEY,
  email       text,
  name        text,          -- obligatoire
  siret       text,          -- obligatoire
  address     text,          -- obligatoire
  tva_number  text,
  logo_url    text,
  default_tva numeric        -- obligatoire (ex: 20.0)
)

-- Carnet de clients
clients (
  id          uuid PRIMARY KEY,
  user_id     uuid REFERENCES users,
  name        text,          -- obligatoire
  email       text,
  address     text,          -- obligatoire
  company     text
)

-- Factures
invoices (
  id               uuid PRIMARY KEY,
  user_id          uuid REFERENCES users,
  client_id        uuid REFERENCES clients,
  invoice_number   text,          -- YYYY-MM-NNN, séquentiel par user par mois
  status           text,          -- draft | confirmed
  issue_date       date,
  due_date         date,
  lines            jsonb,         -- [{description, qty (decimal), unit_price, total (qty*unit_price)}]
  subtotal         numeric,       -- somme des lines[].total, calculé backend
  tva_rate         numeric,
  tva_amount       numeric,       -- subtotal * tva_rate / 100, calculé backend
  total            numeric,       -- subtotal + tva_amount, calculé backend
  payment_terms    text,
  session_id       text
)
```

**Règles :**
- `invoice_number` : format `YYYY-MM-NNN`, compteur séquentiel **par user par mois**, stocké dans une colonne `invoice_counter` sur `users` (ou via `SELECT COUNT` des factures confirmées du mois). Les drafts abandonnés ne consomment pas de numéro — le numéro est assigné uniquement à la `finalize_invoice`.
- `lines.total` est toujours calculé par le backend (`qty * unit_price`), jamais par l'agent.
- `subtotal`, `tva_amount`, `total` sont recalculés à chaque appel de `update_invoice_field` sur un champ financier.
- `qty` accepte les décimaux (ex: 1.5 heures).

---

## Agent LangChain

### Modèle

`claude-sonnet-4-6` via `langchain-anthropic`. Bon équilibre fiabilité tool-calling / latence / coût.

### Injection du contexte de session

Le `session_id` et `user_id` sont injectés dans le **system prompt** au démarrage de l'agent :

```python
system_prompt = f"""
Tu es un assistant de facturation. Session: {session_id}. User: {user_id}.
Tu dois créer une facture complète en appelant les outils dans l'ordre logique.
Champs obligatoires : {MANDATORY_FIELDS}.
Si un champ obligatoire manque, utilise ask_user_question pour poser UNE seule question.
Ne finalise la facture que lorsque tous les champs obligatoires sont remplis.
"""
```

### Mécanisme suspend/resume (ask_user_question)

Le pattern asyncio utilisé :

```python
# Chaque session a deux queues en mémoire
sessions[session_id] = {
    "sse_queue": asyncio.Queue(),    # backend → frontend (SSE events)
    "reply_queue": asyncio.Queue(),  # frontend → backend (réponses user)
    "awaiting_reply": False,
    "last_question": None,
}

# Dans le tool ask_user_question :
async def ask_user_question(message: str, session_id: str) -> str:
    session = sessions[session_id]
    session["awaiting_reply"] = True
    session["last_question"] = message
    await session["sse_queue"].put({"type": "question", "message": message, "awaiting": True})
    # L'agent se bloque ici jusqu'à ce que POST /api/invoice/reply mette une valeur
    reply = await session["reply_queue"].get()
    session["awaiting_reply"] = False
    return reply  # la réponse est retournée au LLM comme résultat du tool

# Dans POST /api/invoice/reply :
async def reply(session_id: str, reply: str):
    session = sessions.get(session_id)
    if not session: raise HTTPException(404)
    if not session["awaiting_reply"]: raise HTTPException(409)
    await session["reply_queue"].put(reply)
    return {}
```

### Tools — signatures et chemins d'erreur

| Tool | Signature Pydantic | Succès | Échec |
|------|--------------------|--------|-------|
| `get_user_profile` | `(user_id: str)` | Retourne le profil, émet `thinking` avant | Si null → retourne les champs manquants, l'agent demandera |
| `search_client` | `(name: str, user_id: str)` | Retourne le client trouvé | 0 résultat → retourne `null`, l'agent crée un nouveau client et demande les infos manquantes. Plusieurs résultats → retourne la liste, l'agent choisit ou demande confirmation |
| `create_invoice_draft` | `(session_id: str)` | Crée la ligne en DB, retourne `invoice_id` | Erreur DB → émet SSE `error`, lève exception |
| `update_invoice_field` | `(field: InvoiceField, value: Any, invoice_id: str)` | Met à jour en DB, recalcule totaux, émet `invoice_update` | Champ inconnu refusé par le type Pydantic `InvoiceField` (enum) |
| `ask_user_question` | `(message: str, session_id: str)` | Suspend et retourne la réponse user | Timeout 5 min → émet `error` |
| `finalize_invoice` | `(session_id: str, invoice_id: str)` | Valide les champs obligatoires, assigne `invoice_number`, passe à `confirmed` | Champ manquant → retourne l'erreur au LLM, qui doit poser la question manquante |

`InvoiceField` est un enum Python listant tous les champs valides : `client_id`, `due_date`, `payment_terms`, `lines`, `tva_rate`, etc. L'agent ne peut pas halluciner un nom de champ.

### Flow hybride

1. `POST /api/invoice/start` reçoit `user_id` + `transcript`
2. Backend génère `session_id`, crée les queues en mémoire, lance l'agent en tâche asyncio background
3. Frontend ouvre `GET /api/invoice/stream` (SSE)
4. Agent appelle `get_user_profile` → identifie les champs manquants du profil
5. Agent extrait toutes les infos du transcript (client, montant, description)
6. Agent appelle `search_client` → trouvé ou nouveau
7. Agent appelle `create_invoice_draft` → draft créé en DB
8. Agent appelle `update_invoice_field` pour chaque champ extrait → SSE `invoice_update` à chaque fois
9. Pour chaque champ obligatoire manquant → `ask_user_question` → suspend → attend reply → continue
10. Tous les champs remplis → `finalize_invoice` → SSE `done`

---

## Events SSE

```json
{ "type": "thinking",       "message": "Chargement du profil..." }
{ "type": "invoice_update", "field": "client_name", "value": "Marie Dupont" }
{ "type": "invoice_update", "field": "total", "value": 960 }
{ "type": "question",       "message": "Quel taux de TVA appliquer ?", "awaiting": true }
{ "type": "done",           "invoice_id": "uuid" }
{ "type": "error",          "message": "Erreur Supabase : connexion impossible" }
```

- `thinking` : émis avant chaque appel outil, le `message` est hardcodé par outil (pas généré par le LLM)
- `invoice_update` : émis après chaque `update_invoice_field` réussi
- `error` : message technique loggé serveur, message user-friendly envoyé au frontend

### Reconnexion SSE

Si le frontend se reconnecte (`GET /api/invoice/stream`) sur une session existante :
- Session en cours (agent actif) → continue le stream normalement
- Session en `awaiting_reply` → rejoue immédiatement le dernier event `question` (`last_question`)
- Session terminée (`done`) → émet `done` immédiatement avec l'`invoice_id`
- Session inconnue → 404

---

## Endpoints API

### `POST /api/invoice/start`
```json
// Request
{ "user_id": "uuid", "transcript": "je veux facturer Marie Dupont 800€ pour du dev web" }

// Response 200
{ "session_id": "uuid" }
```

### `GET /api/invoice/stream?session_id=xxx`
- Content-Type: `text/event-stream`
- Stream d'events SSE jusqu'à `done` ou `error`
- 404 si `session_id` inconnu

### `POST /api/invoice/reply`
```json
// Request
{ "session_id": "uuid", "reply": "20" }

// Response 200
{}

// Response 404 : session inconnue
// Response 409 : session non en état awaiting_reply
```

---

## Gestion des sessions — cycle de vie

```
start → active → awaiting_reply ↔ active → done
                                          ↓ (cleanup après 5 min)
                     timeout (5 min sans reply) → error → cleanup
```

- Session retirée de la mémoire 5 minutes après `done` ou `error`
- Draft Supabase avec `status=draft` non finalisé reste en DB (pour consultation ultérieure éventuelle)
- Timeout `ask_user_question` : 5 minutes → émet SSE `error`, nettoie la session

**Multi-instance :** remplacer `asyncio.Queue` par Redis pub/sub pour supporter plusieurs workers.

---

## Stack technique

| Composant | Choix |
|-----------|-------|
| Backend | FastAPI (Python 3.13) |
| Agent | LangChain + `langchain-anthropic` |
| Modèle | `claude-sonnet-4-6` |
| DB | Supabase (PostgreSQL) via `supabase-py` |
| Streaming | SSE via `sse-starlette` |
| Sessions | `asyncio.Queue` en mémoire (Redis pour multi-instance) |

---

## Sécurité — note explicite

L'authentification est **hors scope** de ce projet. Le backend fait confiance au `user_id` passé par le frontend. **Le frontend doit authentifier l'utilisateur avant d'appeler ces endpoints.** Sans authentification backend, n'importe quel appelant connaissant un `user_id` peut accéder aux données d'un autre utilisateur. À sécuriser avant mise en production publique.

---

## Ce qui n'est PAS dans ce scope

- Génération PDF de la facture
- Authentification backend (JWT, sessions)
- Frontend (équipe externe)
- Envoi de la facture par email
- Interface multi-instance / Redis (décrit comme upgrade path, non implémenté)
