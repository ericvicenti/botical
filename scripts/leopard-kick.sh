#!/bin/bash
# Smart Leopard cycle trigger — only kicks if Leopard is idle.
# Prevents overlapping cycles. Checks PR feedback first.
set -euo pipefail

DATA_DIR="$HOME/.botical-prod"
PROJECT_ID="prj_2go5oq0sa9o-51985ca1"
DB="$DATA_DIR/projects/$PROJECT_ID/project.db"
IDLE_THRESHOLD_MS=300000  # 5 minutes — if no activity in 5 min, consider idle
LOCK_FILE="/tmp/leopard-cycle.lock"

# --- Overlap protection via lockfile ---
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "LOCKED: Another cycle (PID $LOCK_PID) is still running. Skipping."
    exit 0
  else
    echo "STALE: Lock exists but PID $LOCK_PID is dead. Cleaning up."
    rm -f "$LOCK_FILE"
  fi
fi

# --- Check if Leopard is actively processing (recent messages) ---
LAST_MSG=$(sqlite3 "$DB" "SELECT COALESCE(MAX(created_at),0) FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE agent='leopard');" 2>/dev/null || echo "0")
NOW_MS=$(date +%s%3N)
AGO=$(( NOW_MS - LAST_MSG ))

if [ "$AGO" -lt "$IDLE_THRESHOLD_MS" ]; then
  echo "BUSY: Leopard active ${AGO}ms ago (threshold: ${IDLE_THRESHOLD_MS}ms). Skipping."
  exit 0
fi

# --- Also check message queue for pending/processing leopard messages ---
QUEUE_ACTIVE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM message_queue WHERE agent_name='leopard' AND status IN ('pending','processing');" 2>/dev/null || echo "0")
if [ "$QUEUE_ACTIVE" -gt 0 ]; then
  echo "QUEUED: Leopard has $QUEUE_ACTIVE message(s) in queue. Skipping."
  exit 0
fi

echo "IDLE: Leopard last active ${AGO}ms ago. Triggering cycle..."

# --- Write lock ---
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# --- Check for PR feedback before starting new work ---
PR_FEEDBACK=""
cd ~/botical
OPEN_PRS=$(gh pr list --head dev --base main --json number,title,reviewDecision,comments --jq '.[] | select(.comments | length > 0) | .number' 2>/dev/null || true)
if [ -n "$OPEN_PRS" ]; then
  PR_FEEDBACK="IMPORTANT: You have open PRs with comments. Before starting new work, check PR feedback: run 'gh pr view <number> --comments' for PRs: $OPEN_PRS. Address review feedback first, push fixes to dev."
  echo "📝 PR feedback found on: $OPEN_PRS"
fi

# --- Trigger the cycle ---
exec bash "$(dirname "$0")/improvement-cycle.sh" prod "$PR_FEEDBACK"
