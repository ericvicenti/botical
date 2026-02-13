#!/bin/bash
# Trigger a Leopard improvement cycle via the Botical API
# This creates a session and sends a message to the leopard agent
set -euo pipefail

INSTANCE="${1:-prod}"

if [ "$INSTANCE" = "prod" ]; then
  BASE_URL="http://localhost:6001"
  DATA_DIR="$HOME/.botical-prod"
else
  BASE_URL="http://localhost:6002"
  DATA_DIR="$HOME/.botical-dev"
fi

# Get the root project ID
ROOT_PROJECT=$(sqlite3 "$DATA_DIR/root.db" "SELECT id FROM projects WHERE owner_id = 'system' LIMIT 1" 2>/dev/null)
if [ -z "$ROOT_PROJECT" ]; then
  echo "❌ No root project found"
  exit 1
fi

# Check if there's an active improvement session
ACTIVE_SESSION=$(sqlite3 "$DATA_DIR/projects/$ROOT_PROJECT/project.db" \
  "SELECT id FROM sessions WHERE agent = 'leopard' AND status = 'active' ORDER BY created_at DESC LIMIT 1" 2>/dev/null || true)

if [ -n "$ACTIVE_SESSION" ]; then
  echo "📋 Found active leopard session: $ACTIVE_SESSION"
  # Send follow-up message to continue working
  curl -s -X POST "$BASE_URL/api/messages" \
    -H "Content-Type: application/json" \
    -d "{
      \"projectId\": \"$ROOT_PROJECT\",
      \"sessionId\": \"$ACTIVE_SESSION\",
      \"content\": \"Continue your improvement cycle. Read PRIORITIES.md and CHANGELOG-AUTO.md, pick the next task, implement it, test it, deploy if tests pass.\",
      \"userId\": \"system\"
    }" | jq -r '.data.message.id // .error.message // "sent"'
else
  echo "🆕 Creating new leopard improvement session..."
  # Create a new session
  SESSION_RESP=$(curl -s -X POST "$BASE_URL/api/sessions" \
    -H "Content-Type: application/json" \
    -d "{
      \"projectId\": \"$ROOT_PROJECT\",
      \"title\": \"Improvement Cycle $(date +%Y-%m-%d-%H%M)\",
      \"agent\": \"leopard\"
    }")
  
  SESSION_ID=$(echo "$SESSION_RESP" | jq -r '.data.id // empty')
  if [ -z "$SESSION_ID" ]; then
    echo "❌ Failed to create session: $SESSION_RESP"
    exit 1
  fi
  
  echo "✅ Created session: $SESSION_ID"
  
  # Send the kickoff message
  curl -s -X POST "$BASE_URL/api/messages" \
    -H "Content-Type: application/json" \
    -d "{
      \"projectId\": \"$ROOT_PROJECT\",
      \"sessionId\": \"$SESSION_ID\",
      \"content\": \"Start a new improvement cycle. Read PRIORITIES.md for your current priorities. Read CHANGELOG-AUTO.md for recent work. Pick the highest priority unfinished item, implement it, test it, and deploy if tests pass.\",
      \"userId\": \"system\"
    }" | jq -r '.data.message.id // .error.message // "sent"'
fi

echo "🐆 Leopard improvement cycle triggered on $INSTANCE"
