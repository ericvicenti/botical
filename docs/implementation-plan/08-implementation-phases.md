# Implementation Phases

## Overview

This document outlines a phased approach to implementing Iris. Each phase builds on the previous one, delivering incremental value while maintaining architectural integrity. **Every phase includes testing requirements that must pass before the phase is considered complete.**

---

## Phase 1: Foundation

**Goal**: Basic server with single-user agent functionality

### Database Setup
- [ ] Set up Bun project with TypeScript strict mode
- [ ] Implement SQLite database manager (root + project DBs)
- [ ] Create migration system
- [ ] Implement root database schema (users, projects)
- [ ] Implement project database schema (sessions, messages, parts)

### Server Core
- [ ] Set up Hono server with Bun
- [ ] Implement basic middleware (logging, error handling, CORS)
- [ ] Create health check endpoints
- [ ] Implement configuration system (file + env vars)

### Project System
- [ ] Implement project CRUD operations
- [ ] Create project discovery from filesystem path
- [ ] Implement project instance pattern (context isolation)
- [ ] Add project state management

### Event Bus
- [ ] Create typed event system with Zod schemas
- [ ] Implement pub/sub for internal events
- [ ] Add event serialization for persistence

### Phase 1 Testing Requirements

**Unit Tests** (minimum 90% coverage for new code):
```
tests/unit/
├── database/
│   ├── manager.test.ts          # Database connection management
│   ├── migrations.test.ts       # Migration system
│   └── queries.test.ts          # Query helpers
├── utils/
│   ├── id.test.ts               # ID generation
│   ├── config.test.ts           # Configuration loading
│   └── errors.test.ts           # Error types
└── bus/
    └── event-bus.test.ts        # Pub/sub functionality
```

**Integration Tests**:
```
tests/integration/
├── database-lifecycle.test.ts   # DB creation, migration, cleanup
├── project-crud.test.ts         # Project create, read, update, delete
└── event-propagation.test.ts    # Events flow correctly
```

**Validation Criteria**:
- [ ] `bun test:unit` passes with 90%+ coverage
- [ ] `bun test:integration` passes
- [ ] Server starts without errors: `bun run start`
- [ ] Health endpoint returns 200: `curl localhost:4096/health`
- [ ] Project can be created via direct service call
- [ ] Database files created in correct locations

**Deliverable**: Server that can create/manage projects and persist data

---

## Phase 2: Agent Core

**Goal**: Basic AI agent with tool execution

### AI SDK Integration
- [ ] Integrate Vercel AI SDK
- [ ] Implement provider registry (start with Anthropic)
- [ ] Create LLM wrapper with streaming
- [ ] Implement system prompt construction

### Session Management
- [ ] Implement session CRUD
- [ ] Create message storage (user + assistant)
- [ ] Implement message part system (text, tool calls, etc.)
- [ ] Add session history loading

### Tool System
- [ ] Define tool interface and context
- [ ] Implement tool registry
- [ ] Create core tools:
  - [ ] `read` - File reading
  - [ ] `write` - File writing
  - [ ] `edit` - File editing (search/replace)
  - [ ] `bash` - Command execution
  - [ ] `glob` - File pattern matching
  - [ ] `grep` - Content search

### Stream Processing
- [ ] Implement stream processor for AI SDK events
- [ ] Persist streaming parts to database
- [ ] Handle tool execution loop
- [ ] Implement error handling and retries

### Phase 2 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── agents/
│   ├── registry.test.ts         # Agent configuration
│   ├── llm.test.ts              # LLM wrapper
│   └── processor.test.ts        # Stream processing
├── services/
│   ├── sessions.test.ts         # Session CRUD
│   └── messages.test.ts         # Message storage
└── tools/
    ├── registry.test.ts         # Tool registration
    ├── read.test.ts             # Read tool
    ├── write.test.ts            # Write tool
    ├── edit.test.ts             # Edit tool
    ├── bash.test.ts             # Bash tool
    ├── glob.test.ts             # Glob tool
    └── grep.test.ts             # Grep tool
