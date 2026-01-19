# Iris Apps: System Architecture

## Overview

The Iris Apps architecture consists of five major subsystems that work together to enable the development, execution, and deployment of AI-integrated applications.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              IRIS PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │   App Manager  │  │  Tool Registry │  │ Service Runner │            │
│  │                │  │                │  │                │            │
│  │  • Lifecycle   │  │  • Discovery   │  │  • Process mgmt│            │
│  │  • Hot reload  │  │  • Invocation  │  │  • Health check│            │
│  │  • Isolation   │  │  • Permissions │  │  • Logging     │            │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘            │
│          │                   │                   │                      │
│          └───────────────────┼───────────────────┘                      │
│                              │                                          │
│                    ┌─────────▼─────────┐                               │
│                    │   App Runtime     │                               │
│                    │                   │                               │
│                    │  • Server exec    │                               │
│                    │  • State sync     │                               │
│                    │  • Event bridge   │                               │
│                    └─────────┬─────────┘                               │
│                              │                                          │
│          ┌───────────────────┼───────────────────┐                      │
│          │                   │                   │                      │
│  ┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼───────┐             │
│  │    App Host    │  │  AI Agent      │  │  Protocol    │             │
│  │   (Frontend)   │  │  Integration   │  │  Layer       │             │
│  │                │  │                │  │              │             │
│  │  • iframe      │  │  • Tool calls  │  │  • WebSocket │             │
│  │  • Error UI    │  │  • Context     │  │  • HTTP API  │             │
│  │  • Bridge      │  │  • Results     │  │  • Events    │             │
│  └────────────────┘  └────────────────┘  └──────────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Subsystem Details

### 1. App Manager

The App Manager is responsible for the complete lifecycle of Iris Apps.

```
┌─────────────────────────────────────────────────────────────┐
│                       APP MANAGER                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Discovery          Loading           Lifecycle              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │ Scan     │      │ Validate │      │ Start    │          │
│  │ project  │─────▶│ manifest │─────▶│ runtime  │          │
│  │ for apps │      │ & code   │      │ & UI     │          │
│  └──────────┘      └──────────┘      └──────────┘          │
│                                             │                │
│  ┌──────────┐      ┌──────────┐            │                │
│  │ Watch    │      │ Hot      │◀───────────┘                │
│  │ files    │─────▶│ reload   │                             │
│  └──────────┘      └──────────┘                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Responsibilities:**

| Function | Description |
|----------|-------------|
| **Discovery** | Scan project directories for `app.json` manifests |
| **Validation** | Verify manifest schema, check dependencies |
| **Loading** | Import server module, initialize state |
| **Hot Reload** | Watch source files, reload on change |
| **Isolation** | Ensure apps don't interfere with each other |
| **Lifecycle** | Start, stop, restart, unload apps |

**Key Data Structures:**

```typescript
interface ManagedApp {
  // Identity
  id: string;                    // Unique app instance ID
  manifest: AppManifest;         // Parsed app.json
  projectId: string;             // Owning project

  // Paths
  rootPath: string;              // App directory
  serverPath: string;            // server.ts location
  uiPath: string;                // ui/ directory

  // Runtime state
  status: AppStatus;             // loading | active | error | stopped
  serverModule: AppServerModule; // Loaded server.ts exports
  devServer: DevServer | null;   // Vite dev server for UI

  // Error tracking
  lastError: AppError | null;
  errorCount: number;

  // Hot reload
  watcher: FSWatcher;
  reloadCount: number;
}

type AppStatus =
  | 'discovered'    // Found app.json, not yet loaded
  | 'loading'       // Loading server module
  | 'starting'      // Running onActivate
  | 'active'        // Fully running
  | 'error'         // Failed, not running
  | 'stopping'      // Running onDeactivate
  | 'stopped';      // Cleanly stopped
