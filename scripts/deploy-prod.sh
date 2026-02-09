#!/bin/bash
# Deploy current main branch to production (leopard.verse.link)
# Usage: ./scripts/deploy-prod.sh
set -euo pipefail

PROD_DIR="$HOME/botical-prod"
DEV_DIR="$HOME/botical"

echo "🐆 Deploying to production (leopard.verse.link)..."

# 1. Ensure dev repo is clean and pushed
cd "$DEV_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Dev repo has uncommitted changes. Commit first!"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Not on main branch (on $CURRENT_BRANCH). Continue? [y/N]"
  read -r response
  [ "$response" = "y" ] || exit 1
fi

# 2. Push to GitHub
echo "📤 Pushing to GitHub..."
git push ion-kitty main

# 3. Pull into prod repo
echo "📥 Pulling into prod..."
cd "$PROD_DIR"
git fetch origin
git reset --hard origin/main

# 4. Install deps
echo "📦 Installing dependencies..."
bun install
cd webui && npm install --silent && npx vite build
cd ..

# 5. Restart prod service
echo "🔄 Restarting production service..."
sudo systemctl restart botical-prod

# 6. Verify
sleep 2
if systemctl is-active --quiet botical-prod; then
  echo "✅ Production deployed and running!"
  echo "   https://leopard.verse.link"
else
  echo "❌ Production failed to start! Check: journalctl -u botical-prod"
  exit 1
fi