```

**Integration Tests**:
```
tests/integration/
├── session-flow.test.ts         # Full session lifecycle
├── message-persistence.test.ts  # Messages saved correctly
└── tool-execution.test.ts       # Tools execute and return results
```

**Agent Tests** (with mocked LLM):
```
tests/agents/
├── orchestrator.test.ts         # Agent orchestration
├── tool-loop.test.ts            # Tool execution loop
├── error-handling.test.ts       # LLM errors handled
└── streaming.test.ts            # Stream events processed
```

**Validation Criteria**:
- [ ] All unit tests pass with 85%+ coverage
- [ ] Integration tests pass
- [ ] Agent tests pass with mocked LLM
- [ ] Each tool has minimum 5 test cases covering:
  - Happy path
  - Error handling
  - Edge cases (empty input, large files, etc.)
  - Permission boundaries
  - Timeout behavior
- [ ] Manual test: Send prompt, receive streamed response

**Deliverable**: Working agent that can read/write files and execute commands

---

## Phase 3: Real-time Communication

**Goal**: WebSocket-based client communication

### WebSocket Server
- [ ] Implement WebSocket upgrade handler
- [ ] Create connection management
- [ ] Define message protocol (request/response/event)
- [ ] Implement authentication on connect

### Request Handlers
- [ ] Session operations (create, list, get, delete)
- [ ] Message operations (send, cancel, retry)
- [ ] Agent operations (list, create, update)
- [ ] Tool operations (list, approve, reject)

### Event Broadcasting
- [ ] Bridge internal events to WebSocket
- [ ] Implement room/channel management
- [ ] Create subscription system
- [ ] Handle reconnection state sync

### SSE Fallback
- [ ] Implement SSE endpoint for non-WebSocket clients
- [ ] Bridge same events to SSE stream

### Phase 3 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── websocket/
│   ├── protocol.test.ts         # Message format validation
│   ├── connections.test.ts      # Connection management
│   ├── rooms.test.ts            # Room/channel logic
│   └── handlers.test.ts         # Request handlers
└── sse/
    └── stream.test.ts           # SSE formatting
```

**WebSocket Tests**:
```
tests/websocket/
├── connection.test.ts           # Connect/disconnect
├── authentication.test.ts       # Auth on connect
├── messaging.test.ts            # Request/response
├── streaming.test.ts            # Event streaming
├── reconnection.test.ts         # State sync on reconnect
└── multiple-clients.test.ts     # Multi-client scenarios
```

**API Tests**:
```
tests/api/
├── sessions.test.ts             # Session endpoints
├── messages.test.ts             # Message endpoints
├── agents.test.ts               # Agent endpoints
└── health.test.ts               # Health endpoints
```

**Contract Tests**:
```
tests/contracts/
├── websocket-protocol.test.ts   # WS message schemas
├── api-responses.test.ts        # HTTP response schemas
└── event-schemas.test.ts        # Event payload schemas
```

**Validation Criteria**:
- [ ] All WebSocket tests pass
- [ ] API tests pass with schema validation
- [ ] Contract tests verify all message formats
- [ ] Load test: 100 concurrent WebSocket connections
- [ ] Latency test: < 50ms for simple requests
- [ ] Manual test: Connect via WebSocket client, send message, receive stream

**Deliverable**: Full real-time communication with streaming agent responses

---

## Phase 4: Advanced Agent Features

**Goal**: Sub-agents, custom tools, and enhanced workflows

### Agent Registry
- [ ] Implement agent configuration schema
- [ ] Create built-in agents (default, explore, plan)
- [ ] Support custom agent creation
- [ ] Implement agent-specific prompts and permissions

### Sub-Agent System
- [ ] Implement `task` tool for spawning sub-agents
- [ ] Create child session management
- [ ] Handle parent-child context passing
- [ ] Implement result aggregation

### Custom Code Tools
- [ ] Define custom tool schema
- [ ] Create tool code sandbox
- [ ] Implement parameter schema conversion
- [ ] Add tool execution permissions

### Permission System
- [ ] Implement permission ruleset evaluation
- [ ] Create tool-level permissions
- [ ] Add approval workflow for sensitive operations
- [ ] Implement permission persistence

### Phase 4 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── agents/
│   ├── builtin-agents.test.ts   # Built-in agent configs
│   ├── custom-agents.test.ts    # Custom agent creation
│   └── permissions.test.ts      # Permission evaluation
├── tools/
│   ├── task.test.ts             # Task/subagent tool
│   └── custom-tools.test.ts     # Custom tool loading
└── permissions/
    ├── ruleset.test.ts          # Ruleset evaluation
    └── approval.test.ts         # Approval workflow
