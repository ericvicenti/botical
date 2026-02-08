# Botical Web UI

Web interface for the Botical AI agent platform - a mission-oriented development environment.

## Vision

Botical Web UI is a **lightweight IDE with AI agents at its core**. Users work across multiple projects via tabs, with AI-powered "missions" handling focused, autonomous work.

**Key Features:**
- Mission-first workflow (plan → approve → execute)
- Multi-project tab interface
- Integrated code editor
- Git operations built-in
- Command/service management
- Real-time agent collaboration

## Documentation

### Planning Documents

- [UI Structure & Navigation](./docs/ui-structure.md) - Layout, views, and navigation patterns
- [Tech Choices](./docs/tech-choices.md) - Framework, tooling, and architecture decisions
- [Backend Evolution](./docs/backend-evolution.md) - Server-side changes for missions/tasks/processes
- [Architecture Decisions](./docs/decisions.md) - Key decisions with rationale

### Implementation

See [docs/implementation-plan/10-webui-phases.md](../docs/implementation-plan/10-webui-phases.md) for the phased implementation plan (Phases 10-19).

## Core Concepts

```
Projects (long-lived, months to years)
├── Files & Folders
├── Git (branches, commits, remotes)
├── Services (dev servers, watchers)
├── Missions (planned, autonomous work)
│   ├── Planning Document
│   ├── Tasks
│   └── Commands
└── Tasks (immediate work units)
```

**Mission**: Planned work with a markdown document containing goals and completion criteria. Agent drafts the plan; user approves before execution begins.

**Task**: Immediate work - no planning, starts right away. Can exist within a mission or standalone.

**Service**: Long-lived process (dev server, etc.) bound to project/mission lifecycle.

**Command**: Short-lived process within a task.

## Development

```bash
cd webui
bun install
bun run dev
```

The dev server proxies API calls to the Botical backend.

## Tech Stack

- **React 19** - UI framework with Suspense/Transitions
- **Vite** - Build tool with fast HMR
- **TanStack Query** - Server state management
- **TanStack Router** - Type-safe routing
- **Tailwind CSS** - Utility-first styling
- **CodeMirror 6** - Code editor
- **xterm.js** - Terminal emulation
- **Radix UI** - Accessible primitives

## Project Structure

```
webui/
├── docs/                   # Planning documents
├── src/
│   ├── components/        # React components
│   │   ├── ui/           # Base components
│   │   ├── layout/       # Layout (tabs, sidebar)
│   │   ├── panels/       # Sidebar panels
│   │   ├── tabs/         # Tab content views
│   │   ├── missions/     # Mission components
│   │   ├── files/        # File tree, editor
│   │   ├── processes/    # Terminal, commands
│   │   └── git/          # Git panel, diff
│   ├── lib/              # Utilities
│   │   ├── api/         # API client
│   │   └── websocket/   # WebSocket client
│   ├── routes/           # Route components
│   ├── contexts/         # React contexts
│   ├── styles/           # Global styles
│   └── types/            # TypeScript types
└── tests/                 # Test files
```
