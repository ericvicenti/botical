# Hosting Infrastructure

This document describes the production hosting setup for Botical on [exe.dev](https://exe.dev), including the current deployment at `botical.vicenti.net`.

## Architecture Overview

```
Internet
    │
    ▼
botical.vicenti.net (custom domain)
    │
    │ CNAME
    ▼
botical-vicenti.exe.xyz (exe.dev hostname)
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

exe.dev's reverse proxy only forwards to ports 3000-9999. Botical uses **port 8000** for this reason.

## Components

### 1. Systemd Service (`botical.service`)

The Botical server runs as a systemd service for automatic startup and restart on failure.

**Location on server:** `/etc/systemd/system/botical.service`

**Configuration:**
```ini
[Unit]
Description=Botical AI Agent Server
After=network.target

[Service]
Type=simple
User=<auto-detected>
WorkingDirectory=$HOME/botical
Environment=NODE_ENV=production
Environment=BOTICAL_PORT=8000
Environment=BOTICAL_HOST=0.0.0.0
Environment=BOTICAL_STATIC_DIR=$HOME/botical/webui/dist
Environment=BOTICAL_DATA_DIR=$HOME/.botical
ExecStart=$HOME/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Management commands:**
```bash
# View status
ssh botical-vicenti.exe.xyz systemctl status botical

# View logs
ssh botical-vicenti.exe.xyz journalctl -u botical -f

# Restart service
ssh botical-vicenti.exe.xyz sudo systemctl restart botical

# Stop service
ssh botical-vicenti.exe.xyz sudo systemctl stop botical
```

### 2. GitHub Actions Runner

A self-hosted GitHub Actions runner enables automatic deployment on every push to `main`.

**Location on server:** `$HOME/actions-runner/`

**Service:** `gh-actions-runner.service`

**Management:**
```bash
# View runner status
ssh botical-vicenti.exe.xyz sudo systemctl status gh-actions-runner

# View runner logs
ssh botical-vicenti.exe.xyz sudo journalctl -u gh-actions-runner -f

# Restart runner
ssh botical-vicenti.exe.xyz sudo systemctl restart gh-actions-runner
```

### 3. Deploy Key (SSH)

The server uses an SSH deploy key to pull from GitHub. The key is stored at `~/.ssh/id_ed25519` on the server.

To view the public key (if you need to re-add it to GitHub):
```bash
ssh botical-vicenti.exe.xyz cat ~/.ssh/id_ed25519.pub
```

Add deploy keys at: https://github.com/ericvicenti/botical/settings/keys

### 4. exe.dev Proxy Configuration

The proxy is configured to:
- Forward HTTPS traffic to port 8000
- Make the service publicly accessible

```bash
# These commands were run during initial setup:
ssh exe.dev share port botical-vicenti 8000
ssh exe.dev share set-public botical-vicenti
```

## Custom Domain Setup

### DNS Configuration

For `botical.vicenti.net`, add a CNAME record:
```
botical.vicenti.net  CNAME  botical-vicenti.exe.xyz
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
4. **Restart service** - `sudo systemctl restart botical`
5. **Health check** - `curl http://localhost:8000/health`

### Viewing Deployment Status

- GitHub Actions: https://github.com/ericvicenti/botical/actions
- Runner status: `ssh botical-vicenti.exe.xyz sudo systemctl status gh-actions-runner`
- Service logs: `ssh botical-vicenti.exe.xyz journalctl -u botical -f`

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
~/.botical/
├── botical.db          # Root database (users, projects metadata)
└── projects/        # Per-project SQLite databases
    └── <project-id>/
        └── project.db
```

**Backup recommendation:** Regularly backup `~/.botical/` directory.

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables production optimizations |
| `BOTICAL_PORT` | `8000` | HTTP port (exe.dev requires 3000-9999) |
| `BOTICAL_HOST` | `0.0.0.0` | Listen on all interfaces |
| `BOTICAL_STATIC_DIR` | `$HOME/botical/webui/dist` | Built frontend files |
| `BOTICAL_DATA_DIR` | `$HOME/.botical` | Database and data storage |

## Manual Server Access

### SSH Access

```bash
# Direct to VM
ssh botical-vicenti.exe.xyz

# Or via exe.dev portal
ssh exe.dev
```

### File Locations

| Path | Description |
|------|-------------|
| `~/botical/` | Application code (git repo) |
| `~/.botical/` | Data directory |
| `~/.bun/` | Bun runtime |
| `~/actions-runner/` | GitHub Actions runner |
| `/etc/systemd/system/botical.service` | Botical service file |
| `/etc/systemd/system/gh-actions-runner.service` | Runner service file |

## Troubleshooting

### Service won't start

Check logs for errors:
```bash
ssh botical-vicenti.exe.xyz journalctl -u botical -n 50 --no-pager
```

Common issues:
- Port conflict (another service on 8000)
- Missing dependencies (run deploy script again)
- Permission errors on data directory

### Deployment fails

Check GitHub Actions logs:
https://github.com/ericvicenti/botical/actions

Check runner status:
```bash
ssh botical-vicenti.exe.xyz sudo systemctl status gh-actions-runner
```

If runner is offline, restart it:
```bash
ssh botical-vicenti.exe.xyz sudo systemctl restart gh-actions-runner
```

### SSL certificate issues

exe.dev handles certificates automatically. If issues occur:
1. Verify DNS CNAME is correct
2. Wait for propagation (up to 24 hours for some DNS providers)
3. Contact exe.dev support if issues persist

### Health check fails

Test locally on server:
```bash
ssh botical-vicenti.exe.xyz curl http://localhost:8000/health
```

If it returns `{"status":"ok"}`, the issue is with the proxy. If it fails, check the service logs.

## Related Documentation

- [Deployment Guide](./deployment.md) - Deploy script and CI/CD setup
- [Local Development](./local-development.md) - Run locally with npx
- [Traditional VPS Guide](./deployment-guide.md) - Ubuntu/Nginx deployment
- [Architecture](./knowledge-base/01-architecture.md) - System architecture
