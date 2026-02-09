#!/bin/bash
# Check status of all Botical services
echo "=== Botical Services ==="
echo ""
echo "🐆 Production (leopard.verse.link)"
echo "   Service: $(systemctl is-active botical-prod)"
echo "   Port:    6001"
echo "   Repo:    ~/botical-prod (main branch)"
echo "   Data:    ~/.botical-prod"
echo ""
echo "🐯 Dev Backend (tiger.verse.link)"
echo "   Service: $(systemctl is-active botical-dev)"
echo "   Port:    6002"
echo "   Mode:    bun --watch (auto-restart on file change)"
echo "   Repo:    ~/botical"
echo "   Data:    ~/.botical-dev"
echo ""
echo "🎨 Dev Frontend (HMR)"
echo "   Service: $(systemctl is-active botical-dev-ui)"
echo "   Port:    6003 (proxies API to 6002)"
echo "   Mode:    vite dev (hot module replacement)"
echo ""
echo "=== Git Status ==="
echo "Dev:  $(cd ~/botical && git log --oneline -1)"
echo "Prod: $(cd ~/botical-prod && git log --oneline -1)"
echo ""
if [ "$(cd ~/botical && git rev-parse HEAD)" != "$(cd ~/botical-prod && git rev-parse HEAD)" ]; then
  echo "⚠️  Dev and Prod are on different commits!"
  echo "   Dev commits ahead:"
  cd ~/botical && git log --oneline $(cd ~/botical-prod && git rev-parse HEAD)..HEAD
else
  echo "✅ Dev and Prod are in sync"
fi
