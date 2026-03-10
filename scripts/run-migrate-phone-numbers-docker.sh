#!/usr/bin/env bash
# Run phone_numbers migration inside the backend container (no python/alembic on host needed).
# Usage: cd /home/ubuntu/resona.ai && bash scripts/run-migrate-phone-numbers-docker.sh

set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_NAME="resonaai"

cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

if [ ! -f backend/.env.production ]; then
  echo "backend/.env.production not found. Run from project root with backend env configured."
  exit 1
fi

echo "=== Running phone_numbers migration (use_for, etc.) in backend container ==="
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --env-file backend/.env.production run --rm backend python scripts/run_migrate_phone_numbers.py

echo "Done. Restart backend if needed: docker compose -f $COMPOSE_FILE -p $PROJECT_NAME restart backend"
