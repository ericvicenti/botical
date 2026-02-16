#!/bin/bash
# Trigger a Leopard improvement cycle via the Botical API
set -euo pipefail

INSTANCE="${1:-prod}"
PR_FEEDBACK="${2:-}"

if [ "$INSTANCE" = "prod" ]; then
  BASE_URL="http://localhost:6001"
  DATA_DIR="$HOME/.botical-prod"
else
  BASE_URL="http://localhost:6002"
  DATA_DIR="$HOME/.botical-dev"
fi

API_KEY="${LEOPARD_API_KEY:-botical_leopard_194fbb476a9f614465838ea1a13df29a}"
PROJECT_ID="${LEOPARD_PROJECT_ID:-prj_2go5oq0sa9o-51985ca1}"
USER_ID="${LEOPARD_USER_ID:-usr_mldu5ohe-94448ee0}"

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
      \"userId\": \"$USER_ID\",
      \"providerId\": \"anthropic-oauth\",
      \"canExecuteCode\": true
    }" 2>&1
}

# Ensure dev branch is checked out
cd ~/botical
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "⚠️  Switching ~/botical to dev branch (was on $CURRENT_BRANCH)"
  git checkout dev 2>&1
fi

# Check for active session (created in last 2 hours)
TWO_HOURS_AGO=$(( $(date +%s%3N) - 7200000 ))
ACTIVE_SESSION=$(sqlite3 "$DATA_DIR/projects/$PROJECT_ID/project.db" \
  "SELECT id FROM sessions WHERE agent = 'leopard' AND status = 'active' AND created_at > $TWO_HOURS_AGO ORDER BY created_at DESC LIMIT 1" 2>/dev/null || true)

if [ -n "$ACTIVE_SESSION" ]; then
  echo "📋 Continuing session: $ACTIVE_SESSION"
  RESP=$(send_message "$ACTIVE_SESSION" "Continue your improvement cycle. Read PRIORITIES.md and CHANGELOG-AUTO.md, pick the next task, implement it, test it. Push to dev branch and open a PR to main. NEVER push to main directly.")
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
  RESP=$(send_message "$SESSION_ID" "Start a new improvement cycle. Read PRIORITIES.md for current priorities. Read CHANGELOG-AUTO.md for recent work. Work on the dev branch. Pick the highest priority unfinished item, implement it, run tests, commit to dev, and open a PR to main. NEVER push to main directly.")
fi

echo "$RESP" | jq -r '.data.message.id // .error.message // .' 2>/dev/null || echo "$RESP"
echo "🐆 Done ($INSTANCE)"
