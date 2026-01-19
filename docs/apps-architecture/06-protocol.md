# Iris Apps: Communication Protocols

## Overview

With Server-Defined Rendering (SDR), communication is simpler than traditional approaches. The server sends UI trees; the client renders them. Actions flow back to the server.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMUNICATION CHANNELS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐                │
│  │  Iris    │◄───────►│   App    │◄───────►│  SDR     │                │
│  │  Core    │   WS    │  Server  │   WS    │ Renderer │                │
│  └──────────┘         └──────────┘         └──────────┘                │
│       │                    │                    │                       │
│       │                    │                    │                       │
│       ▼                    ▼                    ▼                       │
│  ┌──────────┐         ┌──────────┐         ┌──────────┐                │
│  │  Other   │         │ External │         │  User    │                │
│  │  Apps    │         │ Services │         │ Actions  │                │
│  └──────────┘         └──────────┘         └──────────┘                │
│                                                                          │
│  Primary Flow:                                                          │
│  1. App server generates ui() → Component tree                         │
│  2. Tree sent via WebSocket → Client                                   │
│  3. SDR Renderer maps tree → Native components                         │
│  4. User actions → Server → State change → New tree                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## SDR Protocol (Server ↔ Client)

### Message Format

All messages use a simple JSON envelope:

```typescript
interface SDRMessage {
  // Message identity
  id: string;
  type: SDRMessageType;

  // Payload
  payload: unknown;

  // Metadata
  timestamp: number;
  correlationId?: string;  // Links request/response
}

type SDRMessageType =
  // UI synchronization
  | 'ui:sync'        // Full UI tree (on connect, after reload)
  | 'ui:patch'       // Partial UI update (optimized)

  // State
  | 'state:sync'     // Full state sync
  | 'state:update'   // Single state update

  // Actions (from client)
  | 'action:call'    // User triggered action
  | 'action:result'  // Action result

  // Lifecycle
  | 'app:ready'      // App initialized
  | 'app:reload'     // Hot reload triggered
  | 'app:error'      // App error occurred

  // Input events
  | 'input:change'   // Form input changed
  | 'input:submit'   // Form submitted
;
```

### UI Sync Flow

