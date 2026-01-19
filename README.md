# Iris

AI-powered development environment with a Bun backend and React frontend.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0 or later

### Development

```bash
git clone <repository-url>
cd iris
bun dev
```

The dev script will:
- Install dependencies automatically (both root and webui)
- Find available ports (auto-increments if 4096/5173 are in use)
- Start backend and frontend servers
- Open browser when ready

You can run multiple instances in parallel - each will find its own ports.

**Individual server commands:**
```bash
bun dev:server  # Backend only (port 4096)
bun dev:webui   # Frontend only (port 5173)
```

**Dev Mode Features:**
- Magic link tokens are logged to console (no email provider needed)
- Insecure encryption key used (with warning)
- Hot reload enabled

### Production

See [Deployment Guide](docs/deployment-guide.md) for Ubuntu VPS deployment with systemd.

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Server
IRIS_PORT=4096              # Server port (default: 4096)
IRIS_HOST=localhost         # Server host (default: localhost)
IRIS_DATA_DIR=~/.iris       # Data directory (default: ~/.iris)
IRIS_LOG_LEVEL=info         # Log level: debug|info|warn|error

# Environment
NODE_ENV=development        # development|production|test

# Auth & Email
APP_URL=http://localhost:4096  # Base URL for magic links
RESEND_API_KEY=re_xxxxx        # Resend API key (optional in dev)
EMAIL_FROM=noreply@iris.local  # From address for emails

# Security (REQUIRED in production)
IRIS_ENCRYPTION_KEY=xxx        # Key for encrypting provider credentials
```

### Required for Production

| Variable | Description |
|----------|-------------|
| `IRIS_ENCRYPTION_KEY` | Used to encrypt stored API keys. Generate with: `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend API key for sending magic link emails |
| `APP_URL` | Public URL of your Iris instance (for magic links) |

## Authentication

Iris uses **email-based magic link authentication**:

1. User submits email at `POST /auth/magic-link`
2. Receives email with login link (or see console in dev mode)
3. Clicks link to authenticate: `GET /auth/verify?token=xxx`
4. Session cookie set, user is logged in

### First User

The **first registered user** automatically becomes an admin with code execution privileges.

### User Trust Levels

| Level | Capabilities |
|-------|-------------|
| Admin | Full access, code execution, manage users |
| Trusted | Code execution, full project access |
| Regular | Read/write projects, no code execution |

## API Keys

Users must configure their own AI provider API keys after login:

```bash
# Store an OpenAI key
POST /credentials
{
  "provider": "openai",
  "apiKey": "sk-xxx...",
  "name": "My OpenAI Key",
  "isDefault": true
}
```

Supported providers: `openai`, `anthropic`, `google`

Keys are encrypted at rest using AES-256-GCM.

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/magic-link` | Request magic link email |
| GET | `/auth/verify` | Verify magic link token |
| POST | `/auth/logout` | Logout (revoke session) |
| GET | `/auth/me` | Get current user |
| GET | `/auth/sessions` | List active sessions |
| DELETE | `/auth/sessions/:id` | Revoke specific session |

### Provider Credentials

| Method | Path | Description |
|--------|------|-------------|
| GET | `/credentials` | List all credentials |
| POST | `/credentials` | Create new credential |
| GET | `/credentials/:id` | Get credential details |
| PATCH | `/credentials/:id` | Update credential |
| DELETE | `/credentials/:id` | Delete credential |
| GET | `/credentials/check` | Check configured providers |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/ready` | Readiness (database check) |
| GET | `/health/live` | Liveness (process running) |

## Development

### Commands

```bash
bun dev              # Start full dev environment
bun dev:server       # Backend server only
bun dev:webui        # Frontend only
bun start            # Production start
bun typecheck        # TypeScript checking
bun test             # Run all tests
bun test:unit        # Unit tests only
bun test:integration # Integration tests only
```

### Project Structure

```
iris/
├── src/
│   ├── auth/           # Authentication (magic link, sessions)
│   ├── bus/            # Event bus for internal events
│   ├── config/         # Configuration management
│   ├── database/       # SQLite database management
│   ├── server/         # Hono HTTP server
│   │   ├── middleware/ # Request middleware
│   │   └── routes/     # API routes
│   ├── services/       # Business logic services
│   └── utils/          # Utilities (errors, IDs)
├── tests/              # Test suite
├── docs/               # Documentation
│   ├── knowledge-base/ # Core concepts
│   └── implementation-plan/  # Detailed specs
└── AGENTS.md           # AI agent instructions
```

### Database Architecture

Iris uses a multi-database architecture:

- **Root Database** (`iris.db`): Users, projects, API keys, credentials
- **Project Databases** (per project): Sessions, messages, files

This enables complete project isolation and easy backup/restore.

## Documentation

- [Architecture](docs/knowledge-base/01-architecture.md) - System design
- [Data Model](docs/knowledge-base/02-data-model.md) - Entity relationships
- [API Reference](docs/knowledge-base/03-api-reference.md) - API documentation
- [Patterns](docs/knowledge-base/04-patterns.md) - Code patterns
- [Deployment Guide](docs/deployment-guide.md) - Production deployment

## License

MIT
