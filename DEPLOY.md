# Resona.ai — Production deployment

Deploy backend, frontend, and agent worker on a server (e.g. Ubuntu with Docker, or systemd for the worker).

## 1. Server assumptions

- Domain: `resonaai.duckdns.org` (or your domain) pointing to the server IP.
- HTTPS: use a reverse proxy (Nginx/Caddy) with SSL (e.g. Let’s Encrypt).
- Backend API: e.g. `https://resonaai.duckdns.org` or `https://resonaai.duckdns.org/api`.
- Frontend: same host or subdomain; often same origin (e.g. `/` = frontend, `/api` = backend) or separate port behind proxy.

## 2. Environment files (production)

### Backend

On the server, create `backend/.env.production` (or set the same vars in systemd/Docker):

```bash
cd /path/to/resona.ai
cp backend/.env.production.example backend/.env.production
# Edit and set:
#   ENV=production
#   DEV_MODE=false
#   API_BASE_URL=https://resonaai.duckdns.org
#   FRONTEND_URL=https://resonaai.duckdns.org
#   PUBLIC_HOST=resonaai.duckdns.org
#   CORS_ORIGINS=https://resonaai.duckdns.org
#   DATABASE_URL, SUPABASE_*, LIVEKIT_*, GROQ_*, KOKORO_*, WHISPER_*, INTERNAL_SECRET, SECRET_KEY
```

Important for production:

- `ENV=production` so the app loads `.env.production` when the file exists.
- `DEV_MODE=false` so auth is required (no dev-user fallback).
- `API_BASE_URL` and `FRONTEND_URL` must be the public HTTPS URLs (no trailing slash).
- `LIVEKIT_API_URL`: if LiveKit runs on the same host as the backend, use `http://127.0.0.1:7880` when the backend runs on the host (e.g. systemd). If the backend runs in Docker on the same host, use `http://host.docker.internal:7880` (Mac/Windows) or the server’s LAN IP (e.g. `http://172.17.0.1:7880` on Linux) so the container can reach LiveKit on the host.

### Frontend

Create `frontend/.env.production` (or pass build args in Docker):

```bash
cp frontend/.env.production.example frontend/.env.production
# Set:
#   NEXT_PUBLIC_API_URL=https://resonaai.duckdns.org
#   NEXT_PUBLIC_LIVEKIT_URL=wss://resonaai.duckdns.org/livekit
#   NEXT_PUBLIC_ORIGINATION_URI=sip:your-key@YOUR_SERVER_IP:5060
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

These are baked into the Next.js build; rebuild the frontend after changing them.

### Agent worker

Use the same env as the backend (e.g. `backend/.env` or `backend/.env.production`), plus ensure:

- `API_BASE_URL`, `INTERNAL_SECRET`, `LIVEKIT_*`, `GROQ_*`, `KOKORO_*`, `WHISPER_*` (and optional `OPENAI_API_KEY` for fallback).

Run the worker with `ENV=production` so it uses production config if you use `.env.production`.

## 3. Deploy with Docker (backend + frontend)

Using Supabase (no local Postgres):

```bash
cd /path/to/resona.ai

# Ensure backend/.env.production exists and has ENV=production, DEV_MODE=false, and all URLs/secrets
# Optional: export frontend build args for docker-compose
export NEXT_PUBLIC_API_URL=https://resonaai.duckdns.org
export NEXT_PUBLIC_LIVEKIT_URL=wss://resonaai.duckdns.org/livekit
export NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
export NEXT_PUBLIC_ORIGINATION_URI=sip:your-key@YOUR_SERVER_IP:5060

docker compose -f docker-compose.prod.yml --env-file backend/.env.production up -d --build
```

- Backend: port 8000  
- Frontend: port 3000  
- Redis: internal (backend uses `REDIS_URL=redis://redis:6379/0`)

Put Nginx (or Caddy) in front:

- `https://resonaai.duckdns.org` → proxy to `http://127.0.0.1:3000` (frontend) and/or  
- `https://resonaai.duckdns.org/api` → proxy to `http://127.0.0.1:8000` (backend), or use a separate API subdomain.

## 4. Agent worker (outside Docker, recommended)

Run the worker on the same host as LiveKit (e.g. systemd), so it can use `LIVEKIT_API_URL=http://127.0.0.1:7880`.

```bash
# Install deps and run once to verify
cd /path/to/resona.ai/backend
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
export ENV=production
# Use the same .env.production as backend (or symlink)
python agent_worker.py start
```

Systemd (Ubuntu): create `/etc/systemd/system/resona-agent.service`:

```ini
[Unit]
Description=Resona voice agent worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/resona.ai/backend
Environment=ENV=production
EnvironmentFile=/path/to/resona.ai/backend/.env.production
ExecStart=/path/to/resona.ai/backend/.venv/bin/python agent_worker.py start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable resona-agent
sudo systemctl start resona-agent
sudo systemctl status resona-agent
```

Only one agent worker process should run per LiveKit server.

## 5. Reverse proxy (Nginx) example

Single host: frontend on `/`, backend on `/api`:

```nginx
server {
    listen 443 ssl http2;
    server_name resonaai.duckdns.org;
    ssl_certificate     /etc/letsencrypt/live/resonaai.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/resonaai.duckdns.org/privkey.pem;

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /livekit {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If you use this, set:

- `API_BASE_URL=https://resonaai.duckdns.org/api`
- `FRONTEND_URL=https://resonaai.duckdns.org`
- `LIVEKIT_URL=wss://resonaai.duckdns.org/livekit`

and in the frontend `.env.production`: `NEXT_PUBLIC_API_URL=https://resonaai.duckdns.org/api`, then rebuild the frontend.

## 6. Checklist

- [ ] `backend/.env.production`: `ENV=production`, `DEV_MODE=false`, correct `API_BASE_URL`, `FRONTEND_URL`, `PUBLIC_HOST`, `CORS_ORIGINS`, and all secrets/API keys.
- [ ] `frontend/.env.production`: all `NEXT_PUBLIC_*` set and frontend rebuilt.
- [ ] Backend and frontend reachable over HTTPS; CORS allows the frontend origin.
- [ ] LiveKit server running; agent worker running once (systemd or manual) with same env as backend.
- [ ] Supabase project and keys correct; auth (sign-up/sign-in) works.
- [ ] Twilio/SIP (if used): `LIVEKIT_SIP_URI` and origination configured; worker and backend use same LiveKit API URL.

## 7. Quick health checks

```bash
# Backend
curl -s https://resonaai.duckdns.org/api/health
# or
curl -s http://127.0.0.1:8000/health

# Frontend (in browser)
# https://resonaai.duckdns.org
```

After deployment, sign up in the app, create an agent, and run a test call to confirm end-to-end.
