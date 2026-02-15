#!/bin/bash
# Apply a staged production deploy — restart botical-prod safely.
# Called by Ion (sentinel) or cron, NEVER by Leopard directly.
set -euo pipefail

MARKER="$HOME/.botical-prod/.deploy-ready"
LOCK="$HOME/.botical-prod/.deploy-in-progress"
REVERT_MARKER="$HOME/.botical-prod/.deploy-reverted"
PROD_DIR="$HOME/botical-prod"

# Check if there's a staged deploy
if [ ! -f "$MARKER" ]; then
  echo "No staged deploy found."
  exit 0
fi

echo "🔄 Applying staged deploy..."
cat "$MARKER"

# Lock
mv "$MARKER" "$LOCK"

# Record current HEAD for rollback
PREV_HEAD=$(cd "$PROD_DIR" && git rev-parse --short HEAD~1 2>/dev/null || echo "unknown")

# Restart
echo "🔄 Restarting botical-prod..."
sudo systemctl restart botical-prod

# Verify (wait up to 15 seconds)
echo "⏳ Waiting for health check..."
HEALTHY=false
for i in $(seq 1 15); do
  sleep 1
  RESP=$(curl -s -m 2 http://localhost:6001/api/health 2>&1 || true)
  # Server is up if we get any JSON response (even auth error)
  if echo "$RESP" | grep -qE "AUTHENTICATION_ERROR|\"ok\""; then
    HEALTHY=true
    break
  fi
done

if $HEALTHY; then
  echo "✅ Production is healthy!"
  rm -f "$LOCK" "$REVERT_MARKER"
else
  echo "❌ Production failed health check! Rolling back..."
  cd "$PROD_DIR"
  git reset --hard HEAD~1
  sudo systemctl restart botical-prod
  sleep 3

  echo "{\"reverted_at\":\"$(date -Iseconds)\",\"reverted_to\":\"$PREV_HEAD\"}" > "$REVERT_MARKER"
  rm -f "$LOCK"
  echo "⚠️  Reverted to $PREV_HEAD. Check logs: journalctl -u botical-prod -n 50"
  exit 1
fi