```

**Integration Tests**:
```
tests/integration/
├── subagent-flow.test.ts        # Parent spawns child, gets result
├── custom-tool-execution.test.ts # Custom tool runs correctly
└── permission-enforcement.test.ts # Permissions block/allow correctly
```

**Agent Tests**:
```
tests/agents/
├── explore-agent.test.ts        # Explore agent behavior
├── plan-agent.test.ts           # Plan agent behavior
├── subagent-spawning.test.ts    # Task tool creates child sessions
└── permission-boundaries.test.ts # Agents respect permissions
```

**Security Tests**:
```
tests/security/
├── tool-sandbox.test.ts         # Custom tools sandboxed
├── path-traversal.test.ts       # No escape from project
└── permission-bypass.test.ts    # No permission bypass
```

**Validation Criteria**:
- [ ] Built-in agents tested with 10+ scenarios each
- [ ] Sub-agent round-trip works end-to-end
- [ ] Custom tools execute in sandbox
- [ ] Permission system blocks unauthorized operations
- [ ] Security tests pass (no sandbox escapes)

**Deliverable**: Extensible agent system with custom tools and sub-agents

---

## Phase 5: File Management

**Goal**: Comprehensive file operations with history

### File Service
- [ ] Implement file listing (recursive, pattern matching)
- [ ] Create file read with line limits
- [ ] Implement file write with validation
- [ ] Add file delete and move operations

### File Versioning
- [ ] Create version tracking on writes
- [ ] Implement diff-based patch storage
- [ ] Add version history retrieval
- [ ] Implement version restore

### Snapshot System
- [ ] Create project state snapshots
- [ ] Implement snapshot diff calculation
- [ ] Add snapshot restore functionality
- [ ] Link snapshots to sessions/messages

### File Watcher
- [ ] Implement filesystem watcher
- [ ] Detect external changes
- [ ] Broadcast file change events
- [ ] Handle conflict detection

### Phase 5 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── services/
│   ├── files.test.ts            # File CRUD operations
│   ├── file-versions.test.ts    # Version tracking
│   └── snapshots.test.ts        # Snapshot management
├── utils/
│   ├── diff.test.ts             # Diff/patch utilities
│   └── mime.test.ts             # MIME type detection
└── watcher/
    └── file-watcher.test.ts     # FS event handling
```

**Integration Tests**:
```
tests/integration/
├── file-lifecycle.test.ts       # Create, read, update, delete
├── version-history.test.ts      # Version chain integrity
├── snapshot-restore.test.ts     # Snapshot round-trip
└── external-changes.test.ts     # Watcher detects changes
```

**Performance Tests**:
```
tests/performance/
├── large-file-read.test.ts      # Read 10MB+ files
├── many-files-list.test.ts      # List 10K+ files
├── version-chain.test.ts        # 1000+ versions performance
└── concurrent-writes.test.ts    # Parallel write handling
```

**Validation Criteria**:
- [ ] File operations work on real filesystem
- [ ] Versions can be restored correctly
- [ ] Snapshots capture/restore full project state
- [ ] Large file handling (10MB+) works
- [ ] Directory with 10K files lists < 5 seconds

**Deliverable**: Full file management with undo/history capabilities

---

## Phase 6: Multi-User Support

**Goal**: Authentication and basic collaboration

### Authentication
- [ ] Implement user registration
- [ ] Create login with email/password
- [ ] Add JWT token generation/verification
- [ ] Implement API key system

### OAuth Integration
- [ ] Add GitHub OAuth provider
- [ ] Add Google OAuth provider
- [ ] Implement account linking

### Project Members
- [ ] Implement member invitation system
- [ ] Create role-based permissions (owner, admin, member, viewer)
- [ ] Add permission checking middleware
- [ ] Implement member management UI endpoints

### Presence System
- [ ] Track connected users per project
- [ ] Broadcast join/leave events
- [ ] Implement cursor position sharing
- [ ] Add activity indicators

### Phase 6 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── auth/
│   ├── registration.test.ts     # User registration
│   ├── login.test.ts            # Password login
│   ├── jwt.test.ts              # Token handling
│   └── api-keys.test.ts         # API key management
├── oauth/
│   ├── github.test.ts           # GitHub OAuth
│   └── google.test.ts           # Google OAuth
├── members/
│   ├── invitation.test.ts       # Invite flow
│   └── roles.test.ts            # Role permissions
└── presence/
    └── tracking.test.ts         # User presence
