# Backend Auth — Design Spec
*2026-04-09*

## Problem

`POST /api/v1/invoice/start` trusts `user_id` from the request body. Any caller can impersonate any user and access their clients, profile, and invoices.

## Solution

Validate the Supabase JWT on every `/start` call. Extract `user_id` from the verified token server-side. Remove `user_id` from the request body.

## Approach: Supabase Auth API call

The project's current JWT signing key is ECC (P-256) — asymmetric. Rather than managing JWKS cache and key rotation, delegate verification to Supabase via `supabase_client.auth.get_user(token)`. One extra network call per `/start` — acceptable given the low frequency of invoice creation.

## Changes

### Backend

**`src/api/auth.py`** (new file)
- FastAPI dependency `get_current_user(authorization: str = Header(...))`
- Parses `Bearer <token>` from the Authorization header
- Calls `supabase_client.auth.get_user(token)` using the existing Supabase client
- Returns `user_id` (UUID string) on success
- Raises `HTTPException(401)` if header is missing, malformed, or token is invalid/expired

**`src/api/schemas.py`**
- Remove `user_id` from `StartRequest` (only `transcript` remains)

**`src/api/routes/invoice.py`**
- Inject `get_current_user` dependency into `POST /invoice/start`
- Pass the returned `user_id` to `session_store.create()` and `run_agent()`

**`src/config.py`** — no change (Supabase client already initialized with existing env vars)

### Frontend

**`src/frontend/agent-stream.js`**
- In `start(transcript)`: call `_supabase.auth.getSession()` to get `access_token`
- Add `Authorization: Bearer <token>` header to `POST /invoice/start`
- Remove `user_id` from request body

### Env / Config

No new env vars required. The existing `SUPABASE_URL` + `SUPABASE_KEY` are sufficient for `auth.get_user()`.

Add to `.env.example` a comment explaining this is used for both DB and JWT verification.

## Error cases

| Condition | Response |
|---|---|
| No Authorization header | 401 `Missing authorization header` |
| Malformed (not `Bearer ...`) | 401 `Invalid authorization format` |
| Expired or invalid token | 401 `Invalid or expired token` |

## Out of scope

- Auth on `/stream` and `/reply` — these use `session_id` which is already scoped to a user at creation time. Adding auth there requires passing the token on EventSource (not supported natively) — a separate problem.
- Auth on `GET /invoice/{id}` — ownership check requires a DB query. Future work.

## Tests

- `tests/test_routes.py`: add cases for missing header, bad token, valid token on `/start`
- Mock `supabase_client.auth.get_user()` to avoid real network calls in tests
