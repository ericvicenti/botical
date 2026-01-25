# Deployment Phase

Deploy Iris to an exe.dev server with a single idempotent script.

## Overview

**Target**: `iris-vicenti.exe.xyz` (with CNAME `iris.vicenti.net`)
**Architecture**: Single Bun server serving both API and static frontend
**Process Management**: systemd
**SSL/TLS**: Handled by exe.dev proxy (automatic)

## Components to Deploy

1. **Backend Server** (`src/index.ts`) - Hono HTTP/WebSocket server on port 80
2. **Frontend Build** (`webui/dist/`) - Static files served by backend

## Implementation Tasks

### 1. Add Static File Serving to Backend

The backend currently only serves API routes. For production, it needs to serve the built frontend.

**File**: `src/server/app.ts`

Add static file serving that:
- Serves files from `webui/dist/` (or configurable path via `IRIS_STATIC_DIR`)
- Falls back to `index.html` for client-side routing (SPA behavior)
- Only activates in production mode
- Prioritizes API routes over static files

### 2. Create Deploy Script

**File**: `scripts/deploy.ts`

Usage: `bun scripts/deploy.ts <hostname>`

The script should:

```
1. Parse hostname argument (e.g., "iris-vicenti.exe.xyz")
2. SSH to host and run deployment commands:
   a. Install Bun if not present
   b. Clone repo (first run) or pull latest (subsequent runs)
   c. Install dependencies (bun install)
   d. Build frontend (cd webui && bun run build)
   e. Install systemd service
   f. Enable and restart service
```

### 3. Create Systemd Service Template

**File**: `scripts/iris.service`

```ini
[Unit]
Description=Iris AI Agent Workspace
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/iris
ExecStart=/root/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=IRIS_PORT=80
Environment=IRIS_HOST=0.0.0.0
Environment=IRIS_STATIC_DIR=/root/iris/webui/dist

[Install]
WantedBy=multi-user.target
```

### 4. Update Frontend Build Configuration

**File**: `webui/vite.config.ts`

Ensure production build:
- Uses relative paths (or configurable base URL)
- API calls use relative `/api` path (same origin in production)

## Deployment Flow

```
Local Machine                         exe.dev Server
─────────────────                     ────────────────

bun scripts/deploy.ts ─────SSH────────>
                                      Check/install Bun
                                      Clone/update repo
                                      bun install
                                      cd webui && bun run build
                                      Install systemd service
                                      systemctl enable iris
                                      systemctl restart iris

                     <────Status──────  Server running on :80

                                      exe.dev proxy handles:
                                      - TLS termination
                                      - HTTPS → HTTP forwarding
                                      - X-Forwarded-* headers
```

## Network Architecture

```
Internet
    │
    ▼
https://iris.vicenti.net  ───CNAME───> iris-vicenti.exe.xyz
    │
    ▼
exe.dev Proxy (TLS termination)
    │
    ▼ HTTP (port 80)
Bun Server (Hono)
    ├── /api/*     → API routes
    ├── /ws        → WebSocket upgrade
    └── /*         → Static files (SPA)
```

## Environment Variables (Production)

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables production mode |
| `IRIS_PORT` | `80` | HTTP port (exe.dev forwards here) |
| `IRIS_HOST` | `0.0.0.0` | Listen on all interfaces |
| `IRIS_STATIC_DIR` | `/root/iris/webui/dist` | Path to built frontend |
| `IRIS_DATA_DIR` | `/root/.iris` | Data directory (default) |

## CNAME Setup

After deployment, set up DNS:
- `iris.vicenti.net` CNAME → `iris-vicenti.exe.xyz`
- exe.dev will automatically provision TLS certificate

## Script Idempotency

The deploy script must be idempotent (safe to run multiple times):

| Operation | First Run | Subsequent Runs |
|-----------|-----------|-----------------|
| Bun install | Installs | Skips (already installed) |
| Clone repo | `git clone` | `git pull` |
| Dependencies | Full install | Updates only |
| Frontend build | Builds | Rebuilds |
| Systemd service | Installs | Overwrites |
| Service enable | Enables | No-op |
| Service restart | Starts | Restarts |

## Testing

1. Run deploy script: `bun scripts/deploy.ts iris-vicenti.exe.xyz`
2. Check service status: `ssh iris-vicenti.exe.xyz systemctl status iris`
3. Test endpoints:
   - `https://iris-vicenti.exe.xyz/health` → `{"status":"ok"}`
   - `https://iris-vicenti.exe.xyz/` → Frontend HTML
   - `wss://iris-vicenti.exe.xyz/ws` → WebSocket connection

## Rollback

If deployment fails:
```bash
ssh iris-vicenti.exe.xyz
systemctl stop iris
cd ~/iris && git checkout <previous-commit>
bun install && cd webui && bun run build
systemctl start iris
```

## Future Enhancements

- [ ] GitHub Actions for CI/CD
- [ ] Blue-green deployment
- [ ] Health check before restart
- [ ] Automatic rollback on failure
- [ ] Multiple environment support (staging/production)
