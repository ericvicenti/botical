#!/bin/bash
# Stage a production deploy WITHOUT restarting prod.
# Leopard should use this instead of deploy-prod.sh.
# The actual restart is handled by Ion or deploy-prod-apply.sh.
set -euo pipefail

PROD_DIR="$HOME/botical-prod"
DEV_DIR="$HOME/botical"
MARKER="$HOME/.botical-prod/.deploy-ready"

echo "🐆 Staging production deploy (NO restart)..."

# 1. Ensure dev repo is clean
cd "$DEV_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Dev repo has uncommitted changes. Commit first!"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ Not on main branch (on $CURRENT_BRANCH). Switch to main first."
  exit 1
fi

# 2. Push to GitHub
echo "📤 Pushing to GitHub..."
git push ion-kitty main 2>&1 || git push origin main 2>&1

# 3. Pull into prod repo
echo "📥 Pulling into prod..."
cd "$PROD_DIR"
git fetch origin
git reset --hard origin/main

# 4. Install deps & build
echo "📦 Installing dependencies..."
bun install
cd webui && npm install --silent && npx vite build
cd ..

# 5. Write deploy marker (NOT restarting!)
DEV_HEAD=$(cd "$DEV_DIR" && git rev-parse --short HEAD)
echo "{\"staged_at\":\"$(date -Iseconds)\",\"commit\":\"$DEV_HEAD\",\"staged_by\":\"leopard\"}" > "$MARKER"

echo ""
echo "✅ Production deploy STAGED (commit: $DEV_HEAD)"
echo "   Marker written: $MARKER"
echo "   ⏳ Waiting for sentinel to apply the restart safely."
echo ""
echo "   DO NOT restart botical-prod yourself!"
