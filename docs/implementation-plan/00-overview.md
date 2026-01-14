# Iris Backend Implementation Overview

## Vision

Iris is a headless backend server that provides a full-featured AI agent workspace. It exposes the functionality of the Vercel AI SDK through a WebSocket-first API, enabling efficient real-time communication with AI agents that help users accomplish work within organized projects.

## Core Principles

1. **Headless First**: The backend is completely UI-agnostic. Any client (CLI, web, desktop, mobile) can connect via WebSocket.
2. **Project-Centric**: Work is organized into projects, each with its own database, files, and agent sessions.
3. **Real-time Native**: WebSocket is the primary communication channel for efficiency and streaming.
4. **Multi-User Ready**: Architecture supports collaborative features from day one.
5. **SQLite-Backed**: Persistent, portable, and performant data storage.

## Technology Stack

- **Runtime**: Bun (fast TypeScript runtime with native SQLite support)
- **Language**: TypeScript (strict mode)
- **AI SDK**: Vercel AI SDK 6+ (agents, tools, streaming)
- **Database**: SQLite (Bun's native driver, one per project + root)
- **Server**: Hono (lightweight, fast, WebSocket support via Bun)
- **Validation**: Zod (schema validation, shared between client/server)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│  (CLI, Web UI, Desktop App, Mobile App, External Integrations)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Iris Backend Server                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    API Layer (Hono)                         ││
│  │  • WebSocket Handler (primary)                              ││
│  │  • REST Endpoints (health, uploads, auth)                   ││
│  │  • SSE Fallback (for environments without WebSocket)        ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Core Services                             ││
│  │  • Session Manager (conversations, messages)                ││
│  │  • Agent Orchestrator (AI SDK integration)                  ││
│  │  • Tool Registry (built-in + custom tools)                  ││
│  │  • Project Manager (workspace isolation)                    ││
│  │  • File Manager (per-project file operations)               ││
│  │  • User Manager (auth, permissions)                         ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Event Bus                                 ││
│  │  • Pub/Sub for internal events                              ││
│  │  • Broadcasts to connected clients                          ││
│  │  • Cross-project notifications                              ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Storage Layer                             ││
│  │  • Root DB (users, projects, global settings)               ││
│  │  • Project DBs (sessions, messages, files, agents)          ││
│  │  • File Storage (per-project file system)                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Key Entities

### Root Level
- **Users**: Authentication, profiles, global preferences
- **Projects**: Metadata, ownership, sharing settings
- **Global Config**: Server settings, API keys, feature flags

### Project Level
- **Sessions**: Conversation threads with agents
- **Messages**: Individual messages (user + assistant)
- **Parts**: Message components (text, tool calls, files, etc.)
- **Agents**: Custom agent configurations
- **Tools**: Custom tool definitions
- **Files**: Project file storage

## Design Patterns (Learned from OpenCode)

### 1. Identifier System
Use descending/ascending identifiers for natural ordering:
- Sessions: Descending (newest first)
- Messages/Parts: Ascending (chronological order)

### 2. Event-Driven Architecture
- Internal Bus for service communication
- Events broadcast to all connected WebSocket clients
- Typed events with Zod schemas

### 3. Instance Pattern
- Each project runs as an isolated "instance"
- State is scoped to project context
- Clean disposal when project is closed

### 4. Permission System
- Rule-based permission evaluation
- Per-agent permission rulesets
- Tool-level access control

## Document Index

1. [Database Schema](./01-database-schema.md) - SQLite structure for root and project databases
2. [Server Architecture](./02-server-architecture.md) - Hono server, routing, middleware
3. [Agent System](./03-agent-system.md) - AI SDK integration, tool execution
4. [Project Workspace](./04-project-workspace.md) - Project management, isolation
5. [Real-time Communication](./05-realtime-communication.md) - WebSocket protocol
6. [Multi-User Collaboration](./06-multi-user-collaboration.md) - Auth, sharing, presence
7. [File Management](./07-file-management.md) - Per-project file operations
8. [Implementation Phases](./08-implementation-phases.md) - Development roadmap

## Sources

- [Vercel AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Agents](https://ai-sdk.dev/docs/agents)
- [OpenCode Repository](https://github.com/sst/opencode)