```

### 2. App Runtime

The App Runtime executes app server code and manages reactive state.

```
┌─────────────────────────────────────────────────────────────┐
│                       APP RUNTIME                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Server Module                      │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │   State   │  │  Queries  │  │   Tools   │        │   │
│  │  │           │  │           │  │           │        │   │
│  │  │ Reactive  │  │ Async     │  │ AI-       │        │   │
│  │  │ values    │  │ data      │  │ callable  │        │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘        │   │
│  │        │              │              │               │   │
│  │        └──────────────┼──────────────┘               │   │
│  │                       │                               │   │
│  └───────────────────────┼───────────────────────────────┘   │
│                          │                                    │
│                  ┌───────▼───────┐                           │
│                  │  State Store  │                           │
│                  │               │                           │
│                  │  Observable   │                           │
│                  │  values with  │                           │
│                  │  subscribers  │                           │
│                  └───────┬───────┘                           │
│                          │                                    │
│            ┌─────────────┼─────────────┐                     │
│            │             │             │                     │
│    ┌───────▼───────┐ ┌───▼───┐ ┌───────▼───────┐           │
│    │  UI Sync      │ │ Tools │ │  Persistence  │           │
│    │  (WebSocket)  │ │       │ │  (Optional)   │           │
│    └───────────────┘ └───────┘ └───────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**State Model:**

The runtime implements a reactive state system inspired by signals/atoms:

```typescript
// Primitive state - simple reactive value
const count = state(0);
count.get();        // 0
count.set(5);       // Updates all subscribers
count.update(n => n + 1);

// Computed state - derived from other state
const doubled = computed(() => count.get() * 2);

// Async state - for data fetching
const users = query(async () => {
  const response = await fetch('/api/users');
  return response.json();
});
users.get();        // Returns cached data or undefined
users.load();       // Triggers fetch, returns promise
users.invalidate(); // Clears cache, re-fetches on next get
```

**Execution Context:**

Every tool execution and lifecycle hook receives a context:

```typescript
interface AppContext {
  // Identity
  appId: string;
  projectId: string;
  projectPath: string;

  // State access
  state: Record<string, StateHandle>;
  queries: Record<string, QueryHandle>;

  // Services
  getService<T>(name: string): Promise<T>;
  startService(name: string): Promise<void>;
  stopService(name: string): Promise<void>;

  // Configuration
  getConfig<T>(key: string): Promise<T>;
  setConfig<T>(key: string, value: T): Promise<void>;

  // Events
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;

  // Logging
  log: Logger;
}
```

### 3. Tool Registry

The Tool Registry manages tools exposed by apps to AI agents.

```
┌─────────────────────────────────────────────────────────────┐
│                      TOOL REGISTRY                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tool Index                         │   │
│  │                                                       │   │
│  │  app:database-explorer                               │   │
│  │  ├─ query          "Execute SQL query"               │   │
│  │  ├─ list_tables    "List database tables"            │   │
│  │  └─ describe       "Describe table schema"           │   │
│  │                                                       │   │
│  │  app:api-tester                                      │   │
│  │  ├─ request        "Make HTTP request"               │   │
│  │  └─ save_request   "Save request to collection"      │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Discovery   │  │  Invocation  │  │  Permissions │      │
│  │              │  │              │  │              │      │
│  │  • Scan apps │  │  • Validate  │  │  • Check     │      │
│  │  • Extract   │  │  • Execute   │  │  • Approve   │      │
│  │  • Register  │  │  • Return    │  │  • Log       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Tool Namespacing:**

Tools are namespaced to prevent collisions:

```
{source}:{app-name}/{tool-name}

Examples:
  app:database-explorer/query       # Tool from an app
  builtin:filesystem/read           # Built-in Iris tool
  mcp:github/create_issue           # Tool from MCP server
```

**Tool Definition:**

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;

  // Execution
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;

  // Optional metadata
  category?: string;
  requiresApproval?: boolean;
  timeout?: number;

  // UI hints for the agent
  examples?: ToolExample[];
  relatedTools?: string[];
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;

  // Rich output for agent
  summary?: string;        // Human-readable summary
  artifacts?: Artifact[];  // Files, images, etc.
}
```

