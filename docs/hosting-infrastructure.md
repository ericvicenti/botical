# Hosting Infrastructure

This document describes the production hosting setup for Iris on [exe.dev](https://exe.dev), including the current deployment at `iris.vicenti.net`.

## Architecture Overview

```
Internet
    │
    ▼
iris.vicenti.net (custom domain)
    │
    │ CNAME
    ▼
iris-vicenti.exe.xyz (exe.dev hostname)
    │
    ▼
exe.dev Reverse Proxy
    │ - TLS termination (automatic Let's Encrypt)
    │ - HTTP/2 support
    │ - Request routing
    │
    ▼ HTTP (port 8000)
Bun Server (Hono)
    ├── /api/*     → API routes (REST + WebSocket upgrade)
    ├── /health    → Health check endpoint
    ├── /ws        → WebSocket connections
    └── /*         → Static frontend (SPA fallback)
```

## exe.dev Platform

[exe.dev](https://exe.dev) provides lightweight Linux VMs with:
- Instant provisioning
- SSH access via `ssh hostname.exe.xyz` or `ssh exe.dev`
- Automatic TLS certificates for custom domains
- Built-in reverse proxy (ports 3000-9999)
- systemd for service management

### Port Requirements

exe.dev's reverse proxy only forwards to ports 3000-9999. Iris uses **port 8000** for this reason.

## Components

### 1. Systemd Service (`iris.service`)

The Iris server runs as a systemd service for automatic startup and restart on failure.

**Location on server:** `/etc/systemd/system/iris.service`

**Configuration:**
```ini
[Unit]
Description=Iris AI Agent Server
After=network.target

[Service]
Type=simple
User=<auto-detected>
WorkingDirectory=$HOME/iris
Environment=NODE_ENV=production
Environment=IRIS_PORT=8000
Environment=IRIS_HOST=0.0.0.0
Environment=IRIS_STATIC_DIR=$HOME/iris/webui/dist
Environment=IRIS_DATA_DIR=$HOME/.iris
ExecStart=$HOME/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Management commands:**
```bash
# View status
ssh iris-vicenti.exe.xyz systemctl status iris

# View logs
ssh iris-vicenti.exe.xyz journalctl -u iris -f

# Restart service
ssh iris-vicenti.exe.xyz sudo systemctl restart iris

# Stop service
ssh iris-vicenti.exe.xyz sudo systemctl stop iris
```

### 2. GitHub Actions Runner

A self-hosted GitHub Actions runner enables automatic deployment on every push to `main`.

**Location on server:** `$HOME/actions-runner/`

**Service:** `gh-actions-runner.service`

**Management:**
```bash
# View runner status
ssh iris-vicenti.exe.xyz sudo systemctl status gh-actions-runner

# View runner logs
ssh iris-vicenti.exe.xyz sudo journalctl -u gh-actions-runner -f

# Restart runner
ssh iris-vicenti.exe.xyz sudo systemctl restart gh-actions-runner
```

### 3. Deploy Key (SSH)

The server uses an SSH deploy key to pull from GitHub. The key is stored at `~/.ssh/id_ed25519` on the server.

To view the public key (if you need to re-add it to GitHub):
```bash
ssh iris-vicenti.exe.xyz cat ~/.ssh/id_ed25519.pub
```

Add deploy keys at: https://github.com/ericvicenti/iris/settings/keys

### 4. exe.dev Proxy Configuration

The proxy is configured to:
- Forward HTTPS traffic to port 8000
- Make the service publicly accessible

```bash
# These commands were run during initial setup:
ssh exe.dev share port iris-vicenti 8000
ssh exe.dev share set-public iris-vicenti
```

## Custom Domain Setup

### DNS Configuration

For `iris.vicenti.net`, add a CNAME record:
```
iris.vicenti.net  CNAME  iris-vicenti.exe.xyz
```

exe.dev automatically provisions TLS certificates when it detects the domain pointing to its servers.

### For Your Own Domain

1. Create CNAME record: `your-subdomain.example.com → your-vm.exe.xyz`
2. Wait for DNS propagation (usually < 5 minutes)
3. exe.dev auto-provisions TLS certificate
4. Access via HTTPS immediately

For apex domains (e.g., `example.com` without subdomain):
```
example.com      ALIAS  exe.xyz
www.example.com  CNAME  your-vm.exe.xyz
```

## CI/CD Pipeline

### Workflow: `.github/workflows/deploy.yml`

Triggered on:
- Push to `main` branch
- Manual dispatch (workflow_dispatch)

**Steps:**
1. **Pull latest code** - `git fetch && git reset --hard origin/main`
2. **Install dependencies** - `bun install` (root and webui)
3. **Build frontend** - `cd webui && bun run build`
4. **Restart service** - `sudo systemctl restart iris`
5. **Health check** - `curl http://localhost:8000/health`

### Viewing Deployment Status

- GitHub Actions: https://github.com/ericvicenti/iris/actions
- Runner status: `ssh iris-vicenti.exe.xyz sudo systemctl status gh-actions-runner`
- Service logs: `ssh iris-vicenti.exe.xyz journalctl -u iris -f`

## Security Configuration

### HSTS Header

Production deployments include HSTS (HTTP Strict Transport Security):
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

This is set in `src/server/app.ts` when `NODE_ENV=production`.

### TLS

All TLS is handled by exe.dev's reverse proxy:
- Automatic certificate provisioning via Let's Encrypt
- Automatic certificate renewal
- Modern TLS configuration

Traffic between the proxy and the app is plain HTTP on localhost.

### Data Location

```
~/.iris/
├── iris.db          # Root database (users, projects metadata)
└── projects/        # Per-project SQLite databases
    └── <project-id>/
        └── project.db
```

**Backup recommendation:** Regularly backup `~/.iris/` directory.

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables production optimizations |
| `IRIS_PORT` | `8000` | HTTP port (exe.dev requires 3000-9999) |
| `IRIS_HOST` | `0.0.0.0` | Listen on all interfaces |
| `IRIS_STATIC_DIR` | `$HOME/iris/webui/dist` | Built frontend files |
| `IRIS_DATA_DIR` | `$HOME/.iris` | Database and data storage |

## Manual Server Access

### SSH Access

```bash
# Direct to VM
ssh iris-vicenti.exe.xyz

# Or via exe.dev portal
ssh exe.dev
```

### File Locations

| Path | Description |
|------|-------------|
| `~/iris/` | Application code (git repo) |
| `~/.iris/` | Data directory |
| `~/.bun/` | Bun runtime |
| `~/actions-runner/` | GitHub Actions runner |
| `/etc/systemd/system/iris.service` | Iris service file |
| `/etc/systemd/system/gh-actions-runner.service` | Runner service file |

## Troubleshooting

### Service won't start

Check logs for errors:
```bash
ssh iris-vicenti.exe.xyz journalctl -u iris -n 50 --no-pager
```

Common issues:
- Port conflict (another service on 8000)
- Missing dependencies (run deploy script again)
- Permission errors on data directory

### Deployment fails

Check GitHub Actions logs:
https://github.com/ericvicenti/iris/actions

Check runner status:
```bash
ssh iris-vicenti.exe.xyz sudo systemctl status gh-actions-runner
```

If runner is offline, restart it:
```bash
ssh iris-vicenti.exe.xyz sudo systemctl restart gh-actions-runner
```

### SSL certificate issues

exe.dev handles certificates automatically. If issues occur:
1. Verify DNS CNAME is correct
2. Wait for propagation (up to 24 hours for some DNS providers)
3. Contact exe.dev support if issues persist

### Health check fails

Test locally on server:
```bash
ssh iris-vicenti.exe.xyz curl http://localhost:8000/health
```

If it returns `{"status":"ok"}`, the issue is with the proxy. If it fails, check the service logs.

## Related Documentation

- [Deployment Guide](./deployment.md) - Deploy script and CI/CD setup
- [Local Development](./local-development.md) - Run locally with npx
- [Traditional VPS Guide](./deployment-guide.md) - Ubuntu/Nginx deployment
- [Architecture](./knowledge-base/01-architecture.md) - System architecture
