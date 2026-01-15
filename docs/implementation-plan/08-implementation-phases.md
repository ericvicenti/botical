# Implementation Phases

## Overview

This document outlines a phased approach to implementing Iris. Each phase builds on the previous one, delivering incremental value while maintaining architectural integrity. **Every phase includes testing requirements that must pass before the phase is considered complete.**

---

## Phase 1: Foundation ✅ COMPLETE

**Goal**: Basic server with single-user agent functionality

### Database Setup
- [x] Set up Bun project with TypeScript strict mode
- [x] Implement SQLite database manager (root + project DBs)
- [x] Create migration system
- [x] Implement root database schema (users, projects)
- [x] Implement project database schema (sessions, messages, parts)

### Server Core
- [x] Set up Hono server with Bun
- [x] Implement basic middleware (logging, error handling, CORS)
- [x] Create health check endpoints
- [x] Implement configuration system (file + env vars)

### Project System
- [x] Implement project CRUD operations
- [x] Create project discovery from filesystem path
- [x] Implement project instance pattern (context isolation)
- [x] Add project state management

### Event Bus
- [x] Create typed event system with Zod schemas
- [x] Implement pub/sub for internal events
- [x] Add event serialization for persistence

### Phase 1 Testing Requirements

**Validation Criteria**:
- [x] `bun test:unit` passes with 90%+ coverage
- [x] `bun test:integration` passes
- [x] Server starts without errors: `bun run start`
- [x] Health endpoint returns 200: `curl localhost:4096/health`
- [x] Project can be created via direct service call
- [x] Database files created in correct locations

**Deliverable**: Server that can create/manage projects and persist data

---

## Phase 2: Agent Core ✅ COMPLETE

**Goal**: Basic AI agent with tool execution

### AI SDK Integration
- [x] Integrate Vercel AI SDK
- [x] Implement provider registry (Anthropic, OpenAI, Google)
- [x] Create LLM wrapper with streaming
- [x] Implement system prompt construction

### Session Management
- [x] Implement session CRUD
- [x] Create message storage (user + assistant)
- [x] Implement message part system (text, tool calls, etc.)
- [x] Add session history loading

### Tool System
- [x] Define tool interface and context
- [x] Implement tool registry
- [x] Create core tools:
  - [x] `read` - File reading
  - [x] `write` - File writing
  - [x] `edit` - File editing (search/replace)
  - [x] `bash` - Command execution
  - [x] `glob` - File pattern matching
  - [x] `grep` - Content search

### Stream Processing
- [x] Implement stream processor for AI SDK events
- [x] Persist streaming parts to database
- [x] Handle tool execution loop
- [x] Implement error handling and retries

### Phase 2 Testing Requirements

**Validation Criteria**:
- [x] All unit tests pass with 85%+ coverage
- [x] Integration tests pass
- [x] Agent tests pass with mocked LLM
- [x] Each tool has minimum 5 test cases covering:
  - Happy path
  - Error handling
  - Edge cases (empty input, large files, etc.)
  - Permission boundaries
  - Timeout behavior
- [x] Manual test: Send prompt, receive streamed response

**Deliverable**: Working agent that can read/write files and execute commands

---

## Phase 3: Real-time Communication ✅ COMPLETE

**Goal**: WebSocket-based client communication

### WebSocket Server
- [x] Implement WebSocket upgrade handler (`src/websocket/handler.ts`)
- [x] Create connection management (`src/websocket/connections.ts`)
- [x] Define message protocol (request/response/event) (`src/websocket/protocol.ts`)
- [x] Implement authentication on connect (token & API key support)

### Request Handlers
- [x] Session operations (create, list, get, delete)
- [x] Tool operations (approve, reject)
- [x] Subscription operations (subscribe, unsubscribe)
- [x] Ping/pong heartbeat

### Event Broadcasting
- [x] Bridge internal events to WebSocket (`src/websocket/bus-bridge.ts`)
- [x] Implement room/channel management (`src/websocket/rooms.ts`)
- [x] Create subscription system (session & project channels)
- [x] Handle reconnection state sync (`src/websocket/sync.ts`)

### Phase 3 Testing Requirements

**Unit Tests** (implemented):
```
tests/unit/websocket/
├── protocol.test.ts             # Message format validation (✅)
├── connections.test.ts          # Connection management (✅)
├── rooms.test.ts                # Room/channel logic (✅)
├── sync.test.ts                 # State synchronization (✅)
├── bus-bridge.test.ts           # Event routing (✅)
└── handlers/
    ├── subscriptions.test.ts    # Subscription handlers (✅)
    ├── sessions.test.ts         # Session handlers (✅)
    └── tools.test.ts            # Tool handlers (✅)
```

**Integration Tests** (implemented):
```
tests/integration/
├── websocket-connection.test.ts # Handler integration, rooms, errors (✅)
└── websocket-streaming.test.ts  # Event streaming, multi-client (✅)
```

