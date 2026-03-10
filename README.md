# LiveKit + ElevenLabs Voice AI

Voice AI platform powered by **LiveKit** (real-time rooms & SIP) and **ElevenLabs** (TTS & STT). Build and run AI voice agents with natural speech, voice cloning, and phone/SIP integration.

## Stack

- **Backend:** FastAPI
- **Frontend:** Next.js
- **Agent runtime:** LiveKit Agents (Python)
- **Voice:** ElevenLabs (TTS + STT; optional voice cloning)
- **Calls:** Twilio (PSTN), LiveKit SIP
- **Auth:** Supabase

## Quick start (local)

1. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   cp .env.example .env    # edit with your keys
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Agent worker** (separate terminal)
   ```bash
   cd backend
   .venv\Scripts\activate
   python agent_worker.py dev
   ```

3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open http://localhost:3000. API docs: http://localhost:8000/docs.

## Environment

- `backend/.env` — API keys (ElevenLabs, OpenAI, etc.), LiveKit, DB, Twilio. Use `backend/.env.production.example` as a template for production.
- ElevenLabs API key can be set in app Settings (stored in DB) or via `ELEVENLABS_API_KEY` in `.env`.

## Features

- **Voice library & cloning** — ElevenLabs voices and custom cloned voices
- **Inbound/outbound calls** — Twilio and LiveKit SIP
- **Knowledge base** — Custom content and URLs for agent context
- **Call transfer** — Configurable transfer number per agent

See `DEPLOY.md` for production deployment.
