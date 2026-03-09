#!/usr/bin/env bash
# Production deploy: build and run backend + frontend via Docker.
# Usage: from repo root, ./scripts/deploy-prod.sh
# Ensure backend/.env.production exists with ENV=production, DEV_MODE=false, and all vars.

set -e
cd "$(dirname "$0")/.."

if [[ ! -f backend/.env.production ]]; then
  echo "Create backend/.env.production (copy from backend/.env.production.example and set values)."
  exit 1
fi

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://resonaai.duckdns.org}"
export NEXT_PUBLIC_LIVEKIT_URL="${NEXT_PUBLIC_LIVEKIT_URL:-wss://resonaai.duckdns.org/livekit}"
# Load frontend vars from frontend/.env.production if present
if [[ -f frontend/.env.production ]]; then
  set -a
  source frontend/.env.production
  set +a
fi

docker compose -f docker-compose.prod.yml up -d --build
echo "Backend: port 8000, Frontend: port 3000. Put Nginx/Caddy in front for HTTPS."
