#!/bin/bash
# Trigger a Leopard improvement cycle via the Botical API
set -euo pipefail

INSTANCE="${1:-prod}"

if [ "$INSTANCE" = "prod" ]; then
  BASE_URL="http://localhost:6001"
  DATA_DIR="$HOME/.botical-prod"
else
  BASE_URL="http://localhost:6002"
  DATA_DIR="$HOME/.botical-dev"
fi

API_KEY="${LEOPARD_API_KEY:-botical_leopard_194fbb476a9f614465838ea1a13df29a}"
# Use the Botical Tiger project (which has the dev repo as its workspace)
PROJECT_ID="${LEOPARD_PROJECT_ID:-prj_2go5oq0sa9o-51985ca1}"

send_message() {
  local session_id="$1"
  local content="$2"
  curl -s -X POST "$BASE_URL/api/messages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"projectId\": \"$PROJECT_ID\",
      \"sessionId\": \"$session_id\",
      \"content\": \"$content\",
      \"userId\": \"usr_mldu5ohe-94448ee0\",
      \"providerId\": \"anthropic-oauth\",
      \"canExecuteCode\": true
    }" 2>&1
}

# Check for active session (created in last 2 hours)
TWO_HOURS_AGO=$(( $(date +%s%3N) - 7200000 ))
ACTIVE_SESSION=$(sqlite3 "$DATA_DIR/projects/$PROJECT_ID/project.db" \
  "SELECT id FROM sessions WHERE agent = 'leopard' AND status = 'active' AND created_at > $TWO_HOURS_AGO ORDER BY created_at DESC LIMIT 1" 2>/dev/null || true)

# If there's an active session, check if it's in an error loop
if [ -n "$ACTIVE_SESSION" ]; then
  # Count recent consecutive errors (last 3 assistant messages)
  RECENT_ERRORS=$(sqlite3 "$DATA_DIR/projects/$PROJECT_ID/project.db" \
    "SELECT COUNT(*) FROM (SELECT error_type FROM messages WHERE session_id='$ACTIVE_SESSION' AND role='assistant' ORDER BY created_at DESC LIMIT 3) WHERE error_type IS NOT NULL;" 2>/dev/null || echo "0")

  if [ "$RECENT_ERRORS" -ge 2 ]; then
    echo "⚠️ Session $ACTIVE_SESSION has $RECENT_ERRORS recent errors (likely rate limited). Skipping to avoid spam."
    echo "   Will create a fresh session on next kick when errors clear."
    # Mark session as completed so we don't keep hitting it
    sqlite3 "$DATA_DIR/projects/$PROJECT_ID/project.db" \
      "UPDATE sessions SET status='completed' WHERE id='$ACTIVE_SESSION';" 2>/dev/null || true
    exit 0
  fi

  echo "📋 Continuing session: $ACTIVE_SESSION"
  RESP=$(send_message "$ACTIVE_SESSION" "Continue your improvement cycle. Read PRIORITIES.md and CHANGELOG-AUTO.md, pick the next task, implement it, test it, deploy if tests pass.")
else
  echo "🆕 Creating new session..."
  SESSION_RESP=$(curl -s -X POST "$BASE_URL/api/sessions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{
      \"projectId\": \"$PROJECT_ID\",
      \"title\": \"Improvement Cycle $(date +%Y-%m-%d-%H%M)\",
      \"agent\": \"leopard\",
      \"providerId\": \"anthropic-oauth\"
    }")

  SESSION_ID=$(echo "$SESSION_RESP" | jq -r '.data.id // empty')
  if [ -z "$SESSION_ID" ]; then
    echo "❌ Failed: $SESSION_RESP"
    exit 1
  fi
  echo "✅ Session: $SESSION_ID"
  RESP=$(send_message "$SESSION_ID" "Start a new improvement cycle. Read PRIORITIES.md for your current priorities. Read CHANGELOG-AUTO.md for recent work. Pick the highest priority unfinished item, implement it, test it, and deploy if tests pass.")
fi

echo "$RESP" | jq -r '.data.message.id // .error.message // .' 2>/dev/null || echo "$RESP"
echo "🐆 Done ($INSTANCE)"
