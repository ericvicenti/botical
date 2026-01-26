# Local Development with npx iris-ai

Run Iris locally with a single command - no setup required.

## Quick Start

```bash
npx iris-ai
```

That's it! The command handles everything:
1. Installs Bun runtime if needed
2. Downloads Iris to `~/.iris/app`
3. Installs dependencies
4. Builds the web interface
5. Starts the server and opens your browser

## How It Works

The `iris-ai` npm package is a lightweight CLI that bootstraps the full Iris application. It's designed to work on any system with Node.js 18+ installed.

### Installation Flow

```
npx iris-ai
     │
     ▼
┌─────────────────────────────────────┐
│ 1. Check for Bun runtime            │
│    - If missing, prompts to install │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ 2. Setup Iris (~/.iris/app)         │
│    - First run: git clone           │
│    - Subsequent: git pull           │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ 3. Install dependencies             │
│    - Backend: bun install           │
│    - Frontend: bun install          │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ 4. Build web interface              │
│    - bun run build (in webui/)      │
└─────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│ 5. Start server                     │
│    - Opens browser automatically    │
│    - Default port: 6001             │
└─────────────────────────────────────┘
```

### Data Storage

All Iris data is stored in `~/.iris/`:

| Path | Description |
|------|-------------|
| `~/.iris/app/` | Application files (git repo) |
| `~/.iris/iris.db` | Root database (users, projects) |
| `~/.iris/projects/` | Per-project SQLite databases |

## Command Line Options

```bash
npx iris-ai [options]
```

| Option | Description |
|--------|-------------|
| `--port, -p <port>` | Specify port (default: 6001) |
| `--update` | Force update to latest version |
| `--rebuild` | Force rebuild web interface |
| `--help, -h` | Show help message |
| `--version, -v` | Show version |

### Examples

```bash
# Start on default port (6001)
npx iris-ai

# Start on custom port
npx iris-ai -p 8080

# Force update and rebuild
npx iris-ai --update --rebuild
```

## Auto-Update Behavior

When you run `npx iris-ai`:
- If `~/.iris/app` doesn't exist: Full installation (git clone)
- If `~/.iris/app` exists: Checks for updates from GitHub
  - If updates available: Pulls latest, reinstalls dependencies, rebuilds
  - If up to date: Skips to server startup

Use `--update` to force a fresh pull even when up to date.

## Port Selection

The CLI automatically finds an available port:
1. Tries the requested port (or 6001 by default)
2. If occupied, increments and tries again
3. Notifies you if using a different port than requested

## Requirements

- **Node.js 18+**: Required to run the npx command
- **Bun**: Installed automatically if not present
- **Git**: Required for downloading/updating Iris
- **macOS, Linux, or Windows**: Cross-platform support

## Alternative: Direct Clone

If you prefer manual setup for development:

```bash
# Clone the repository
git clone https://github.com/ericvicenti/iris.git
cd iris

# Start development environment
bun dev
```

See the main README for full development setup.

## Troubleshooting

### Bun installation fails

If automatic Bun installation fails, install manually:
```bash
curl -fsSL https://bun.sh/install | bash
```

Then run `npx iris-ai` again.

### Port already in use

Use a different port:
```bash
npx iris-ai -p 8080
```

### Updates not applying

Force a complete update:
```bash
npx iris-ai --update --rebuild
```

### Browser doesn't open

Navigate manually to the URL shown in the terminal (e.g., `http://localhost:6001`).

### Permission errors on ~/.iris

Ensure you own the directory:
```bash
sudo chown -R $USER ~/.iris
```

## Related Documentation

- [Deployment Guide](./deployment.md) - Deploy to a server
- [Hosting Infrastructure](./hosting-infrastructure.md) - exe.dev hosting setup
- [Architecture](./knowledge-base/01-architecture.md) - System architecture
