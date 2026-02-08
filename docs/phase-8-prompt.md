# Phase 8: Real-time WebSocket Communication

## Context

You are implementing Phase 8 of the Botical AI agent server. The previous phases have established:

- **Phase 1** ✅: Foundation - Database, server, project system, event bus
- **Phase 2** ✅: Agent Core - AI SDK integration, sessions, tools, streaming
- **Phase 7** ✅: Custom Tools & Todo Tracking - ToolService, TodoService, REST APIs

Now we need real-time WebSocket communication to enable interactive client connections.

## Goal

Implement WebSocket-based client communication with:
- Connection management and authentication
- Request/response messaging protocol
- Real-time event streaming for agent responses
- Reconnection handling with state synchronization

## Implementation Tasks

### 1. WebSocket Server Setup

Create `src/websocket/server.ts`:
- WebSocket upgrade handler for Hono/Bun
- Connection management (tracking active connections)
- Heartbeat/ping-pong for connection health
- Graceful shutdown handling

### 2. Message Protocol

Create `src/websocket/protocol.ts`:
- Define message types with Zod schemas:
  ```typescript
  // Client -> Server
  type ClientMessage =
    | { type: 'request'; id: string; method: string; params: unknown }
    | { type: 'subscribe'; channels: string[] }
    | { type: 'unsubscribe'; channels: string[] }
    | { type: 'ping' }

  // Server -> Client
  type ServerMessage =
    | { type: 'response'; id: string; result?: unknown; error?: ErrorPayload }
    | { type: 'event'; channel: string; event: string; data: unknown }
    | { type: 'pong' }
  ```
- Request ID tracking for async responses
- Error payload structure

### 3. Connection Manager

Create `src/websocket/connections.ts`:
- Connection registry with metadata (userId, projectId, subscriptions)
- Room/channel management for targeted broadcasts
- Connection lifecycle hooks (onConnect, onDisconnect)
- Authentication state per connection

### 4. Request Handlers

Create `src/websocket/handlers/`:
- `sessions.ts` - create, list, get, archive sessions
- `messages.ts` - send message, cancel, retry
- `agents.ts` - list agents, get agent config
- `tools.ts` - list tools, approve/reject tool calls
- `todos.ts` - get/update session todos
- `subscribe.ts` - manage event subscriptions

### 5. Event Broadcasting

Create `src/websocket/broadcaster.ts`:
- Bridge EventBus to WebSocket events
- Channel-based event routing:
  - `session:{id}` - session-specific events
  - `project:{id}` - project-wide events
  - `user:{id}` - user-specific events
- Event types to broadcast:
  - `message.created`, `message.updated`
  - `part.created`, `part.updated`
  - `session.updated`
  - `tool.approval_required`
  - `agent.status_changed`

### 6. Authentication

Create `src/websocket/auth.ts`:
- Token validation on connection upgrade
- Session/API key authentication
- Permission checking for requests
- Connection-level auth state

## File Structure

```
src/websocket/
├── server.ts           # WebSocket upgrade handler
├── protocol.ts         # Message schemas
├── connections.ts      # Connection manager
├── broadcaster.ts      # Event broadcasting
├── auth.ts             # Authentication
└── handlers/
    ├── index.ts        # Handler registry
    ├── sessions.ts
    ├── messages.ts
    ├── agents.ts
    ├── tools.ts
    ├── todos.ts
    └── subscribe.ts

tests/unit/websocket/
├── protocol.test.ts
├── connections.test.ts
├── broadcaster.test.ts
└── handlers/
    ├── sessions.test.ts
    ├── messages.test.ts
    └── ...

tests/integration/
├── websocket-connection.test.ts
├── websocket-messaging.test.ts
└── websocket-streaming.test.ts
```

## Testing Requirements

### Unit Tests
- Protocol message validation (valid/invalid messages)
- Connection manager (add, remove, find, broadcast)
- Handler logic (mocked dependencies)
- Authentication (token validation, permission checks)

### Integration Tests
- Full connection lifecycle (connect -> auth -> request -> disconnect)
- Event streaming (send message -> receive stream events)
- Multi-client scenarios (broadcast to multiple clients)
- Reconnection handling (disconnect -> reconnect -> state sync)

### Validation Criteria
- [ ] WebSocket connects successfully with valid token
- [ ] Invalid tokens rejected on connect
- [ ] Request/response round-trip works
- [ ] Events broadcast to subscribed clients
- [ ] Disconnection cleanup works properly
- [ ] All tests pass: `bun test tests/unit/websocket tests/integration/websocket*`

## Implementation Notes

1. **Use Bun's native WebSocket** - Don't add ws package, use Bun's built-in support
2. **Leverage existing EventBus** - Bridge internal events to WebSocket broadcasts
3. **Keep handlers thin** - Delegate to existing services (SessionService, etc.)
4. **Type safety** - Full Zod validation on all incoming messages
5. **Error handling** - Graceful errors that don't crash connections

## Example Usage

```typescript
// Client connection
const ws = new WebSocket('ws://localhost:4096/ws?token=xxx');

// Send request
ws.send(JSON.stringify({
  type: 'request',
  id: 'req_1',
  method: 'sessions.create',
  params: { projectId: 'prj_xxx', title: 'New Chat' }
}));

// Receive response
// { type: 'response', id: 'req_1', result: { id: 'sess_xxx', ... } }

// Subscribe to events
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['session:sess_xxx']
}));

// Receive streamed events
// { type: 'event', channel: 'session:sess_xxx', event: 'part.created', data: {...} }
```

## Success Criteria

1. WebSocket server starts alongside HTTP server
2. Clients can connect, authenticate, and make requests
3. Agent responses stream in real-time to connected clients
4. Multiple clients can connect and receive broadcasts
5. All 930+ existing tests still pass
6. New WebSocket tests pass

Begin by reading the existing codebase structure, then implement the WebSocket server incrementally with tests.
