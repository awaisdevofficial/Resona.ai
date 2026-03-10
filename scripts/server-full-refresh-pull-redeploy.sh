#!/usr/bin/env bash
# Run ON the server: wipe project dir, clone fresh from LiveKit-ElevenLabs repo, restore env, build and start all services.
# Can be run via: ssh -i "path/to/key.pem" ubuntu@18.141.140.150 'bash -s' < scripts/server-full-refresh-pull-redeploy.sh

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"
REPO_URL="${REPO_URL:-https://github.com/awaisdevofficial/Livekit-elevanlabs.git}"
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="resonaai"

echo "=== 1. Backup env (if present) ==="
if [ -f "$PROJECT_DIR/backend/.env.production" ]; then
  cp -a "$PROJECT_DIR/backend/.env.production" /tmp/resona.env.production.bak
  echo "Backed up backend/.env.production to /tmp/resona.env.production.bak"
fi
if [ -f "$PROJECT_DIR/frontend/.env.production" ]; then
  cp -a "$PROJECT_DIR/frontend/.env.production" /tmp/resona.frontend.env.production.bak
  echo "Backed up frontend/.env.production to /tmp/resona.frontend.env.production.bak"
fi

echo ""
echo "=== 2. Stop containers and agent ==="
cd "$PROJECT_DIR" 2>/dev/null && docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v 2>/dev/null || true
sudo systemctl stop resona-agent 2>/dev/null || true
echo "Stopped."

echo ""
echo "=== 3. Remove old project directory ==="
cd /home/ubuntu
rm -rf "$PROJECT_DIR"
echo "Removed $PROJECT_DIR"

echo ""
echo "=== 4. Clone fresh from repo ==="
git clone "$REPO_URL" "$PROJECT_DIR"
cd "$PROJECT_DIR"
git log -1 --oneline

echo ""
echo "=== 5. Restore .env.production ==="
if [ -f /tmp/resona.env.production.bak ]; then
  cp -a /tmp/resona.env.production.bak backend/.env.production
  echo "Restored backend/.env.production"
else
  if [ ! -f backend/.env.production ]; then
    cp backend/.env.production.example backend/.env.production 2>/dev/null || true
    echo "Created backend/.env.production from example - EDIT IT with your values before services will work."
  fi
fi
if [ -f /tmp/resona.frontend.env.production.bak ]; then
  cp -a /tmp/resona.frontend.env.production.bak frontend/.env.production
  echo "Restored frontend/.env.production"
fi

echo ""
echo "=== 6. Build and start all services ==="
bash scripts/deploy-main.sh

echo ""
echo "=== 7. Start agent (systemd) if used ==="
if systemctl list-unit-files | grep -q resona-agent; then
  sudo systemctl start resona-agent
  sudo systemctl status resona-agent --no-pager || true
else
  echo "resona-agent systemd unit not found (agent may run in Docker)."
fi

echo ""
echo "=== 8. Status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=== Done. Backend: http://127.0.0.1:8000/health  Frontend: http://127.0.0.1:8080 (or 3000) ==="