```

**Integration Tests**:
```
tests/integration/
├── auth-flow.test.ts            # Full auth lifecycle
├── oauth-flow.test.ts           # OAuth round-trip
├── member-access.test.ts        # Role-based access
└── presence-broadcast.test.ts   # Presence events
```

**Security Tests**:
```
tests/security/
├── password-hashing.test.ts     # Passwords properly hashed
├── token-validation.test.ts     # Invalid tokens rejected
├── role-enforcement.test.ts     # Roles actually enforced
└── api-key-security.test.ts     # API keys secure
```

**Validation Criteria**:
- [ ] Registration/login works end-to-end
- [ ] JWT tokens properly signed and validated
- [ ] OAuth flow completes (manual test with real providers)
- [ ] Role permissions enforced correctly
- [ ] Presence updates broadcast to all connected users

**Deliverable**: Multi-user access with role-based permissions

---

## Phase 7: Collaboration Features

**Goal**: Real-time collaboration and sharing

### Session Sharing
- [ ] Implement share link generation
- [ ] Create anonymous view access
- [ ] Add share link revocation
- [ ] Implement share analytics

### Concurrent Editing
- [ ] Create edit lock system
- [ ] Implement lock acquisition/release
- [ ] Add lock timeout and cleanup
- [ ] Broadcast lock status

### Audit Log
- [ ] Track all user actions
- [ ] Implement activity feed
- [ ] Add filtering and search
- [ ] Create export functionality

### Notifications
- [ ] Implement notification storage
- [ ] Add real-time notification delivery
- [ ] Create notification preferences
- [ ] Implement email notifications (optional)

### Phase 7 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── sharing/
│   ├── link-generation.test.ts  # Share link creation
│   └── access-validation.test.ts # Share access checks
├── locking/
│   ├── acquisition.test.ts      # Lock acquire/release
│   └── timeout.test.ts          # Lock expiration
├── audit/
│   ├── logging.test.ts          # Action logging
│   └── querying.test.ts         # Log queries
└── notifications/
    └── delivery.test.ts         # Notification dispatch
```

**Integration Tests**:
```
tests/integration/
├── share-flow.test.ts           # Share link lifecycle
├── concurrent-users.test.ts     # Multi-user editing
├── audit-trail.test.ts          # Actions logged correctly
└── notification-flow.test.ts    # Notifications delivered
```

**Multi-User Tests**:
```
tests/multiuser/
├── two-users-same-session.test.ts  # Concurrent viewing
├── lock-contention.test.ts         # Lock conflict handling
├── presence-accuracy.test.ts       # Presence state correct
└── event-ordering.test.ts          # Events in order
```

**Validation Criteria**:
- [ ] Share links work for anonymous users
- [ ] Locks prevent conflicting edits
- [ ] All actions logged in audit trail
- [ ] Two simultaneous users see each other's presence
- [ ] Events arrive in correct order

**Deliverable**: Collaborative workspace with sharing and activity tracking

---

## Phase 8: Production Readiness

**Goal**: Stability, performance, and observability

### Error Handling
- [ ] Comprehensive error types
- [ ] Structured error responses
- [ ] Error logging and tracking
- [ ] User-friendly error messages

### Performance
- [ ] Database query optimization
- [ ] Connection pooling
- [ ] Response caching where appropriate
- [ ] Large file handling

### Observability
- [ ] Structured logging
- [ ] Request tracing
- [ ] Metrics collection
- [ ] Health monitoring

### Security
- [ ] Input validation audit
- [ ] Rate limiting
- [ ] CORS configuration
- [ ] Secrets management

### Documentation
- [ ] API documentation (OpenAPI)
- [ ] Client SDK documentation
- [ ] Deployment guide
- [ ] Configuration reference

### Phase 8 Testing Requirements

**Performance Tests**:
```
tests/performance/
├── api-latency.test.ts          # P50, P95, P99 latencies
├── websocket-throughput.test.ts # Messages per second
├── database-load.test.ts        # Concurrent DB operations
├── memory-usage.test.ts         # Memory under load
└── connection-scaling.test.ts   # 500+ connections
```

**Load Tests**:
```
tests/load/
├── sustained-load.test.ts       # 1 hour steady load
├── spike-handling.test.ts       # Traffic spikes
└── recovery.test.ts             # Recovery after overload
```

**Security Audit**:
```
tests/security/
├── input-validation.test.ts     # All inputs validated
├── injection-prevention.test.ts # SQL, command injection
├── rate-limiting.test.ts        # Rate limits work
└── auth-bypass.test.ts          # No auth bypasses
```

**End-to-End Tests**:
```
tests/e2e/
├── full-workflow.test.ts        # Complete user journey
├── error-recovery.test.ts       # Graceful error handling
└── data-integrity.test.ts       # Data consistent after operations
```

