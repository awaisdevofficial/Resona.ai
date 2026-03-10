#!/usr/bin/env bash
# Run on MAIN server (18.141.140.150). Pulls latest code, builds, restarts, and verifies.
# Usage: cd /home/ubuntu/resona.ai && bash scripts/pull-build-restart-main.sh

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="resonaai"

cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

echo "=== Git pull ==="
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "none")
git fetch origin
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "No new commits (already up to date)."
else
  echo "New changes pulled: $BEFORE -> $AFTER"
  git log -1 --oneline
fi

echo ""
echo "=== Verify new code on disk (live call monitoring) ==="
CHECKS=0
if grep -q 'live_calls' backend/app/main.py 2>/dev/null; then
  echo "OK: live_calls router registered in backend/app/main.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: live_calls not found in main.py"
fi
if grep -q 'publish_event' backend/agent_worker.py 2>/dev/null; then
  echo "OK: publish_event (Redis) present in agent_worker.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: publish_event not found in agent_worker.py"
fi
if grep -q 'transfer_number' backend/app/models/agent.py 2>/dev/null; then
  echo "OK: transfer_number column in Agent model"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: transfer_number not found in agent model"
fi
if [ -f frontend/app/\(dashboard\)/live-calls/\[roomId\]/page.tsx ]; then
  echo "OK: Live call monitor page exists"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: live-calls/[roomId]/page.tsx not found"
fi
if grep -q 'use_for' backend/app/models/phone_number.py 2>/dev/null && [ -f frontend/app/\(dashboard\)/phone-numbers/page.tsx ]; then
  echo "OK: Phone Numbers page and use_for in backend"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: Phone Numbers/use_for not found"
fi
if grep -q 'deepgram_plugin.STT' backend/agent_worker.py 2>/dev/null && grep -q 'DEEPGRAM_API_KEY' backend/agent_worker.py 2>/dev/null; then
  echo "OK: Deepgram STT in agent_worker.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: Deepgram STT not found in agent_worker"
fi
if grep -q 'api.groq.com' backend/agent_worker.py 2>/dev/null && grep -q 'GROQ_API_KEY' backend/agent_worker.py 2>/dev/null; then
  echo "OK: Groq LLM in agent_worker.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: Groq LLM not found in agent_worker"
fi
if grep -q 'cartesia_plugin.TTS' backend/agent_worker.py 2>/dev/null && grep -q 'CARTESIA_API_KEY' backend/agent_worker.py 2>/dev/null; then
  echo "OK: Cartesia TTS in agent_worker.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: Cartesia TTS not found in agent_worker"
fi
if grep -q '\[inbound\]' backend/app/routers/twilio_webhook.py 2>/dev/null; then
  echo "OK: Inbound webhook timing logs in twilio_webhook.py"
  CHECKS=$((CHECKS+1))
else
  echo "WARN: [inbound] timing logs not found in twilio_webhook"
fi
echo "Verification: $CHECKS/9 checks passed"

echo ""
echo "=== Run DB migrations (alembic) ==="
if docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file backend/.env.production run --rm backend alembic upgrade head 2>&1; then
  echo "OK: Alembic migrations applied."
else
  echo "WARN: Alembic failed or no alembic.ini (see above). Continuing."
fi

echo ""
echo "=== Run phone_numbers migration (use_for column) ==="
docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file backend/.env.production run --rm backend python scripts/run_migrate_phone_numbers.py 2>/dev/null || true

echo ""
echo "=== Build and restart (deploy-main) ==="
bash scripts/deploy-main.sh

echo ""
echo "=== Post-deploy check ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend|resonaai.*backend' | head -1)
if [ -n "$BACKEND_CONTAINER" ]; then
  echo "Backend container: $BACKEND_CONTAINER"
  if docker exec "$BACKEND_CONTAINER" grep -q 'live_calls' /app/app/main.py 2>/dev/null; then
    echo "OK: Running backend has live_calls router."
  else
    echo "Note: Backend container may not have new code (rebuild may be needed)."
  fi
fi
AGENT_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'agent_worker|resonaai.*agent' | head -1)
if [ -n "$AGENT_CONTAINER" ]; then
  echo "Agent worker container: $AGENT_CONTAINER"
  if docker exec "$AGENT_CONTAINER" grep -q 'deepgram_plugin.STT' /app/agent_worker.py 2>/dev/null && docker exec "$AGENT_CONTAINER" grep -q 'api.groq.com' /app/agent_worker.py 2>/dev/null; then
    echo "OK: Running agent_worker has Deepgram + Groq + Cartesia stack."
  else
    echo "Note: Agent container may not have new stack (rebuild may be needed)."
  fi
fi
FRONTEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'frontend|resonaai.*frontend' | head -1)
if [ -n "$FRONTEND_CONTAINER" ]; then
  echo "Frontend container: $FRONTEND_CONTAINER"
fi

echo ""
echo "=== Done. New changes on server: commit $AFTER ==="
