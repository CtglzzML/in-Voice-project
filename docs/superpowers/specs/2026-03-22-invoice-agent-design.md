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
  │     → lance l'agent en background
  │     → retourne session_id
  │
  ├── GET /api/invoice/stream?session_id=xxx  (SSE)
  │     → stream les events : thinking | tool_call | invoice_update | question | done
  │
  └── POST /api/invoice/reply
        → injecte la réponse de l'user dans la session agent en cours
  │
[LangChain Agent]
  ├── Tool: get_user_profile(user_id)
  ├── Tool: search_client(name)
  ├── Tool: create_invoice_draft(session_id)
  ├── Tool: update_invoice_field(field, value)
  └── Tool: ask_user_question(message)
  └── Tool: finalize_invoice(session_id)
  │
[Supabase]
  ├── table: users
  ├── table: clients
  └── table: invoices
```

---

## Schéma Supabase

```sql
-- Profil émetteur
users (
  id          uuid PRIMARY KEY,
  email       text,
  name        text,
  siret       text,
  address     text,
  tva_number  text,
  logo_url    text,
  default_tva numeric
)

-- Carnet de clients
clients (
  id          uuid PRIMARY KEY,
  user_id     uuid REFERENCES users,
  name        text,
  email       text,
  address     text,
  company     text
)

-- Factures
invoices (
  id               uuid PRIMARY KEY,
  user_id          uuid REFERENCES users,
  client_id        uuid REFERENCES clients,
  invoice_number   text,
  status           text,          -- draft | confirmed
  issue_date       date,
  due_date         date,
  lines            jsonb,         -- [{description, qty, unit_price, total}]
  subtotal         numeric,
  tva_rate         numeric,
  tva_amount       numeric,
  total            numeric,
  payment_terms    text,
  session_id       text
)
```

**Règles :**
- `invoice_number` généré automatiquement au format `YYYY-MM-NNN`
- La facture est créée en statut `draft` dès le début de session
- Les champs `null` dans `users` déclenchent une question de l'agent
- `session_id` permet de reprendre un draft si la connexion SSE se coupe

---

## Agent LangChain

### Prompt système

```
Tu es un assistant de facturation. Tu dois créer une facture complète.
Tu as accès à des outils pour construire la facture étape par étape.
Appelle les outils dans l'ordre logique.
Si un champ est manquant, utilise ask_user_question pour poser UNE question à la fois.
Ne finalise la facture que lorsque tous les champs obligatoires sont remplis.
```

### Tools

| Tool | Action | SSE émis |
|------|---------|----------|
| `get_user_profile` | Charge profil émetteur depuis Supabase | `thinking` |
| `search_client` | Cherche client par nom dans Supabase | `thinking` |
| `create_invoice_draft` | Crée la ligne invoice en DB (status=draft) | `invoice_update` |
| `update_invoice_field` | Met à jour un champ de la facture en DB | `invoice_update` |
| `ask_user_question` | Suspend l'agent, envoie question au frontend | `question` |
| `finalize_invoice` | Passe status=confirmed en DB | `done` |

### Flow hybride

1. Premier appel → agent extrait toutes les infos du transcript
2. Pour chaque info manquante → `ask_user_question` suspend l'agent
3. `POST /api/invoice/reply` reprend l'agent avec la réponse
4. Répété jusqu'à facture complète → `finalize_invoice`

---

## Events SSE

```json
{ "type": "thinking",       "message": "Je cherche le client..." }
{ "type": "invoice_update", "field": "client_name", "value": "Marie Dupont" }
{ "type": "invoice_update", "field": "total", "value": 960 }
{ "type": "question",       "message": "Quel taux de TVA appliquer ?", "awaiting": true }
{ "type": "done",           "invoice_id": "uuid" }
{ "type": "error",          "message": "Description de l'erreur" }
```

---

## Gestion des sessions

Chaque `session_id` dispose :
- D'une **file asyncio** (queue) en mémoire reliant le SSE endpoint à l'agent
- D'un **état de conversation** (historique messages LangChain)
- D'un **flag `awaiting_reply`** pour savoir si l'agent est suspendu

Pour une architecture multi-instance (plusieurs workers), remplacer la queue asyncio par **Redis pub/sub**.

---

## Endpoints API

### `POST /api/invoice/start`
```json
// Request
{ "user_id": "uuid", "transcript": "je veux facturer Marie Dupont 800€ pour du dev web" }

// Response
{ "session_id": "uuid" }
```

### `GET /api/invoice/stream?session_id=xxx`
- Content-Type: `text/event-stream`
- Stream d'events SSE jusqu'à `done` ou `error`

### `POST /api/invoice/reply`
```json
{ "session_id": "uuid", "reply": "20" }
```

---

## Stack technique

| Composant | Choix |
|-----------|-------|
| Backend | FastAPI (Python 3.13) |
| Agent | LangChain + `langchain-anthropic` (Claude) |
| DB | Supabase (PostgreSQL) via `supabase-py` |
| Streaming | SSE via `sse-starlette` |
| Sessions | asyncio.Queue en mémoire |

---

## Ce qui n'est PAS dans ce scope

- Génération PDF de la facture (étape suivante)
- Authentification (le `user_id` est passé par le frontend)
- Frontend (équipe externe)
- Envoi de la facture par email
