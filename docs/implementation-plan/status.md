# Implementation Status

## Overview

This document tracks the implementation status of Iris. Each phase has been moved to its respective folder based on status:
- `completed/` - Finished phases
- `planned/` - Upcoming phases
- `abandoned/` - Phases no longer planned

---

## Completed (13 phases)

### Core Backend

| Phase | Document | Description |
|-------|----------|-------------|
| Database | [database.md](./completed/database.md) | SQLite with project DBs, migrations |
| Server | [server.md](./completed/server.md) | Hono server, middleware, config |
| Agent | [agent.md](./completed/agent.md) | AI SDK, tools, streaming |
| Workspace | [workspace.md](./completed/workspace.md) | Project isolation, management |
| Realtime | [realtime.md](./completed/realtime.md) | WebSocket protocol, rooms |
| Files | [files.md](./completed/files.md) | File operations, path safety |
| Missions & Tasks | [missions-tasks.md](./completed/missions-tasks.md) | Mission lifecycle, task tracking |
| Processes | [processes.md](./completed/processes.md) | PTY management, process streaming |
| Git | [git.md](./completed/git.md) | Git operations, SSH identity |

### WebUI

| Phase | Document | Description |
|-------|----------|-------------|
| Foundation | [webui-foundation.md](./completed/webui-foundation.md) | React, Router, Query, WebSocket |
| Shell | [webui-shell.md](./completed/webui-shell.md) | Tabs, sidebar, shortcuts |
| Editor | [editor.md](./completed/editor.md) | CodeMirror, file tree, operations |
| Git UI | [git-ui.md](./completed/git-ui.md) | Git panel, commits, sync, identity |
| Tasks UI | [tasks-ui.md](./completed/tasks-ui.md) | Chat interface, streaming, tools |

---

## Planned (3 phases)

| Phase | Document | Description |
|-------|----------|-------------|
| Multi-User | [multiuser.md](./planned/multiuser.md) | Authentication, collaboration |
| Processes UI | [processes-ui.md](./planned/processes-ui.md) | Terminal emulation (xterm.js) |
| Polish | [polish.md](./planned/polish.md) | Performance, accessibility, E2E |

---

## Abandoned (1 phase)

| Phase | Document | Reason |
|-------|----------|--------|
| Missions UI | [missions-ui.md](./abandoned/missions-ui.md) | Scope reduced - tasks UI sufficient for now |

---

## Progress Summary

- **Completed**: 13 phases (68%)
- **Planned**: 3 phases (16%)
- **Abandoned**: 1 phase (5%)

### Current Focus
The Tasks UI provides a complete chat interface with real-time streaming. Next priorities:
1. **Processes UI** - Terminal emulation for running commands
2. **Polish** - Performance optimization, accessibility, E2E tests
3. **Multi-User** - Authentication and collaboration (lower priority)

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Server | Hono |
| Database | SQLite (WAL mode) |
| AI SDK | Vercel AI SDK 6+ |
| Validation | Zod |
| Frontend | React 19, TanStack Router/Query |
| Editor | CodeMirror 6 |
| Testing | Vitest (frontend), Bun Test (backend) |

---

## Test Coverage

| Area | Tests |
|------|-------|
| Backend Unit | ~1000+ |
| Backend Integration | ~100+ |
| Frontend Unit | ~135 |
| Frontend E2E | ~27 |

All tests passing as of last update.
