# Iris Apps: Communication Protocols

## Overview

Iris Apps communicate through multiple channels:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMUNICATION CHANNELS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐                │
│  │  Iris    │◄───────►│   App    │◄───────►│  App UI  │                │
│  │  Core    │   WS    │  Server  │ Bridge  │ (iframe) │                │
│  └──────────┘         └──────────┘         └──────────┘                │
│       │                    │                    │                       │
│       │                    │                    │                       │
│       ▼                    ▼                    ▼                       │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐                │
│  │  Other   │         │ External │         │  User    │                │
│  │  Apps    │         │ Services │         │ Browser  │                │
│  └──────────┘         └──────────┘         └──────────┘                │
│                                                                          │
│  Protocols:                                                             │
│  • Iris ↔ App Server: Internal RPC over WebSocket                      │
│  • App Server ↔ App UI: Bridge Protocol over postMessage               │
│  • App ↔ External: HTTP/WebSocket (permission-gated)                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Internal RPC Protocol (Iris ↔ App Server)

### Message Format

All messages follow a consistent envelope:

```typescript
interface RPCMessage {
  // Message identity
  id: string;              // Unique message ID (UUID)
  type: 'request' | 'response' | 'event' | 'stream';

  // Routing
  source: string;          // Sender identifier
  target?: string;         // Recipient (for requests)

  // Payload
  method?: string;         // For requests
  params?: unknown;        // For requests
  result?: unknown;        // For responses
  error?: RPCError;        // For error responses
  event?: string;          // For events
  data?: unknown;          // For events/streams

  // Metadata
  timestamp: number;
  correlationId?: string;  // Links related messages
}

interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}
```

### Request-Response Pattern

```
┌──────────┐                              ┌──────────┐
│   Iris   │                              │   App    │
│   Core   │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  REQUEST                                │
     │  {                                      │
     │    id: "msg-123",                       │
     │    type: "request",                     │
     │    source: "iris",                      │
     │    target: "app:my-app",                │
     │    method: "tool:query",                │
     │    params: { sql: "SELECT *" }          │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Execute
     │                                         │
     │  RESPONSE                               │
     │  {                                      │
     │    id: "msg-124",                       │
     │    type: "response",                    │
     │    correlationId: "msg-123",            │
     │    result: { rows: [...] }              │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
```

