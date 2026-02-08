# System Architecture

This document describes the high-level architecture of Botical, explaining how components interact and why architectural decisions were made.

---

## Overview

Botical follows a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                           │
│  Any client: CLI, Web, Desktop, Mobile, API integrations     │
└──────────────────────────────────────────────────────────────┘
                              │
                    WebSocket (primary) / HTTP
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     TRANSPORT LAYER                           │
│  • WebSocket Server (bidirectional, streaming)               │
│  • REST Endpoints (auth, uploads, health)                    │
│  • SSE Fallback (limited environments)                       │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Session  │ │  Agent   │ │   Tool   │ │  File    │        │
│  │ Service  │ │Orchestr. │ │ Registry │ │ Service  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Project  │ │   User   │ │Permission│ │ Presence │        │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    EVENT BUS LAYER                            │
│  • Typed publish/subscribe                                   │
│  • Internal component communication                          │
│  • WebSocket broadcast bridge                                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     STORAGE LAYER                             │
│  ┌─────────────────┐    ┌─────────────────────────────────┐  │
│  │    Root DB      │    │         Project DBs             │  │
│  │ (users, projects│    │ (one per project: sessions,     │  │
│  │  api_keys, etc.)│    │  messages, files, agents, etc.) │  │
│  └─────────────────┘    └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Principles

### 1. Headless-First Design
Botical is a backend-only system. It makes no assumptions about the client:
- No HTML rendering
- No UI framework dependencies
- All data exchange via structured JSON
- Any client can connect: CLI, web, mobile, desktop

### 2. Project Isolation
Each project is completely isolated:
- Separate SQLite database file
- Own file storage directory
- Independent session history
- Isolated agent configurations
- Project context via async local storage

### 3. Real-time Native
WebSocket is the primary protocol:
- Bidirectional communication
- Efficient streaming for LLM output
- Push notifications for all state changes
- Persistent connections for presence

### 4. Event-Driven Communication
Components communicate via typed events:
- Loose coupling between services
- Automatic client notifications
- Auditable state changes
- Easy to add new subscribers

---

## Component Descriptions

### Transport Layer

**WebSocket Server**
- Primary communication channel
- Handles all real-time operations
- Multiplexed channels per project/session
- Binary support for file transfers

**REST API**
- Sessions API: CRUD operations for conversation sessions
- Messages API: Send messages, trigger agent orchestration
- Agents API: List/create/update/delete agent configurations
- Authentication endpoints (magic link, sessions)
- Provider credentials management (encrypted API keys)
- Health checks and readiness probes

**SSE Fallback**
- For environments blocking WebSocket
- Read-only streaming
- Combined with REST for writes

### Service Layer

**Session Service**
- Create, read, update, delete sessions
- Message management within sessions
- Tracks usage statistics (tokens, cost)
- Manages session hierarchy (parent/child for sub-agents)

**Agent Orchestrator**
- Coordinates LLM interactions
- Manages the tool loop
- Handles streaming responses
- Spawns sub-agents via task tool

**Tool Registry**
- Registers built-in and custom tools
- Validates tool parameters
- Executes tools with context
- Enforces permissions

**File Service**
- Read, write, list files
- Version tracking with diffs
- Snapshot management
- File locking for concurrent edits

**Project Service**
- CRUD operations on projects
- Member management
- Project type handling (local, git, remote)
- Settings and configuration

**User Service**
- Authentication (password, OAuth)
- Profile management
- Preference storage
- API key generation

**Permission Service**
- Rule evaluation engine
- Tool access control
- User approval prompts
- Role-based access

**Presence Service**
- Track connected users
- Broadcast online status
- Current session awareness
- Typing indicators

### Event Bus Layer

The event bus provides decoupled communication:

```typescript
// Publishing an event
EventBus.publish(projectId, {
  type: 'message.text.delta',
  payload: { sessionId, messageId, delta: 'Hello' }
});

// Subscribing (internal)
EventBus.subscribe(projectId, (event) => {
  if (event.type === 'message.text.delta') {
    // Handle text delta
  }
});
```

