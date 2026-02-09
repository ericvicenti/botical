# Botical Deployment Guide

## Architecture

Two instances run on sentinel:

| Instance | URL | Service | Port | Repo | Data |
|----------|-----|---------|------|------|------|
| **Production** (🐆 leopard) | https://leopard.verse.link | `botical-prod` | 6001 | `~/botical-prod` | `~/.botical-prod` |
| **Dev** (🐯 tiger) | https://tiger.verse.link | `botical-dev` + `botical-dev-ui` | 6002 (API) + 6003 (UI) | `~/botical` | `~/.botical-dev` |

### Production
- Runs `bun run src/index.ts` with pre-built frontend (`webui/dist`)
- Follows the `main` branch on GitHub
- Deploy with: `~/botical/scripts/deploy-prod.sh`

### Development
- **Backend** (`botical-dev`): `bun --watch run src/index.ts` — auto-restarts on any `.ts` file change
- **Frontend** (`botical-dev-ui`): `vite dev` on port 6003 — hot module replacement, proxies `/api` and `/ws` to backend on port 6002
- Edit code in `~/botical`, changes are **immediately visible** at https://tiger.verse.link

## Workflow

### Making Changes
1. Edit code in `~/botical` (dev repo)
2. Backend changes: auto-restart via `bun --watch`
3. Frontend changes: instant via vite HMR
4. Test at https://tiger.verse.link

### Deploying to Production
```bash
# Option 1: Use the deploy script (recommended)
~/botical/scripts/deploy-prod.sh

# Option 2: Manual
cd ~/botical
git add -A && git commit -m "description" && git push ion-kitty main
cd ~/botical-prod
git fetch origin && git reset --hard origin/main
cd webui && npm install && npx vite build && cd ..
bun install
sudo systemctl restart botical-prod
```

### Checking Status
```bash
~/botical/scripts/dev-status.sh
```

## Service Management

```bash
# Production
sudo systemctl start/stop/restart botical-prod
sudo journalctl -u botical-prod -f

# Dev backend
sudo systemctl start/stop/restart botical-dev
sudo journalctl -u botical-dev -f

# Dev frontend
sudo systemctl start/stop/restart botical-dev-ui
sudo journalctl -u botical-dev-ui -f
```

## Networking

Both instances are exposed via Cloudflare Tunnel (`c34b67ae`):
- Config: `/etc/cloudflared/config.yml`
- DNS: CNAME records for `leopard.verse.link` and `tiger.verse.link`
- After config changes: `sudo systemctl restart cloudflared`

## Key Principles

1. **Dev is disposable** — `~/.botical-dev` can be wiped without affecting production
2. **Prod follows main** — only deployed, committed code runs in production
3. **Prod edits dev** — use leopard to make changes that appear on tiger
4. **Separate databases** — users, projects, sessions are independent per instance
