# Deployment Guide

Deploy Iris to a server with a single command.

## Quick Start

```bash
bun scripts/deploy.ts <hostname>
```

Example:
```bash
bun scripts/deploy.ts iris-vicenti.exe.xyz
```

## Prerequisites

1. **SSH Access**: You must have SSH key-based access to the target server
2. **exe.dev Server**: The target should be an exe.dev VM (or any Linux server with systemd)

## What the Deploy Script Does

The script is **idempotent** - safe to run multiple times:

| Step | First Run | Subsequent Runs |
|------|-----------|-----------------|
| 1. Check SSH | Connects | Connects |
| 2. Install Bun | Installs | Skips (already installed) |
| 3. Clone/Update Repo | `git clone` | `git reset --hard origin/main` |
| 4. Install Dependencies | Full install | Updates only |
| 5. Build Frontend | Builds | Rebuilds |
| 6. Install Service | Creates | Overwrites |
| 7. Restart Service | Starts | Restarts |

## Architecture

```
Internet
    │
    ▼
https://your-domain.com  ───CNAME───> hostname.exe.xyz
    │
    ▼
exe.dev Proxy (TLS termination, automatic certificates)
    │
    ▼ HTTP (port 80)
Bun Server (Hono)
    ├── /api/*     → API routes
    ├── /health    → Health check
    ├── /ws        → WebSocket
    └── /*         → Static frontend (SPA)
```

## Custom Domain Setup

1. Deploy to your exe.dev server
2. Create a CNAME record pointing your domain to your VM:
   ```
   iris.example.com  CNAME  your-vm.exe.xyz
   ```
3. exe.dev automatically provisions a TLS certificate

For apex domains (e.g., `example.com`):
```
example.com      ALIAS  exe.xyz
www.example.com  CNAME  your-vm.exe.xyz
```

## Configuration

The systemd service sets these environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Production mode |
| `IRIS_PORT` | `80` | HTTP port |
| `IRIS_HOST` | `0.0.0.0` | Listen on all interfaces |
| `IRIS_STATIC_DIR` | `/root/iris/webui/dist` | Built frontend path |
| `IRIS_DATA_DIR` | `/root/.iris` | Data directory |

To customize, edit `/etc/systemd/system/iris.service` on the server.

## Management Commands

View logs:
```bash
ssh your-vm.exe.xyz journalctl -u iris -f
```

Restart service:
```bash
ssh your-vm.exe.xyz systemctl restart iris
```

Stop service:
```bash
ssh your-vm.exe.xyz systemctl stop iris
```

Check status:
```bash
ssh your-vm.exe.xyz systemctl status iris
```

## Troubleshooting

### Deployment fails at SSH check
- Ensure you have SSH key access: `ssh your-vm.exe.xyz`
- For exe.dev, your key is configured automatically

### Service fails to start
Check logs for errors:
```bash
ssh your-vm.exe.xyz journalctl -u iris -n 50 --no-pager
```

Common issues:
- Port 80 already in use: Another service is using the port
- Missing dependencies: Re-run the deploy script

### Frontend not loading
1. Check that the build succeeded: `ssh your-vm.exe.xyz ls /root/iris/webui/dist/`
2. Check `IRIS_STATIC_DIR` is set correctly in the service file

## Manual Deployment

If you prefer manual deployment:

```bash
# SSH to server
ssh your-vm.exe.xyz

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone repository
git clone https://github.com/ericvicenti/iris.git
cd iris

# Install dependencies
bun install
cd webui && bun install && cd ..

# Build frontend
cd webui && bun run build && cd ..

# Copy service file
cp scripts/iris.service /etc/systemd/system/iris.service

# Enable and start
systemctl daemon-reload
systemctl enable iris
systemctl start iris
```

## Rollback

To rollback to a previous version:

```bash
ssh your-vm.exe.xyz
cd /root/iris
git log --oneline -10  # Find the commit to rollback to
git reset --hard <commit-hash>
bun install
cd webui && bun install && bun run build
systemctl restart iris
```

## Security Notes

- The service runs as root (simplest for exe.dev VMs)
- TLS is handled by exe.dev's proxy - traffic between proxy and app is HTTP
- CORS is currently permissive (`*`) - configure in production if needed
- Data is stored in `/root/.iris` - back up this directory

## Files

| File | Description |
|------|-------------|
| `scripts/deploy.ts` | Main deployment script |
| `scripts/iris.service` | Systemd service template |
| `src/server/app.ts` | Static file serving logic |