**Validation Criteria**:
- [x] All WebSocket tests pass (127 tests)
- [x] API tests pass with schema validation
- [x] Protocol validation for valid/invalid messages
- [x] Connection management works correctly
- [x] Event routing to correct rooms

**Deliverable**: Full real-time communication with streaming agent responses

---

## Phase 4: Advanced Agent Features

**Goal**: Sub-agents, custom tools, and permissions

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
│   └── task.test.ts             # Task/subagent tool
└── permissions/
    ├── ruleset.test.ts          # Ruleset evaluation
    └── approval.test.ts         # Approval workflow
```

**Integration Tests**:
```
tests/integration/
├── subagent-flow.test.ts        # Parent spawns child, gets result
└── permission-enforcement.test.ts # Permissions block/allow correctly
```

**Security Tests**:
```
tests/security/
├── path-traversal.test.ts       # No escape from project
└── permission-bypass.test.ts    # No permission bypass
```

**Validation Criteria**:
- [ ] Built-in agents tested with 10+ scenarios each
- [ ] Sub-agent round-trip works end-to-end
- [ ] Permission system blocks unauthorized operations
- [ ] Security tests pass

**Deliverable**: Extensible agent system with sub-agents and permissions

---

## Phase 5: Multi-User Support

**Goal**: Authentication and collaboration

### Magic Link Authentication
- [ ] Implement email-based magic link flow
- [ ] Create email service with Resend integration
- [ ] Add dev mode console logging for magic links
- [ ] Implement database-backed sessions (revocable)
- [ ] Add first-user-becomes-admin logic

### User Trust Levels
- [ ] Add is_admin and can_execute_code columns
- [ ] Implement permission middleware (requireAuth, requireAdmin, requireCodeExecution)
- [ ] First registered user automatically becomes admin
- [ ] API key system for programmatic access

### Per-User Provider Credentials
- [ ] Implement encrypted storage for AI provider API keys
- [ ] Support OpenAI, Anthropic, Google providers
- [ ] Credential CRUD endpoints
- [ ] AES-256-GCM encryption for stored keys

### Project Members
- [ ] Implement member invitation system
- [ ] Create role-based permissions (owner, admin, member, viewer)
- [ ] Add permission checking middleware
- [ ] Implement member management endpoints

### Phase 5 Testing Requirements

**Unit Tests**:
```
tests/unit/
├── auth/
│   ├── magic-link.test.ts       # Token generation, verification, expiry
│   ├── session.test.ts          # Session CRUD, validation, revocation
│   ├── middleware.test.ts       # Auth extraction, permission checks
│   └── api-keys.test.ts         # API key management
├── services/
│   ├── email.test.ts            # Dev mode logging, Resend mock
│   ├── crypto.test.ts           # Encryption round-trip
│   └── provider-credentials.test.ts # Credential CRUD
└── members/
    ├── invitation.test.ts       # Invite flow
    └── roles.test.ts            # Role permissions
```

**Integration Tests**:
```
tests/integration/
├── auth-flow.test.ts            # Full magic link -> session flow
├── first-user-admin.test.ts     # First user becomes admin
├── provider-credentials.test.ts # Credential storage/retrieval
└── member-access.test.ts        # Role-based access
```

**Security Tests**:
```
tests/security/
├── token-security.test.ts       # Tokens not guessable, properly hashed
├── session-expiry.test.ts       # Sessions expire correctly
├── encryption.test.ts           # Keys encrypted, not leaked
├── permission-enforcement.test.ts # Code execution blocked for non-admins
└── role-enforcement.test.ts     # Roles actually enforced
```

**Validation Criteria**:
- [ ] Magic link flow works end-to-end
- [ ] Dev mode logs magic links to console
- [ ] First user becomes admin automatically
- [ ] Non-admin users blocked from code execution endpoints
- [ ] Provider credentials encrypted at rest
- [ ] Role permissions enforced correctly

**Deliverable**: Multi-user access with role-based permissions and per-user AI provider keys

---

## Phase 6: Production Readiness

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
- [ ] Deployment guide
- [ ] Configuration reference

### Phase 6 Testing Requirements

**Performance Tests**:
```
tests/performance/
├── api-latency.test.ts          # P50, P95, P99 latencies
├── websocket-throughput.test.ts # Messages per second
├── database-load.test.ts        # Concurrent DB operations
└── memory-usage.test.ts         # Memory under load
```

**Load Tests**:
```
tests/load/
├── sustained-load.test.ts       # 1 hour steady load
└── spike-handling.test.ts       # Traffic spikes
```

**Security Audit**:
```
tests/security/
├── input-validation.test.ts     # All inputs validated
├── injection-prevention.test.ts # SQL, command injection
└── rate-limiting.test.ts        # Rate limits work
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