**Validation Criteria**:
- [ ] P95 API latency < 100ms
- [ ] P99 API latency < 500ms
- [ ] Handles 500 concurrent WebSocket connections
- [ ] No memory leaks over 1 hour
- [ ] All security tests pass
- [ ] OpenAPI spec validates
- [ ] E2E tests pass

**Deliverable**: Production-ready server with comprehensive documentation

---

## Test Infrastructure

### Required Test Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:api": "vitest run tests/api",
    "test:websocket": "vitest run tests/websocket",
    "test:agents": "vitest run tests/agents",
    "test:security": "vitest run tests/security",
    "test:performance": "vitest run tests/performance",
    "test:e2e": "vitest run tests/e2e",
    "test:phase1": "vitest run --config vitest.phase1.config.ts",
    "test:phase2": "vitest run --config vitest.phase2.config.ts",
    "test:phase3": "vitest run --config vitest.phase3.config.ts",
    "test:phase4": "vitest run --config vitest.phase4.config.ts",
    "test:phase5": "vitest run --config vitest.phase5.config.ts",
    "test:phase6": "vitest run --config vitest.phase6.config.ts",
    "test:phase7": "vitest run --config vitest.phase7.config.ts",
    "test:phase8": "vitest run --config vitest.phase8.config.ts"
  }
}
```

### Coverage Requirements by Phase

| Phase | Unit Coverage | Integration Coverage | Overall |
|-------|--------------|---------------------|---------|
| 1     | 90%          | 80%                 | 85%     |
| 2     | 85%          | 75%                 | 80%     |
| 3     | 85%          | 80%                 | 82%     |
| 4     | 85%          | 75%                 | 80%     |
| 5     | 85%          | 80%                 | 82%     |
| 6     | 90%          | 85%                 | 87%     |
| 7     | 85%          | 80%                 | 82%     |
| 8     | 90%          | 90%                 | 90%     |

---

## Technology Decisions

### Runtime: Bun
- Native SQLite support
- Fast TypeScript execution
- Built-in WebSocket support
- Compatible with npm ecosystem

### Framework: Hono
- Lightweight and fast
- WebSocket support via Bun adapter
- OpenAPI/Swagger integration
- Middleware ecosystem

### Database: SQLite
- Zero configuration
- File-based (easy backup/portability)
- WAL mode for concurrency
- Bun's native driver for performance

### AI SDK: Vercel AI SDK 6+
- Unified API across providers
- Built-in streaming
- Tool execution support
- Agent patterns (ToolLoopAgent)

### Validation: Zod
- TypeScript-first schema validation
- Runtime type checking
- Shared schemas between client/server
- JSON Schema generation for OpenAPI

### Testing: Vitest
- Bun compatible
- Fast parallel execution
- Built-in coverage
- Watch mode for development

---

## Directory Structure

```
iris/
├── src/
│   ├── server/
│   ├── database/
│   ├── services/
│   ├── agents/
│   ├── tools/
│   ├── bus/
│   ├── schemas/
│   ├── utils/
│   └── config/
├── tests/
│   ├── unit/           # Unit tests mirror src/ structure
│   ├── integration/    # Cross-component tests
│   ├── api/            # HTTP endpoint tests
│   ├── websocket/      # WebSocket tests
│   ├── agents/         # Agent behavior tests
│   ├── security/       # Security audit tests
│   ├── performance/    # Performance benchmarks
│   ├── e2e/            # End-to-end scenarios
│   ├── mocks/          # Shared mocks
│   ├── factories/      # Test data factories
│   └── setup.ts        # Global test setup
├── docs/
│   ├── implementation-plan/
│   └── knowledge-base/
├── AGENTS.md           # AI agent instructions
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── bunfig.toml
```

---

## Risks and Mitigations

### SQLite Concurrency
- **Risk**: Write contention under load
- **Mitigation**: WAL mode, connection pooling, application-level locks
- **Test**: `tests/performance/concurrent-writes.test.ts`

### WebSocket Scaling
- **Risk**: Many concurrent connections
- **Mitigation**: Efficient broadcast, room-based targeting, connection limits
- **Test**: `tests/performance/connection-scaling.test.ts`

### Tool Security
- **Risk**: Malicious tool execution
- **Mitigation**: Sandboxing, permission system, audit logging
- **Test**: `tests/security/tool-sandbox.test.ts`

### AI Provider Outages
- **Risk**: Upstream provider failures
- **Mitigation**: Multiple provider support, retry logic, graceful degradation
- **Test**: `tests/agents/error-handling.test.ts`