The primary communication pattern:

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   SDR    │
│  Server  │                              │ Renderer │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  UI:SYNC (on connect)                   │
     │  {                                      │
     │    type: "ui:sync",                     │
     │    payload: {                           │
     │      tree: {                            │
     │        $: "component",                  │
     │        type: "Stack",                   │
     │        props: { padding: 16 },          │
     │        children: [                      │
     │          { type: "Text", ... },         │
     │          { type: "Button", ... }        │
     │        ]                                │
     │      },                                 │
     │      state: {                           │
     │        count: 0,                        │
     │        items: []                        │
     │      }                                  │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Render tree
     │                                         │  using registry
     │                                         │
```

### Action Flow

When user interacts with the UI:

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   SDR    │
│  Server  │                              │ Renderer │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │                            User clicks  │
     │                            Button       │
     │                                         │
     │  ACTION:CALL                            │
     │  {                                      │
     │    type: "action:call",                 │
     │    id: "act-123",                       │
     │    payload: {                           │
     │      action: "increment",               │
     │      args: { amount: 1 }                │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  Execute tool                           │
     │  Update state                           │
     │  Re-run ui()                            │
     │                                         │
     │  UI:SYNC (new tree)                     │
     │  {                                      │
     │    payload: {                           │
     │      tree: { ... },                     │
     │      state: { count: 1 }                │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Diff & update
     │                                         │
```

### State Updates (Optimistic)

For responsive UIs, state can update optimistically:

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   SDR    │
│  Server  │                              │ Renderer │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │                            User types   │
     │                            in Input     │
     │                                         │
     │  INPUT:CHANGE                           │
     │  {                                      │
     │    type: "input:change",                │
     │    payload: {                           │
     │      path: "query",                     │
     │      value: "SELECT *"                  │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
     │  STATE:UPDATE (confirmation)            │
     │  {                                      │
     │    type: "state:update",                │
     │    payload: {                           │
     │      key: "query",                      │
     │      value: "SELECT *"                  │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │  (UI already shows value - no flicker)  │
     │                                         │
```

### Component Tree Structure

The UI tree is a JSON representation of components:

```typescript
interface ComponentNode {
  // Marker for component nodes
  $: 'component';

  // Component type (from registry)
  type: string;

  // Props passed to component
  props: Record<string, PropValue>;

  // Children (text, nodes, or mixed)
  children?: UIChild[];

  // Unique key for list diffing
  key?: string;
}

type UIChild = string | number | boolean | null | ComponentNode;

type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { [key: string]: PropValue }
  | ActionDescriptor;

interface ActionDescriptor {
  $action: string;      // Tool/action name
  args?: unknown;       // Arguments
  optimistic?: unknown; // Optimistic state update
}
```

Example tree:

```json
{
  "$": "component",
  "type": "Stack",
  "props": { "padding": 16, "gap": 12 },
  "children": [
    {
      "$": "component",
      "type": "Text",
      "props": { "size": "2xl", "weight": "bold" },
      "children": ["Counter: 5"]
    },
    {
      "$": "component",
      "type": "Button",
      "props": {
        "variant": "primary",
        "onPress": { "$action": "increment", "args": { "amount": 1 } }
      },
      "children": ["+1"]
    }
  ]
}
```

## Internal RPC Protocol (Iris ↔ App Server)

For Iris platform access (AI, filesystem, tools):

```typescript
interface RPCMessage {
  id: string;
  type: 'request' | 'response' | 'event';

  // For requests
  method?: string;
  params?: unknown;

  // For responses
  result?: unknown;
  error?: RPCError;

  // For events
  event?: string;
  data?: unknown;

  correlationId?: string;
  timestamp: number;
}
```

### Method Namespaces

```
iris:*             Iris platform access
  iris:ai:chat
  iris:ai:embed
  iris:fs:read
  iris:fs:write
  iris:fs:list
  iris:tools:call
  iris:navigate
  iris:notify

lifecycle:*        App lifecycle
  lifecycle:activate
  lifecycle:deactivate
  lifecycle:reload

service:*          Service management
  service:start
  service:stop
  service:status

config:*           Configuration
  config:get
  config:set
```

### Example: AI Chat Call

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   Iris   │
│  Server  │                              │   Core   │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  REQUEST                                │
     │  {                                      │
     │    id: "rpc-456",                       │
     │    type: "request",                     │
     │    method: "iris:ai:chat",              │
     │    params: {                            │
     │      messages: [                        │
     │        { role: "user", content: "..." } │
     │      ],                                 │
     │      model: "claude-sonnet"             │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                         Check permission│
     │                         Execute AI call │
     │                                         │
     │  RESPONSE                               │
     │  {                                      │
     │    type: "response",                    │
     │    correlationId: "rpc-456",            │
     │    result: {                            │
     │      content: "Here's the answer...",   │
     │      usage: { tokens: 150 }             │
     │    }                                    │
     │  }                                      │
     │◄────────────────────────────────────────│
     │                                         │
```

## Custom UI Bridge Protocol (iframe mode)

For apps using custom UI mode (the escape hatch), communication uses postMessage:

```typescript
interface BridgeMessage {
  protocol: 'iris-bridge';
  version: 1;
  type: BridgeMessageType;
  id?: string;
  payload: unknown;
}

type BridgeMessageType =
  | 'init'          // Shell → iframe: Initialize
  | 'ready'         // iframe → Shell: Ready
  | 'state:sync'    // Shell → iframe: State sync
  | 'state:update'  // Shell → iframe: State change
  | 'state:set'     // iframe → Shell: Set state
  | 'action:call'   // iframe → Shell: Call tool
  | 'action:result' // Shell → iframe: Tool result
  | 'theme:change'  // Shell → iframe: Theme changed
;
```

### Bridge Initialization

```
┌──────────┐                              ┌──────────┐
│  Shell   │                              │  iframe  │
│ (parent) │                              │  (app)   │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  INIT                                   │
     │  {                                      │
     │    type: "init",                        │
     │    payload: {                           │
     │      appId: "my-app",                   │
     │      projectId: "proj-123",             │
     │      state: { count: 0 },               │
     │      theme: "dark",                     │
     │      config: { ... }                    │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Initialize
     │                                         │  React app
     │                                         │
     │  READY                                  │
     │◄────────────────────────────────────────│
     │                                         │
```

### Security for Bridge

```typescript
class SecureBridge {
  private allowedOrigin: string;

  constructor(iframe: HTMLIFrameElement) {
    this.allowedOrigin = new URL(iframe.src).origin;
    window.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent) => {
    // Verify origin
    if (event.origin !== this.allowedOrigin) {
      console.warn('Rejected message from:', event.origin);
      return;
    }

    // Validate message structure
    if (!this.isValidBridgeMessage(event.data)) {
      return;
    }

    this.process(event.data);
  };

  send(message: BridgeMessage): void {
    this.iframe.contentWindow?.postMessage(
      { protocol: 'iris-bridge', version: 1, ...message },
      this.allowedOrigin
    );
  }
}
```

## Hot Reload Protocol

### Server Module Reload (SDR)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Bun FS  │     │   App    │     │   SDR    │
│  Watcher │     │  Server  │     │ Renderer │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │  File change   │                │
     │───────────────►│                │
     │                │                │
     │                │  1. Snapshot   │
     │                │     state      │
     │                │                │
     │                │  2. Unload     │
     │                │     module     │
     │                │                │
     │                │  3. Load new   │
     │                │     module     │
     │                │                │
     │                │  4. Restore    │
     │                │     state      │
     │                │                │
     │                │  5. Run ui()   │
     │                │                │
     │                │  UI:SYNC       │
     │                │───────────────►│
     │                │                │
     │                │                │  Re-render
     │                │                │  (instant!)
     │                │                │
```

### State Migration

If state shape changes during hot reload:

```typescript
export default defineApp({
  state: {
    // Renamed from 'count' to 'counter'
    counter: state(0),
  },

  onReload: async (ctx, previousState) => {
    // Migrate old state
    if ('count' in previousState) {
      ctx.state.counter.set(previousState.count);
    }
  },
});
```

## WebSocket Connection Management

### Connection States

```typescript
type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

class AppConnection {
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;

  connect(): void {
    this.state = 'connecting';
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.requestFullSync();
    };

    this.ws.onclose = (event) => {
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    this.state = 'reconnecting';
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      30000
    );
    setTimeout(() => this.connect(), delay);
    this.reconnectAttempts++;
  }
}
```

### Heartbeat

```
┌──────────┐                              ┌──────────┐
│  Client  │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  PING (every 30s)                       │
     │  { type: "ping" }                       │
     │────────────────────────────────────────►│
     │                                         │
     │  PONG                                   │
     │  { type: "pong" }                       │
     │◄────────────────────────────────────────│
     │                                         │
```

## Error Protocol

### Error Message Format

```typescript
interface ErrorMessage {
  type: 'app:error';
  payload: {
    category: 'server_load' | 'ui_generation' | 'action' | 'runtime';
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
    recoverable: boolean;
    timestamp: number;
  };
}
```

### Error Flow

```
┌──────────┐                              ┌──────────┐
│   App    │                              │   SDR    │
│  Server  │                              │ Renderer │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  ui() throws error                      │
     │                                         │
     │  APP:ERROR                              │
     │  {                                      │
     │    type: "app:error",                   │
     │    payload: {                           │
     │      category: "ui_generation",         │
     │      message: "Cannot read 'name'...",  │
     │      file: "server.ts",                 │
     │      line: 45,                          │
     │      recoverable: true                  │
     │    }                                    │
     │  }                                      │
     │────────────────────────────────────────►│
     │                                         │
     │                                         │  Show error
     │                                         │  overlay with
     │                                         │  last valid UI
     │                                         │
```

## Rate Limiting

To prevent abuse, certain operations are rate-limited:

```typescript
const rateLimits: Record<string, RateLimit> = {
  'iris:ai:chat': { requests: 100, window: '1h' },
  'iris:fs:read': { requests: 1000, window: '1m' },
  'iris:fs:write': { requests: 100, window: '1m' },
  'ui:sync': { requests: 60, window: '1s' },  // Max 60 FPS
};
```

Rate limit errors return:

```typescript
{
  type: 'response',
  error: {
    code: -32008,
    message: 'Rate limit exceeded',
    data: {
      limit: 100,
      window: '1h',
      resetAt: 1705234567890
    }
  }
}
```

---

*Next: [07-implementation-roadmap.md](./07-implementation-roadmap.md) - Implementation phases and milestones*
