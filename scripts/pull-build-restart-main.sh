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
echo "=== Verify new code on disk ==="
if grep -q '"strict": True' backend/app/routers/voices.py 2>/dev/null; then
  echo "OK: Voice preview strict mode present in backend/app/routers/voices.py"
else
  echo "WARN: Expected 'strict' in voices.py not found (repo may differ from expected)."
fi
if grep -q 'strict: bool = False' scripts/piper_server.py 2>/dev/null; then
  echo "OK: Piper strict param present in scripts/piper_server.py"
else
  echo "WARN: Expected 'strict' in piper_server.py not found."
fi

echo ""
echo "=== Build and restart (deploy-main) ==="
bash scripts/deploy-main.sh

echo ""
echo "=== Post-deploy check ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend|resonaai.*backend' | head -1)
if [ -n "$BACKEND_CONTAINER" ]; then
  echo "Backend container: $BACKEND_CONTAINER"
  if docker exec "$BACKEND_CONTAINER" grep -q '"strict": True' /app/app/routers/voices.py 2>/dev/null; then
    echo "OK: Running backend image has new voice preview code."
  else
    echo "Note: Backend container may not have new code (path or image cache)."
  fi
fi
FRONTEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'frontend|resonaai.*frontend' | head -1)
if [ -n "$FRONTEND_CONTAINER" ]; then
  echo "Frontend container: $FRONTEND_CONTAINER"
fi

echo ""
echo "=== Done. New changes on server: commit $AFTER ==="