### 4. Service Runner

The Service Runner manages long-running processes defined by apps.

```
┌─────────────────────────────────────────────────────────────┐
│                      SERVICE RUNNER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Service Pool                         │   │
│  │                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ db-conn     │  │ api-server  │  │ watcher     │  │   │
│  │  │ ● running   │  │ ● running   │  │ ○ stopped   │  │   │
│  │  │ pid: 1234   │  │ pid: 1235   │  │             │  │   │
│  │  │ 2m uptime   │  │ 5m uptime   │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Process Management        Health Monitoring                 │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │ • Spawn      │         │ • Heartbeat  │                 │
│  │ • Signal     │         │ • Restart    │                 │
│  │ • Stream I/O │         │ • Backoff    │                 │
│  │ • Cleanup    │         │ • Alerts     │                 │
│  └──────────────┘         └──────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Service Types:**

| Type | Description | Example |
|------|-------------|---------|
| **Process** | External command | `bun run server.ts` |
| **Internal** | In-process service | Database connection pool |
| **Managed** | Iris-supervised | Dev servers, watchers |

**Service Definition:**

```typescript
interface ServiceDefinition {
  name: string;
  description?: string;

  // For process services
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;

  // For internal services
  start?: (ctx: ServiceContext) => Promise<unknown>;
  stop?: (instance: unknown) => Promise<void>;

  // Lifecycle
  autoStart?: boolean;     // Start when app activates
  restartOnCrash?: boolean;
  maxRestarts?: number;
  restartDelay?: number;   // Exponential backoff base

  // Health
  healthCheck?: () => Promise<boolean>;
  healthInterval?: number;
}
```

### 5. App Host (Frontend)

The App Host renders app UIs with isolation and error handling.

```
┌─────────────────────────────────────────────────────────────┐
│                        APP HOST                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tab Container                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │  [My App]  [Other Tab]  [+]                  │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │              App Frame                       │    │   │
│  │  │  ┌───────────────────────────────────────┐  │    │   │
│  │  │  │                                       │  │    │   │
│  │  │  │           iframe sandbox              │  │    │   │
│  │  │  │                                       │  │    │   │
│  │  │  │    App UI renders here               │  │    │   │
│  │  │  │    Isolated from Iris shell          │  │    │   │
│  │  │  │                                       │  │    │   │
│  │  │  └───────────────────────────────────────┘  │    │   │
│  │  │                                             │    │   │
│  │  │  ┌───────────────────────────────────────┐  │    │   │
│  │  │  │  Bridge Layer (postMessage)           │  │    │   │
│  │  │  └───────────────────────────────────────┘  │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Error Overlay (when app crashes)                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚠️ Error in App.tsx:42                              │   │
│  │  TypeError: Cannot read 'map' of undefined           │   │
│  │                                                       │   │
│  │  [View Source]  [Retry]  [Stop App]                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Isolation Strategy:**

| Concern | Solution |
|---------|----------|
| **JavaScript** | iframe with separate context |
| **CSS** | iframe boundary prevents bleed |
| **Crashes** | Caught by error boundary, doesn't affect shell |
| **Memory** | iframe can be destroyed to reclaim |
| **Security** | sandbox attribute restricts capabilities |

**Bridge Protocol:**

The App Host and iframe communicate via postMessage:

```typescript
// Host → App
{ type: 'iris:init', payload: { projectId, theme, ... } }
{ type: 'iris:theme', payload: { theme: 'dark' } }
{ type: 'iris:state', payload: { key: 'users', value: [...] } }

// App → Host
{ type: 'iris:ready' }
{ type: 'iris:action', payload: { name: 'query', args: {...} } }
{ type: 'iris:navigate', payload: { path: '/files/...' } }
{ type: 'iris:error', payload: { message, stack, file, line } }
```

## Data Flow

