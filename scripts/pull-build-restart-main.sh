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
echo "Verification: $CHECKS/4 checks passed"

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
fi
FRONTEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'frontend|resonaai.*frontend' | head -1)
if [ -n "$FRONTEND_CONTAINER" ]; then
  echo "Frontend container: $FRONTEND_CONTAINER"
fi

echo ""
echo "=== Done. New changes on server: commit $AFTER ==="