Events automatically bridge to WebSocket:
1. Service publishes event to bus
2. Bus notifies all internal subscribers
3. WebSocket bridge receives event
4. Bridge broadcasts to clients in relevant rooms

### Storage Layer

**Root Database**
Global data shared across all projects:
- Users and authentication
- Project metadata and ownership
- API keys
- Provider credentials
- Global settings

**Project Databases**
Per-project isolated storage:
- Sessions and messages
- Message parts (text, tool calls, etc.)
- Custom agents and tools
- Files and versions
- Snapshots
- Permissions

---

## Key Flows

### User Sends a Message

```
1. Client → WebSocket: { type: 'session.message.send', message }
2. Handler validates request, creates user message
3. Agent Orchestrator receives message
4. Orchestrator calls LLM with streamText()
5. For each stream chunk:
   a. Orchestrator processes chunk
   b. Creates/updates message parts
   c. Publishes event to bus
   d. WebSocket broadcasts to clients
6. If tool call received:
   a. Permission service checks access
   b. Tool registry executes tool
   c. Result fed back to LLM
   d. Loop continues
7. On completion:
   a. Final message saved
   b. Usage statistics updated
   c. Completion event published
```

### Sub-Agent Spawning

```
1. Primary agent calls 'task' tool
2. Task tool creates child session (parentId set)
3. New Agent Orchestrator spawned for child
4. Child runs independently with restricted context
5. When child completes:
   a. Result collected
   b. Child session marked complete
   c. Result returned to parent as tool output
   d. Parent continues processing
```

### Project Context Flow

```
1. Request arrives with projectId
2. Middleware calls ProjectInstance.run(projectId)
3. Inside async local storage context:
   a. ProjectInstance.db → project's database
   b. ProjectInstance.project → project metadata
   c. All operations scoped to project
4. On completion/error:
   a. Context automatically cleaned up
   b. Resources released
```

---

## Database Architecture

### Why Multiple Databases?

**Benefits:**
- Complete project isolation
- Independent backup/restore per project
- No cross-project query accidents
- Smaller database files (faster operations)
- Easy project deletion (just delete DB file)
- Projects can be moved between servers

