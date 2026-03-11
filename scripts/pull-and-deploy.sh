#!/usr/bin/env bash
# On the server: pull latest from GitHub and rebuild/restart.
# Usage: cd /home/ubuntu/resona.ai && bash scripts/pull-and-deploy.sh
# Ensure git remote is: origin https://github.com/awaisdevofficial/Resona.ai.git

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"

cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

echo "=== Pulling latest from origin/main ==="
git fetch origin
git checkout main
git pull origin main

echo "=== Deploying (build + restart) ==="
bash scripts/deploy-main.sh

echo "=== Pull and deploy done. Check: docker ps ==="