### Event Pattern

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   Iris   │
│  Server  │                              │   Core   │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  EVENT                                  │
     │  {                                      │
     │    id: "msg-456",                       │
     │    type: "event",                       │
     │    source: "app:my-app",                │
     │    event: "state:changed",              │
     │    data: {                              │
     │      key: "count",                      │
     │      value: 42                          │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                         (no response)   │
     │                                         │
```

### Stream Pattern (for long-running operations)

```
┌──────────┐                              ┌──────────┐
│   Iris   │                              │   App    │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  REQUEST (stream)                       │
     │  {                                      │
     │    method: "tool:analyze",              │
     │    params: { ... }                      │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │  STREAM (progress)                      │
     │  {                                      │
     │    type: "stream",                      │
     │    correlationId: "msg-789",            │
     │    data: { progress: 0.25 }             │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  STREAM (progress)                      │
     │  { data: { progress: 0.50 } }           │
     │◄────────────────────────────────────────│
     │                                         │
     │  STREAM (progress)                      │
     │  { data: { progress: 0.75 } }           │
     │◄────────────────────────────────────────│
     │                                         │
     │  RESPONSE (final)                       │
     │  {                                      │
     │    type: "response",                    │
     │    result: { analysis: ... }            │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
```

### Method Namespaces

```
Methods are namespaced by category:

lifecycle:*        App lifecycle management
  lifecycle:activate
  lifecycle:deactivate
  lifecycle:reload

tool:*             Tool invocation
  tool:{toolName}

state:*            State management
  state:get
  state:set
  state:subscribe
  state:unsubscribe

query:*            Query operations
  query:fetch
  query:invalidate

service:*          Service management
  service:start
  service:stop
  service:status

config:*           Configuration
  config:get
  config:set

iris:*             Iris platform access
  iris:ai:chat
  iris:ai:embed
  iris:fs:read
  iris:fs:write
  iris:tools:call
  iris:navigate
  iris:notify
```

### Error Codes

```typescript
const RPCErrorCodes = {
  // Standard JSON-RPC codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Custom codes
  PERMISSION_DENIED: -32001,
  APP_NOT_FOUND: -32002,
  TOOL_NOT_FOUND: -32003,
  STATE_NOT_FOUND: -32004,
  SERVICE_NOT_FOUND: -32005,
  TIMEOUT: -32006,
  CANCELLED: -32007,
  RATE_LIMITED: -32008,
  APP_ERROR: -32009,
};
```

## Bridge Protocol (App Server ↔ App UI)

The bridge uses `postMessage` for communication between the Iris shell/App Server and the sandboxed app UI iframe.

### Message Format

```typescript
interface BridgeMessage {
  // Protocol identifier
  protocol: 'iris-bridge';
  version: 1;

  // Message type
  type: BridgeMessageType;

  // Message ID (for request/response correlation)
  id?: string;

  // Payload
  payload: unknown;
}

type BridgeMessageType =
  // Lifecycle
  | 'init'           // Shell → App: Initialize with context
  | 'ready'          // App → Shell: App is ready
  | 'reload'         // Shell → App: Prepare for hot reload

  // State
  | 'state:sync'     // Shell → App: Full state sync
  | 'state:update'   // Shell → App: State delta
  | 'state:set'      // App → Shell: Request state change

  // Tools/Actions
  | 'action:call'    // App → Shell: Call a tool/action
  | 'action:result'  // Shell → App: Tool result

  // Queries
  | 'query:fetch'    // App → Shell: Fetch query data
  | 'query:data'     // Shell → App: Query result
  | 'query:error'    // Shell → App: Query error

  // Events
  | 'event'          // Bidirectional: Custom events

  // Navigation
  | 'navigate'       // App → Shell: Navigate Iris

  // Notifications
  | 'notify'         // App → Shell: Show notification

  // Errors
  | 'error'          // App → Shell: Report error

  // Theme
  | 'theme:change'   // Shell → App: Theme changed
```

### Initialization Flow

```
┌──────────┐                              ┌──────────┐
│  Shell   │                              │ App UI   │
│ (parent) │                              │ (iframe) │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  iframe loads                           │
     │                                         │
     │  INIT                                   │
     │  {                                      │
     │    type: "init",                        │
     │    payload: {                           │
     │      projectId: "proj-123",             │
     │      appId: "my-app",                   │
     │      theme: "dark",                     │
     │      state: { count: 0, ... },          │
     │      config: { ... }                    │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Initialize
     │                                         │  React app
     │                                         │
     │  READY                                  │
     │  {                                      │
     │    type: "ready",                       │
     │    payload: {                           │
     │      version: "1.0.0"                   │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
```

### State Synchronization

```
┌──────────┐                              ┌──────────┐
│  Shell   │                              │ App UI   │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  STATE:UPDATE (from server)             │
     │  {                                      │
     │    type: "state:update",                │
     │    payload: {                           │
     │      key: "count",                      │
     │      value: 42                          │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │
     │  STATE:SET (user action)                │
     │  {                                      │
     │    type: "state:set",                   │
     │    id: "req-456",                       │
     │    payload: {                           │
     │      key: "count",                      │
     │      value: 43                          │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  (forwards to app server)               │
     │                                         │
     │  STATE:UPDATE (confirmation)            │
     │  {                                      │
     │    type: "state:update",                │
     │    payload: { key: "count", value: 43 } │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
```

### Action/Tool Calls

```
┌──────────┐                              ┌──────────┐
│  Shell   │                              │ App UI   │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  ACTION:CALL                            │
     │  {                                      │
     │    type: "action:call",                 │
     │    id: "call-789",                      │
     │    payload: {                           │
     │      action: "query",                   │
     │      args: { sql: "SELECT *" }          │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  (execute via app server)               │
     │                                         │
     │  ACTION:RESULT                          │
     │  {                                      │
     │    type: "action:result",               │
     │    id: "call-789",                      │
     │    payload: {                           │
     │      success: true,                     │
     │      data: { rows: [...] }              │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
```

### Security Considerations

```typescript
class SecureBridge {
  private iframe: HTMLIFrameElement;
  private allowedOrigin: string;
  private pendingRequests: Map<string, PendingRequest>;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    // Only allow messages from the iframe's origin
    this.allowedOrigin = new URL(iframe.src).origin;

    window.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent) => {
    // Verify origin
    if (event.origin !== this.allowedOrigin) {
      console.warn('Rejected message from unauthorized origin:', event.origin);
      return;
    }

    // Verify source is our iframe
    if (event.source !== this.iframe.contentWindow) {
      console.warn('Rejected message from unknown source');
      return;
    }

    // Validate message structure
    const message = event.data;
    if (!this.isValidBridgeMessage(message)) {
      console.warn('Rejected malformed message:', message);
      return;
    }

    // Process message
    this.processMessage(message);
  };

  send(message: BridgeMessage): void {
    // Always include protocol identifier
    const fullMessage = {
      protocol: 'iris-bridge',
      version: 1,
      ...message,
    };

    // Send to iframe
    this.iframe.contentWindow?.postMessage(fullMessage, this.allowedOrigin);
  }
}
```

## State Sync Protocol

### Full State Sync

On initialization and reconnection:

```typescript
interface StateSyncMessage {
  type: 'state:sync';
  payload: {
    // All current state values
    state: Record<string, unknown>;

    // All computed values
    computed: Record<string, unknown>;

    // Query states
    queries: Record<string, {
      data?: unknown;
      isLoading: boolean;
      error?: string;
      staleAt?: number;
    }>;

    // Sync timestamp
    timestamp: number;
  };
}
```

### Delta Updates

For efficiency, only changed values are sent:

```typescript
interface StateUpdateMessage {
  type: 'state:update';
  payload: {
    // Single state update
    key: string;
    value: unknown;

    // Or batch updates
    updates?: Array<{ key: string; value: unknown }>;

    // Update sequence number for ordering
    sequence: number;
  };
}
```

### Optimistic Updates

For responsive UIs, updates can be optimistic:

```
┌──────────┐                              ┌──────────┐
│ App UI   │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  User clicks +1                         │
     │                                         │
     │  Optimistic: count = count + 1          │
     │  (UI updates immediately)               │
     │                                         │
     │  STATE:SET                              │
     │  { key: "count", value: 43,             │
     │    optimisticId: "opt-1" }              │
     │────────────────────────────────────────►│
     │                                         │
     │                         Server validates│
     │                         and updates     │
     │                                         │
     │  STATE:UPDATE                           │
     │  { key: "count", value: 43,             │
     │    confirmedOptimistic: "opt-1" }       │
     │◄────────────────────────────────────────│
     │                                         │
     │  (UI already shows 43, no flicker)      │
     │                                         │
```

### Conflict Resolution

If server rejects an optimistic update:

```
┌──────────┐                              ┌──────────┐
│ App UI   │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  Optimistic: count = 100                │
     │                                         │
     │  STATE:SET                              │
     │  { key: "count", value: 100,            │
     │    optimisticId: "opt-2" }              │
     │────────────────────────────────────────►│
     │                                         │
     │                         Server: Invalid!│
     │                         count must be   │
     │                         <= 50           │
     │                                         │
     │  STATE:ROLLBACK                         │
     │  { optimisticId: "opt-2",               │
     │    key: "count", value: 42,             │
     │    error: "Value exceeds max" }         │
     │◄────────────────────────────────────────│
     │                                         │
     │  Rollback to 42, show error             │
     │                                         │
```

## Event Protocol

### Custom Events

Apps can define and emit custom events:

```typescript
// Server-side
ctx.emit('item:created', { id: 'item-1', title: 'New Item' });

// UI-side subscription
useAppEvent('item:created', (payload) => {
  console.log('New item:', payload);
});
```

### Event Namespacing

```
Events use dot-notation namespacing:

app:*              App lifecycle events
  app:activated
  app:deactivated
  app:error

state:*            State events
  state:changed
  state:error

service:*          Service events
  service:started
  service:stopped
  service:error

custom:*           App-defined events (recommended namespace)
  custom:item:created
  custom:sync:complete
```

### Event Delivery Guarantees

```typescript
interface EventOptions {
  // At-most-once (default): Fire and forget
  delivery?: 'at-most-once';

  // At-least-once: Retry until acknowledged
  delivery?: 'at-least-once';
  retryCount?: number;
  retryDelay?: number;

  // Exactly-once: Deduplicate on receiver
  delivery?: 'exactly-once';
  eventId?: string;  // For deduplication
}

// Example: Important event with retry
ctx.emit('payment:processed', { orderId }, {
  delivery: 'at-least-once',
  retryCount: 3,
  retryDelay: 1000,
});
```

## Hot Reload Protocol

### Server Module Reload

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  FSWatch │     │  Iris    │     │   App    │     │  App UI  │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  File changed  │                │                │
     │───────────────►│                │                │
     │                │                │                │
     │                │  LIFECYCLE:RELOAD              │
     │                │───────────────►│                │
     │                │                │                │
     │                │                │  Snapshot state│
     │                │                │                │
     │                │  RELOAD:PREPARING              │
     │                │◄───────────────│                │
     │                │                │                │
     │                │                │  Unload module│
     │                │                │  Load new     │
     │                │                │                │
     │                │  RELOAD:READY  │                │
     │                │◄───────────────│                │
     │                │                │                │
     │                │                │  Restore state│
     │                │                │                │
     │                │                │  STATE:SYNC   │
     │                │                │───────────────►│
     │                │                │                │
     │                │  RELOAD:COMPLETE               │
     │                │◄───────────────│                │
     │                │                │                │
```

### UI Hot Reload (Vite HMR)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Vite    │     │  Shell   │     │  App UI  │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │  HMR update    │                │
     │ (via WS)       │                │
     │────────────────┼───────────────►│
     │                │                │
     │                │                │  React Fast
     │                │                │  Refresh
     │                │                │  (state preserved)
     │                │                │
```

## WebSocket Connection Management

### Connection Lifecycle

```typescript
interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  attempts: number;
  lastConnected?: number;
  lastError?: Error;
}

class AppConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = { status: 'disconnected', attempts: 0 };
  private reconnectTimer: Timer | null = null;

  connect(): void {
    this.state = { status: 'connecting', attempts: this.state.attempts + 1 };

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.state = { status: 'connected', attempts: 0, lastConnected: Date.now() };
      this.onConnect();
    };

    this.ws.onclose = (event) => {
      if (event.code === 1000) {
        // Normal close
        this.state = { status: 'disconnected', attempts: 0 };
      } else {
        // Unexpected close - reconnect
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.state.lastError = error;
    };
  }

  private scheduleReconnect(): void {
    this.state.status = 'reconnecting';

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.state.attempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
```

### Heartbeat/Ping-Pong

```
┌──────────┐                              ┌──────────┐
│  Client  │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  PING (every 30s)                       │
     │  { type: "ping", timestamp: 123 }       │
     │────────────────────────────────────────►│
     │                                         │
     │  PONG                                   │
     │  { type: "pong", timestamp: 123 }       │
     │◄────────────────────────────────────────│
     │                                         │
     │  (measure latency: Date.now() - 123)    │
     │                                         │
```

### Reconnection with State Recovery

```
┌──────────┐                              ┌──────────┐
│  Client  │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  (connection lost)                      │
     │                                         │
     │  ~~~ reconnecting ~~~                   │
     │                                         │
     │  CONNECT                                │
     │  { resumeToken: "abc123",               │
     │    lastSequence: 456 }                  │
     │────────────────────────────────────────►│
     │                                         │
     │                         Resume session  │
     │                         Find missed msgs│
     │                                         │
     │  RESUME                                 │
     │  { missedMessages: [                    │
     │      { seq: 457, ... },                 │
     │      { seq: 458, ... }                  │
     │    ],                                   │
     │    currentState: { ... }                │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  (apply missed messages, sync state)    │
     │                                         │
```

---

*Next: [07-implementation-roadmap.md](./07-implementation-roadmap.md) - Implementation phases and milestones*
