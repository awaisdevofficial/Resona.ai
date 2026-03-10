#!/usr/bin/env bash
# Run ON the server: pull latest, rebuild/restart, verify live-calls changes.
# Usage: ssh ubuntu@YOUR_SERVER 'bash -s' < scripts/server-pull-restart-check.sh
#    or: ssh -i key.pem ubuntu@18.141.140.150 'cd /home/ubuntu/resona.ai && bash scripts/server-pull-restart-check.sh'

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"

cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

echo "=== 1. Git pull ==="
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "none")
git fetch origin
git pull origin main
AFTER=$(git rev-parse HEAD)
echo "Commit: $AFTER"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "New changes pulled: $BEFORE -> $AFTER"
  git log -1 --oneline
fi

echo ""
echo "=== 2. Verify changes on disk ==="
grep -q 'live_calls' backend/app/main.py && echo "OK: live_calls in main.py" || echo "MISS: live_calls in main.py"
grep -q 'publish_event' backend/agent_worker.py && echo "OK: publish_event in agent_worker.py" || echo "MISS: publish_event in agent_worker.py"
grep -q 'transfer_number' backend/app/models/agent.py && echo "OK: transfer_number in Agent model" || echo "MISS: transfer_number in agent model"
[ -f frontend/app/\(dashboard\)/live-calls/\[roomId\]/page.tsx ] && echo "OK: live-calls page exists" || echo "MISS: live-calls page"

echo ""
echo "=== 3. Build and restart (docker-compose) ==="
bash scripts/deploy-main.sh

echo ""
echo "=== 4. Container status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -15

echo ""
echo "=== 5. Quick backend check ==="
BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'backend|resonaai.*backend' | head -1)
if [ -n "$BACKEND_CONTAINER" ]; then
  if docker exec "$BACKEND_CONTAINER" grep -q 'live_calls' /app/app/main.py 2>/dev/null; then
    echo "OK: Backend container has live_calls router."
  else
    echo "WARN: Backend container may not have new code."
  fi
fi

echo ""
echo "=== Done. Changes applied: commit $AFTER ==="
