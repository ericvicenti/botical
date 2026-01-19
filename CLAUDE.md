# Iris Project Knowledge Base

## Project Overview

Iris is an AI-powered development environment with a Bun backend and React frontend (webui).

## Architecture

### Backend (`/src`)
- **Server**: Hono-based HTTP/WebSocket server (`src/server/`)
- **Database**: SQLite with project-specific databases (`src/database/`)
- **Services**: Process management, service configuration (`src/services/`)
- **Tools**: AI agent tools for file operations, bash, services (`src/tools/`)

### Frontend (`/webui`)
- **Framework**: React with TanStack Router and Query
- **State**: React Context for UI state, tabs management
- **Components**: Layout, processes, tasks, files
- **Commands**: Command palette with keyboard shortcuts

## Key Patterns

### Keyboard Shortcuts (webui)
The command system supports keyboard shortcuts with modifiers:
- `mod`: Cmd on Mac, Ctrl on Windows (for primary shortcuts like Cmd+S)
- `ctrl`: Ctrl key specifically on all platforms
- `alt`: Option/Alt key
- `shift`: Shift key

**Important**: On Mac, Option+letter produces special characters (e.g., Option+W = "∑").
The `eventToShortcut` function in `registry.ts` uses `e.code` instead of `e.key` when
alt/ctrl modifiers are pressed to get the physical key:
- `e.code.startsWith("Key")` → extract letter (KeyW → w)
- `e.code.startsWith("Digit")` → extract digit (Digit5 → 5)
- `e.code === "BracketLeft"` → "["
- `e.code === "BracketRight"` → "]"

### Tab System (webui)
- Tabs are stored in context with localStorage persistence
- Each tab has: id, type, label, data, dirty flag
- Tab types: projects, project, mission, file, process, task, settings, create-project
- Preview tabs: When URL doesn't match any open tab, shows italic preview tab
- URL parsing in TabBar syncs browser navigation with tab state

### UI State Persistence (webui)
Stored in localStorage under `iris:ui`:
- `selectedProjectId`: Current project
- `sidebarWidth`: Resizable sidebar width (180-480px)
- `sidebarCollapsed`: Boolean
- `sidebarPanel`: "tasks" | "files" | "git" | "run"

### Service Management (backend)
- Services are persistent process configurations stored in database
- Support auto-start on server startup
- Logs persisted to filesystem at `{project.path}/.iris/logs/{processId}.log`

## Running the Project

```bash
# Install dependencies
bun install

# Start backend server
bun run src/server/server.ts

# Start frontend dev server
cd webui && bun run dev
```

## File Structure

```
src/
├── database/          # SQLite migrations and queries
├── server/            # Hono HTTP/WS server, routes
├── services/          # Process manager, service config/runner
├── tools/             # AI agent tools
└── utils/             # Shared utilities

webui/src/
├── commands/          # Command palette, shortcuts, registry
├── components/        # React components
├── contexts/          # React contexts (tabs, ui)
├── lib/api/           # TanStack Query hooks, API types
├── routes/            # TanStack Router pages
└── types/             # TypeScript types
```