**Root DB Responsibilities:**
- User authentication and sessions
- Project registry and ownership
- Cross-project queries (list user's projects)
- Global configuration

**Project DB Responsibilities:**
- All project-specific data
- Sessions, messages, files
- Custom configurations
- Project history

### SQLite Choices

**WAL Mode (Write-Ahead Logging):**
- Better concurrent read/write performance
- Readers don't block writers
- Writers don't block readers
- Atomic commits

**Bun's Native Driver:**
- Zero-copy performance
- Built-in TypeScript support
- Synchronous API (simpler code)
- No external dependencies

---

## Scalability Considerations

### Single Server (Current)
- All projects on one machine
- Adequate for many users
- Simple deployment

### Future Horizontal Scaling
Architecture supports eventual scaling:
- Project databases can be sharded to different servers
- Event bus can use Redis pub/sub for cross-server
- WebSocket connections can be load-balanced
- Sticky sessions route users to correct server

---

## Security Model

### Authentication
- JWT tokens for user sessions
- API keys for programmatic access
- OAuth support for external providers

### Authorization
- Role-based access at project level
- Permission rules at tool level
- User approval for sensitive operations

### Isolation
- Project databases completely separate
- No shared state between projects
- Filesystem sandboxing for file operations

---

## Technology Choices

### Bun
- Fast TypeScript execution
- Native SQLite driver
- Built-in WebSocket support
- Modern JavaScript features

### Hono
- Lightweight web framework
- First-class TypeScript support
- Middleware composition
- Works with Bun natively

### Vercel AI SDK
- Unified API for multiple LLM providers
- Built-in tool calling support
- Streaming first design
- Agent orchestration patterns

### Zod
- Runtime type validation
- TypeScript inference
- Schema sharing (client/server)
- Error messages for debugging

### WebUI Stack
- **Vite** - Build tool with HMR and API proxy
- **React 19** - UI framework
- **TanStack Router** - File-based type-safe routing
- **TanStack Query** - Server state with caching
- **Tailwind CSS** - Utility-first styling

### SQLite
- Zero configuration
- File-based (easy deployment)
- Full SQL support
- Excellent performance for this scale

---

## Implementation Status

### Completed Components

**Phase 1: Foundation** ✅
- Database schema with migrations (SQLite/Bun)
- Multi-database architecture (root + project DBs)
- ID generation with type prefixes
- Error handling infrastructure

**Phase 2: Agent Core** ✅
- AgentOrchestrator for LLM coordination
- Tool Registry with built-in tools (read, write, edit, glob, grep, bash, task)
- LLM wrapper with streaming support
- Stream processor for real-time events
- Provider registry (Anthropic, OpenAI, Google)

**Phase 3: Real-time Communication** ✅
- WebSocket server with room management (`src/websocket/`)
- Connection tracking and authentication
- Event bus for internal pub/sub
- Protocol for bidirectional messaging
- Bus bridge for EventBus → WebSocket routing
- State synchronization for reconnection

**Phase 4: Agent System** ✅
- Built-in agents (default, explore, plan)
- Custom agent storage in project DBs
- Sub-agent spawning via task tool
- Permission system with rulesets
- Approval workflow for sensitive operations

**Phase 5: REST API** ✅
- Sessions API (`/api/sessions`)
- Messages API (`/api/messages`)
- Agents API (`/api/agents`)
- Authentication routes (`/auth`)
- Provider credentials routes (`/credentials`)
- Health endpoints (`/health`)

**Phase 6: Project Management** ✅
- Projects API (`/api/projects`)
- File versioning with snapshots
- Files API (`/api/files`)
- Snapshot rollback functionality

**Phase 7: Custom Tools & Todos** ✅
- Custom tool management (`/api/tools`)
- Todo tracking per session (`/api/todos`)
- Tool types: code, mcp, http

**Phase 8: WebSocket Testing** ✅
- Comprehensive unit tests (127 WebSocket tests)
- Integration tests for streaming and multi-client

**Phase 10: Missions & Tasks** ✅
- MissionService with lifecycle management (planning → pending → running → paused → completed)
- TaskService evolved from TodoService with backwards compatibility
- REST APIs for missions and tasks
- Plan document management

**Phase 11: Process Management** ✅
- ProcessService with PTY support via node-pty
- Full terminal emulation for commands and services
- Process output storage and streaming
- Scope-based lifecycle (task, mission, project)

**Phase 13: WebUI Foundation** ✅
- React 19 with Vite build tool
- TanStack Router for file-based routing
- TanStack Query for server state management
- WebSocket integration with auto-reconnect
- Tailwind CSS dark theme (Catppuccin Mocha)
- Total test count: 1175 tests passing

### Test Coverage

| Component | Tests |
|-----------|-------|
| WebSocket tests | 127 |
| Service tests | 200+ |
| Route tests | 300+ |
| Integration tests | 100+ |
| **Total Project** | **1175** |

### Pending Components

- MCP (Model Context Protocol) tool integration
- Orchestrator integration for custom tool execution
- Performance/load testing
- Production deployment hardening

---

## Related Documents

- [Data Model](./02-data-model.md) - Entity relationships and schemas
- [API Reference](./03-api-reference.md) - WebSocket and REST endpoints
- [Patterns](./04-patterns.md) - Common code patterns
- [Conventions](./05-conventions.md) - Coding standards
- [WebUI Architecture](./06-webui-architecture.md) - Frontend architecture
- [Implementation Overview](../implementation-plan/00-overview.md) - Detailed specs
