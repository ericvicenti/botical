# iris-ai

Run [Iris](https://github.com/ericvicenti/iris) AI Agent Workspace locally with a single command.

## Quick Start

```bash
npx iris-ai
```

That's it! The command will:

1. Install [Bun](https://bun.sh) if needed (fast JavaScript runtime)
2. Download Iris to `~/.iris/app`
3. Build the web interface
4. Start the server and open your browser

## Options

```bash
npx iris-ai [options]

Options:
  --port, -p <port>   Specify port (default: 6001)
  --update            Force update to latest version
  --rebuild           Force rebuild the web interface
  --help, -h          Show help
  --version, -v       Show version
```

## Examples

```bash
# Start on default port (6001)
npx iris-ai

# Start on a specific port
npx iris-ai -p 8080

# Update to latest version and start
npx iris-ai --update
```

## Data Storage

All data is stored in `~/.iris/`:

```
~/.iris/
├── app/              # Application files
├── iris.db           # Root database
└── projects/         # Your project data
    └── {projectId}/
        └── project.db
```

## Requirements

- **Node.js 18+** (for npx)
- **Git** (for downloading Iris)
- **macOS, Linux, or WSL** (Windows native coming soon)

Bun will be installed automatically if not present.

## What is Iris?

Iris is a headless backend server for AI agent workspaces. It provides:

- Real-time WebSocket API for agent communication
- Per-project SQLite databases for isolation
- Vercel AI SDK integration for LLM interactions
- Multi-user collaboration support
- Built-in tools for file operations, git, and shell commands

## License

MIT
