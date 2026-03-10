#!/usr/bin/env bash
# Run on MAIN server after you have the project in place (e.g. after full-wipe + rsync).
# Usage: cd /home/ubuntu/resona.ai && bash scripts/deploy-main.sh

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="resonaai"

cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

if [ -f /tmp/resona.env.production.bak ] && [ ! -f backend/.env.production ]; then
  cp /tmp/resona.env.production.bak backend/.env.production
  echo "Restored backend/.env.production from backup"
fi

if [ ! -f backend/.env.production ]; then
  echo "ERROR: backend/.env.production not found. Copy from backend/.env.production.example and fill in values."
  exit 1
fi

echo "=== Building and starting ==="
# Fix CRLF in env files so 'source' works (e.g. after copy from Windows)
for f in .env frontend/.env.production backend/.env.production; do [ -f "$f" ] && sed -i 's/\r$//' "$f" 2>/dev/null; done
# Load frontend build vars: .env, then frontend/.env.production, then backend/.env.production (Supabase URL/anon key)
if [ -f .env ]; then set -a; source .env; set +a; fi
if [ -f frontend/.env.production ]; then set -a; source frontend/.env.production; set +a; fi
if [ -f backend/.env.production ]; then set -a; source backend/.env.production; set +a; fi
# Use backend SUPABASE_URL / SUPABASE_ANON_KEY for frontend when NEXT_PUBLIC_* not set (one file for both)
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://resonaai.duckdns.org/api}"
export NEXT_PUBLIC_LIVEKIT_URL="${NEXT_PUBLIC_LIVEKIT_URL:-wss://resonaai.duckdns.org/livekit}"
export NEXT_PUBLIC_ORIGINATION_URI="${NEXT_PUBLIC_ORIGINATION_URI:-sip:resona_key@18.141.140.150:5060}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$SUPABASE_URL}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$SUPABASE_ANON_KEY}"
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "WARNING: Sign-in will fail until real Supabase keys are set."
  echo "  Add SUPABASE_ANON_KEY (anon/public key) to backend/.env.production; SUPABASE_URL is already used for frontend."
fi

# Frontend Dockerfile expects root .env for COPY. Use placeholders when empty so build succeeds; sign-in works only with real Supabase keys.
cat > .env << ENVFILE
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://resonaai.duckdns.org/api}
NEXT_PUBLIC_LIVEKIT_URL=${NEXT_PUBLIC_LIVEKIT_URL:-wss://resonaai.duckdns.org/livekit}
NEXT_PUBLIC_ORIGINATION_URI=${NEXT_PUBLIC_ORIGINATION_URI:-sip:resona_key@18.141.140.150:5060}
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder}
ENVFILE

docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file backend/.env.production up -d --build
echo "=== Done. Check: docker ps ==="