## Phase 7: Custom Tools & Todo Tracking ✅ COMPLETE

**Goal**: Implement custom tool management and task tracking for agent sessions

### ToolService
- [x] Create `src/services/tools.ts` with full CRUD operations
- [x] Implement tool types: code, mcp, http
- [x] Add reserved tool name validation
- [x] Support JSON Schema for tool parameters
- [x] Soft delete via enabled flag

### TodoService
- [x] Create `src/services/todos.ts` with CRUD operations
- [x] Implement batch replacement (replaceBatch)
- [x] Add position management with auto-increment
- [x] Enforce single in_progress per session
- [x] Support session isolation

### REST API Routes
- [x] `src/server/routes/tools.ts` - Tools CRUD endpoints
- [x] `src/server/routes/todos.ts` - Todos CRUD endpoints
- [x] Register routes in app.ts

### Tests
- [x] `tests/unit/services/tools.test.ts` - 30+ unit tests
- [x] `tests/unit/services/todos.test.ts` - 25+ unit tests
- [x] `tests/unit/server/routes/tools.test.ts` - 20+ route tests
- [x] `tests/unit/server/routes/todos.test.ts` - 20+ route tests
- [x] `tests/integration/custom-tools.test.ts` - Tool workflow tests
- [x] `tests/integration/todo-tracking.test.ts` - Todo lifecycle tests

### Orchestrator Integration (Deferred)
- [ ] Update TodoWrite tool to use TodoService
- [ ] Create custom-tool-executor.ts for executing custom tools

### Phase 7 Testing Requirements

**Validation Criteria**:
- [x] All 930 unit and integration tests pass
- [x] `bun test` passes
- [x] Tools can be created via REST API
- [x] Todos can be tracked per session
- [x] No regressions in existing functionality

**Known Issues**:
- Pre-existing TypeScript strict mode warnings in test files (body: unknown)
- Orchestrator integration deferred to future phase

**Deliverable**: Custom tool management and todo tracking services with full REST API

---

## Phase 8: WebSocket Testing & Validation ✅ COMPLETE

**Goal**: Comprehensive WebSocket test coverage to validate real-time communication

### Unit Tests
- [x] `tests/unit/websocket/handlers/subscriptions.test.ts` - Subscription handler tests
- [x] `tests/unit/websocket/handlers/sessions.test.ts` - Session handler tests
- [x] `tests/unit/websocket/handlers/tools.test.ts` - Tool approval handler tests
- [x] `tests/unit/websocket/bus-bridge.test.ts` - EventBus to WebSocket routing
- [x] `tests/unit/websocket/sync.test.ts` - State synchronization tests

### Integration Tests
- [x] `tests/integration/websocket-connection.test.ts` - Handler integration, connection management
- [x] `tests/integration/websocket-streaming.test.ts` - Message streaming, multi-client scenarios

### Test Coverage Summary
- Handler unit tests: 28 tests
- Bus-bridge tests: 18 tests
- Sync tests: 13 tests
- Protocol/connections/rooms tests: 46 tests (existing)
- Integration tests: 22 tests

### Phase 8 Testing Requirements

**Validation Criteria**:
- [x] WebSocket protocol validation (valid/invalid messages)
- [x] Connection manager operations (add, remove, find, broadcast)
- [x] Handler logic with mocked dependencies
- [x] Bus-bridge event routing to correct rooms
- [x] Full handler request lifecycle (sessions, subscriptions)
- [x] Event streaming (text deltas, tool calls, errors)
- [x] Multi-client scenarios (project isolation, multi-session)
- [x] All 1011 tests pass (127 WebSocket-specific)

**Deliverable**: Complete WebSocket test coverage validating Phase 3 implementation

---

## Test Infrastructure

### Required Test Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    "test:api": "bun test tests/api",
    "test:websocket": "bun test tests/websocket",
    "test:agents": "bun test tests/agents",
    "test:security": "bun test tests/security",
    "test:performance": "bun test tests/performance",
    "test:e2e": "bun test tests/e2e"
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
| 5     | 90%          | 85%                 | 87%     |
| 6     | 90%          | 90%                 | 90%     |

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
- Agent patterns

### Validation: Zod
- TypeScript-first schema validation
- Runtime type checking
- Shared schemas between client/server
- JSON Schema generation for OpenAPI

### Testing: Bun Test
- Built into Bun runtime
- Fast parallel execution
- Compatible with Jest patterns
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
│   ├── auth/
│   ├── websocket/
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
- **Mitigation**: Path validation, permission system, audit logging
- **Test**: `tests/security/path-traversal.test.ts`

### AI Provider Outages
- **Risk**: Upstream provider failures
- **Mitigation**: Multiple provider support, retry logic, graceful degradation
- **Test**: `tests/agents/error-handling.test.ts`
