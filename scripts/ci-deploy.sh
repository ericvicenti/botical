#!/bin/bash
# CI Deploy: Auto-deploy main to leopard (prod) when new commits are detected.
# Run via cron every few minutes. Only deploys if prod is behind main.
set -euo pipefail

PROD_DIR="$HOME/botical-prod"
DEV_DIR="$HOME/botical"
LOG="$HOME/.botical-prod/ci-deploy.log"
LOCK="$HOME/.botical-prod/.ci-deploying"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

# Prevent concurrent deploys
if [ -f "$LOCK" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK") ))
  if [ "$AGE" -lt 300 ]; then
    echo "LOCKED: Deploy in progress (${AGE}s old). Skipping."
    exit 0
  fi
  log "WARN: Stale lock (${AGE}s), removing."
  rm -f "$LOCK"
fi

# Fetch latest from GitHub
cd "$DEV_DIR"
git fetch origin main --quiet 2>/dev/null

DEV_HEAD=$(git rev-parse origin/main)
PROD_HEAD=$(cd "$PROD_DIR" && git rev-parse HEAD)

if [ "$DEV_HEAD" = "$PROD_HEAD" ]; then
  echo "IN_SYNC: Prod ($PROD_HEAD) matches main. Nothing to deploy."
  exit 0
fi

# New commits detected — deploy!
COMMITS=$(git log --oneline "$PROD_HEAD".."$DEV_HEAD" 2>/dev/null | head -10)
log "NEW COMMITS detected. Deploying $PROD_HEAD → $DEV_HEAD"
log "$COMMITS"

touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Check if leopard is actively working (idle check)
PROJECT_DB="$HOME/.botical-prod/projects/prj_2go5oq0sa9o-51985ca1/project.db"
IDLE_THRESHOLD_MS=120000  # 2 minutes
LAST_MSG=$(sqlite3 "$PROJECT_DB" "SELECT COALESCE(MAX(created_at),0) FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE agent='leopard');" 2>/dev/null || echo "0")
NOW_MS=$(date +%s%3N)
AGO=$(( NOW_MS - LAST_MSG ))

if [ "$AGO" -lt "$IDLE_THRESHOLD_MS" ]; then
  log "DEFERRED: Leopard active (${AGO}ms ago). Will retry next run."
  exit 0
fi

# Pull into prod
log "Pulling into prod..."
cd "$PROD_DIR"
git fetch origin
git reset --hard origin/main

# Install deps & build
log "Building..."
bun install --silent 2>&1 | tail -2
cd webui && npm install --silent 2>&1 | tail -2 && npx vite build 2>&1 | tail -3
cd ..

# Record prev HEAD for rollback
PREV_HEAD=$PROD_HEAD

# Restart
log "Restarting botical-prod..."
sudo systemctl restart botical-prod

# Health check (15s timeout)
HEALTHY=false
for i in $(seq 1 15); do
  sleep 1
  RESP=$(curl -s -m 2 http://localhost:6001/api/health 2>&1 || true)
  if echo "$RESP" | grep -qE "AUTHENTICATION_ERROR|\"ok\""; then
    HEALTHY=true
    break
  fi
done

if $HEALTHY; then
  NEW_HEAD=$(git rev-parse --short HEAD)
  log "✅ DEPLOYED: $NEW_HEAD is live on leopard."
else
  log "❌ FAILED: Rolling back to $PREV_HEAD"
  git reset --hard "$PREV_HEAD"
  sudo systemctl restart botical-prod
  sleep 3
  log "Rolled back. Check logs: journalctl -u botical-prod -n 50"
  exit 1
fi
