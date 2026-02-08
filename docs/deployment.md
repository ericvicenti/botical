# Deployment Guide

Deploy Botical to an exe.dev server with a single command.

> **Other deployment options:**
> - [Local Development](./local-development.md) - Run locally with `npx botical`
> - [Hosting Infrastructure](./hosting-infrastructure.md) - Production setup details for botical.vicenti.net
> - [Traditional VPS](./deployment-guide.md) - Ubuntu/Nginx deployment

## Quick Start

```bash
bun scripts/deploy.ts <hostname>
```

Example:
```bash
bun scripts/deploy.ts botical-vicenti.exe.xyz
```

## Prerequisites

1. **SSH Access**: You must have SSH key-based access to the target server
2. **exe.dev Server**: The target should be an exe.dev VM (or any Linux server with systemd)

## What the Deploy Script Does

The script is **idempotent** - safe to run multiple times:

| Step | First Run | Subsequent Runs |
|------|-----------|-----------------|
| 1. Check SSH | Connects, detects user/home | Connects |
| 2. Install Bun | Installs | Skips (already installed) |
| 3. Setup GitHub SSH | Generates deploy key | Verifies access |
| 4. Clone/Update Repo | `git clone` | `git reset --hard origin/main` |
| 5. Install Dependencies | Full install | Updates only |
| 6. Build Frontend | Builds | Rebuilds |
| 7. Install Service | Creates | Overwrites |
| 8. Restart Service | Starts | Restarts |
| 9. Configure Proxy | Sets port 8000, makes public | No-op |

### Deploy Key Setup

On first run, if the server can't access GitHub, the script will:
1. Generate an SSH key on the server
2. Display the public key
3. Ask you to add it as a deploy key at `https://github.com/<owner>/<repo>/settings/keys`
4. Exit - run the script again after adding the key

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
    ▼ HTTP (port 8000)
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
   botical.example.com  CNAME  your-vm.exe.xyz
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
| `BOTICAL_PORT` | `8000` | HTTP port (exe.dev requires 3000-9999) |
| `BOTICAL_HOST` | `0.0.0.0` | Listen on all interfaces |
| `BOTICAL_STATIC_DIR` | `$HOME/botical/webui/dist` | Built frontend path |
| `BOTICAL_DATA_DIR` | `$HOME/.botical` | Data directory |

To customize, edit `/etc/systemd/system/botical.service` on the server.

## Management Commands

View logs:
```bash
ssh your-vm.exe.xyz journalctl -u botical -f
```

Restart service:
```bash
ssh your-vm.exe.xyz systemctl restart botical
```

Stop service:
```bash
ssh your-vm.exe.xyz systemctl stop botical
```

Check status:
```bash
ssh your-vm.exe.xyz systemctl status botical
```

## Troubleshooting

### Deployment fails at SSH check
- Ensure you have SSH key access: `ssh your-vm.exe.xyz`
- For exe.dev, your key is configured automatically

### Service fails to start
Check logs for errors:
```bash
ssh your-vm.exe.xyz journalctl -u botical -n 50 --no-pager
```

Common issues:
- Port 80 already in use: Another service is using the port
- Missing dependencies: Re-run the deploy script

### Frontend not loading
1. Check that the build succeeded: `ssh your-vm.exe.xyz ls /root/botical/webui/dist/`
2. Check `BOTICAL_STATIC_DIR` is set correctly in the service file

## Manual Deployment

If you prefer manual deployment:

```bash
# SSH to server
ssh your-vm.exe.xyz

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone repository
git clone https://github.com/ericvicenti/botical.git
cd botical

# Install dependencies
bun install
cd webui && bun install && cd ..

# Build frontend
cd webui && bun run build && cd ..

# Copy service file
cp scripts/botical.service /etc/systemd/system/botical.service

# Enable and start
systemctl daemon-reload
systemctl enable botical
systemctl start botical
```

## Rollback

To rollback to a previous version:

```bash
ssh your-vm.exe.xyz
cd /root/botical
git log --oneline -10  # Find the commit to rollback to
git reset --hard <commit-hash>
bun install
cd webui && bun install && bun run build
systemctl restart botical
```

## Security Notes

- The service runs as root (simplest for exe.dev VMs)
- TLS is handled by exe.dev's proxy - traffic between proxy and app is HTTP
- CORS is currently permissive (`*`) - configure in production if needed
- Data is stored in `/root/.botical` - back up this directory

## Continuous Deployment (GitHub Actions)

Set up automatic deploys on every push to main:

### 1. Get a Runner Token

Go to: https://github.com/ericvicenti/botical/settings/actions/runners/new?arch=x64&os=linux

Copy the token from the `./config.sh` command (starts with `A...`).

### 2. Run the Setup Script

```bash
bun scripts/setup-runner.ts botical-vicenti.exe.xyz <TOKEN>
```

This installs and configures a self-hosted GitHub Actions runner on your server.

### 3. Done!

Every push to `main` will now trigger automatic deployment. View runs at:
https://github.com/ericvicenti/botical/actions

### Runner Management

```bash
# View runner status
ssh botical-vicenti.exe.xyz sudo systemctl status gh-actions-runner

# View runner logs
ssh botical-vicenti.exe.xyz sudo journalctl -u gh-actions-runner -f

# Restart runner
ssh botical-vicenti.exe.xyz sudo systemctl restart gh-actions-runner
```

## Files

| File | Description |
|------|-------------|
| `scripts/deploy.ts` | Main deployment script |
| `scripts/setup-runner.ts` | GitHub Actions runner setup |
| `scripts/botical.service` | Systemd service template |
| `.github/workflows/deploy.yml` | CI/CD workflow |
| `src/server/app.ts` | Static file serving logic |

## Related Documentation

- [Local Development](./local-development.md) - Run locally with `npx botical`
- [Hosting Infrastructure](./hosting-infrastructure.md) - Production setup for botical.vicenti.net
- [Traditional VPS Guide](./deployment-guide.md) - Ubuntu/Nginx deployment
- [Architecture](./knowledge-base/01-architecture.md) - System architecture