### Development Mode

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Developer  │     │    Iris     │     │    App      │
│             │     │   (Host)    │     │  (iframe)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Edit server.ts   │                   │
       │──────────────────▶│                   │
       │                   │                   │
       │                   │  Hot reload       │
       │                   │  server module    │
       │                   │                   │
       │                   │  Push state       │
       │                   │──────────────────▶│
       │                   │                   │
       │                   │                   │  Re-render
       │                   │                   │  with new state
       │                   │                   │
       │  Edit App.tsx     │                   │
       │──────────────────▶│                   │
       │                   │                   │
       │                   │  Vite HMR         │
       │                   │──────────────────▶│
       │                   │                   │
       │                   │                   │  Fast refresh
       │                   │                   │  (preserves state)
       │                   │                   │
```

### Tool Invocation

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │     │    Iris     │     │    App      │     │   App UI    │
│             │     │   Server    │     │  Runtime    │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  Tool call:       │                   │                   │
       │  app:myapp/query  │                   │                   │
       │──────────────────▶│                   │                   │
       │                   │                   │                   │
       │                   │  Route to app     │                   │
       │                   │──────────────────▶│                   │
       │                   │                   │                   │
       │                   │                   │  Execute tool     │
       │                   │                   │  Update state     │
       │                   │                   │                   │
       │                   │                   │  Push state       │
       │                   │                   │──────────────────▶│
       │                   │                   │                   │
       │                   │  Return result    │                   │  Re-render
       │                   │◀──────────────────│                   │
       │                   │                   │                   │
       │  Result + state   │                   │                   │
       │◀──────────────────│                   │                   │
       │                   │                   │                   │
```

## Deployment Architecture

### Standalone Mode

When an Iris App runs standalone (outside Iris):

```
┌─────────────────────────────────────────────────────────────┐
│                     STANDALONE APP                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  @iris/runtime                        │   │
│  │                                                       │   │
│  │  Minimal runtime that provides:                      │   │
│  │  • State management                                  │   │
│  │  • Tool execution (without AI, via API)             │   │
│  │  • Service management                                │   │
│  │  • WebSocket server for UI                          │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │   Server Bundle      │  │   UI Bundle          │        │
│  │   (dist/server.js)   │  │   (dist/ui/)         │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                              │
│  No iframe needed - UI served directly                      │
│  Tools accessible via REST API                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Installed Mode

When an app is installed in another project:

```
┌─────────────────────────────────────────────────────────────┐
│                    IRIS (Host Project)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Installed App: database-explorer@1.2.0             │   │
│  │                                                       │   │
│  │  Source: npm:@iris-apps/database-explorer           │   │
│  │  Location: .iris/apps/database-explorer/            │   │
│  │                                                       │   │
│  │  • Pre-built bundles (no Vite needed)              │   │
│  │  • Tools registered in project scope               │   │
│  │  • Services run on demand                           │   │
│  │  • UI loads in iframe from static files            │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Backend Runtime** | Bun | Fast startup, native TypeScript, hot reload |
| **Frontend Build** | Vite | Fast HMR, modern ESM, great DX |
| **UI Framework** | React | Ecosystem, React Native for mobile |
| **State** | Custom (signals-inspired) | Simple, predictable, serializable |
| **IPC** | WebSocket + postMessage | Real-time, bidirectional, secure |
| **Schema** | Zod | Runtime validation, TypeScript inference |
| **Mobile** | React Native | Code sharing, native performance |

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY ZONES                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 1: Iris Core (Trusted)                        │   │
│  │                                                       │   │
│  │  • Full system access                                │   │
│  │  • Manages all apps                                  │   │
│  │  • Controls permissions                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 2: App Server (Sandboxed by Permissions)      │   │
│  │                                                       │   │
│  │  • Declared permissions only                         │   │
│  │  • Project-scoped file access                        │   │
│  │  • Network access if permitted                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 3: App UI (iframe Sandbox)                    │   │
│  │                                                       │   │
│  │  • No direct system access                           │   │
│  │  • Communication only via bridge                     │   │
│  │  • Cannot escape iframe                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

*Next: [02-app-model.md](./02-app-model.md) - Detailed app model and lifecycle*
