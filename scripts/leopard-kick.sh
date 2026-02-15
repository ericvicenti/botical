#!/bin/bash
# Smart Leopard cycle trigger — only kicks if Leopard is idle.
# "Idle" = no messages in the last 10 minutes.
set -euo pipefail

DATA_DIR="$HOME/.botical-prod"
PROJECT_ID="prj_2go5oq0sa9o-51985ca1"
DB="$DATA_DIR/projects/$PROJECT_ID/project.db"
IDLE_THRESHOLD_MS=600000  # 10 minutes

# Check last message timestamp from any leopard session
LAST_MSG=$(sqlite3 "$DB" "SELECT COALESCE(MAX(created_at),0) FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE agent='leopard');" 2>/dev/null || echo "0")
NOW_MS=$(date +%s%3N)
AGO=$(( NOW_MS - LAST_MSG ))

if [ "$AGO" -lt "$IDLE_THRESHOLD_MS" ]; then
  echo "BUSY: Leopard active ${AGO}ms ago (threshold: ${IDLE_THRESHOLD_MS}ms). Skipping."
  exit 0
fi

echo "IDLE: Leopard last active ${AGO}ms ago. Triggering cycle..."
exec bash "$(dirname "$0")/improvement-cycle.sh" prod
