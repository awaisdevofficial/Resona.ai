#!/usr/bin/env bash
# Run ON the server: set real Supabase keys and rebuild frontend so sign-in works.
# Usage:
#   cd /home/ubuntu/resona.ai
#   # Option A: create frontend/.env.production with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then:
#   bash scripts/server-set-supabase-rebuild.sh
#   # Option B: one-liner (replace with your real values):
#   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... bash scripts/server-set-supabase-rebuild.sh

set -e
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/resona.ai}"
cd "$PROJECT_DIR" || { echo "Project dir not found: $PROJECT_DIR"; exit 1; }

if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  mkdir -p frontend
  cat > frontend/.env.production << EOF
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
EOF
  echo "Written frontend/.env.production with provided Supabase vars."
fi

if [ ! -f frontend/.env.production ] || ! grep -q "NEXT_PUBLIC_SUPABASE_URL=https://.*\.supabase\.co" frontend/.env.production 2>/dev/null; then
  echo "ERROR: Set real Supabase keys first."
  echo "  Create frontend/.env.production with:"
  echo "    NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co"
  echo "    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
  echo "  Or run: NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... bash scripts/server-set-supabase-rebuild.sh"
  exit 1
fi

echo "Rebuilding and restarting frontend (and full stack)..."
bash scripts/deploy-main.sh
echo "Done. Sign-in should now use your Supabase project."
