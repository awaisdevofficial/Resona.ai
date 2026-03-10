# Environment and API Keys

## Where values come from

- **`frontend/.env`** (local) / **`frontend/.env.production`** (server): `NEXT_PUBLIC_*` for API URL, LiveKit, Supabase (auth). Production frontend also gets Supabase at **runtime** from backend `GET /config/public` (so backend env is the source of truth for sign-in).
- **`backend/.env`** (local) / **`backend/.env.production`** (server): Database, LiveKit, Supabase URL + **SUPABASE_ANON_KEY** (for `/config/public`), API_BASE_URL, etc. **ElevenLabs and OpenAI keys are not required here** — they are stored in **Supabase** and loaded at runtime.

## ElevenLabs and OpenAI: stored in Supabase

- Keys are stored in the **`api-keys`** table in your Supabase (Postgres) database.
- The backend loads them at startup via `system_settings.load_cache_from_db()` and the agent worker via `run_load_system_settings_into_env()`.
- Set them in the app **Settings** (UI) or by inserting into `api-keys` (columns `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`). No need to put these in `backend/.env` unless you want a fallback.

## Syncing local .env to server

For production, ensure `backend/.env.production` on the server has at least:

- `SUPABASE_URL` (same as local backend)
- `SUPABASE_ANON_KEY` (same as local frontend `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`, `LIVEKIT_*`, `API_BASE_URL`, `FRONTEND_URL`, etc.

Copy from your local `backend/.env` / `frontend/.env` as reference; never commit real secrets to the repo.
