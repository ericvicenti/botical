#!/bin/bash
# Check Leopard's status — is it running? making progress?
set -euo pipefail

DATA_DIR="$HOME/.botical-prod"
DEV_DIR="$HOME/botical"

echo "=== 🐆 Leopard Status ==="

# Service health
echo ""
echo "## Services"
echo "  prod: $(systemctl is-active botical-prod)"
echo "  dev:  $(systemctl is-active botical-dev)"

# Recent git activity on dev
echo ""
echo "## Recent Commits (dev)"
cd "$DEV_DIR"
git log --oneline -5 2>/dev/null || echo "  (no commits)"

# Prod vs dev sync
echo ""
echo "## Sync Status"
DEV_HEAD=$(cd ~/botical && git rev-parse --short HEAD 2>/dev/null)
PROD_HEAD=$(cd ~/botical-prod && git rev-parse --short HEAD 2>/dev/null)
echo "  dev:  $DEV_HEAD"
echo "  prod: $PROD_HEAD"
if [ "$DEV_HEAD" = "$PROD_HEAD" ]; then
  echo "  ✅ In sync"
else
  BEHIND=$(cd ~/botical-prod && git log --oneline HEAD..origin/main 2>/dev/null | wc -l)
  echo "  ⚠️  Prod is $BEHIND commits behind dev"
fi

# Test status
echo ""
echo "## Test Status"
cd "$DEV_DIR"
TEST_OUTPUT=$(timeout 120 bun test tests/unit/ tests/integration/ 2>&1 | tail -5)
echo "$TEST_OUTPUT"

# PRIORITIES.md status
echo ""
echo "## Open Priorities"
grep -c '^\- \[ \]' PRIORITIES.md 2>/dev/null || echo "0"
echo " open items in PRIORITIES.md"

# Recent changelog
echo ""
echo "## Recent Changelog"
head -20 CHANGELOG-AUTO.md 2>/dev/null || echo "  (no changelog)"

# Active sessions
echo ""
echo "## Active Leopard Sessions"
ROOT_PROJECT=$(sqlite3 "$DATA_DIR/root.db" "SELECT id FROM projects WHERE owner_id = 'system' LIMIT 1" 2>/dev/null || true)
if [ -n "$ROOT_PROJECT" ]; then
  sqlite3 "$DATA_DIR/projects/$ROOT_PROJECT/project.db" \
    "SELECT id, title, created_at FROM sessions WHERE agent = 'leopard' AND status = 'active' ORDER BY created_at DESC LIMIT 3" 2>/dev/null || echo "  (none)"
fi
