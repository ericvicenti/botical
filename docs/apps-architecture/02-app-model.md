# Iris Apps: App Model & Lifecycle

## The App Model

An Iris App is a self-contained unit that combines:

1. **Server Logic** - Tools, state, services (runs in Iris backend)
2. **User Interface** - React frontend (runs in sandboxed iframe)
3. **Manifest** - Declaration of capabilities and requirements

```
┌─────────────────────────────────────────────────────────────┐
│                       IRIS APP                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     Manifest                          │  │
│  │                    (app.json)                         │  │
│  │                                                        │  │
│  │  • Identity (name, version, description)              │  │
│  │  • Capabilities (tools, services)                     │  │
│  │  • Requirements (permissions, dependencies)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐   │
│  │     Server Module      │  │      UI Module         │   │
│  │     (server.ts)        │  │      (ui/)             │   │
│  │                        │  │                        │   │
│  │  • defineApp()         │  │  • React components    │   │
│  │  • State definitions   │  │  • useApp() hooks      │   │
│  │  • Tool handlers       │  │  • Event handlers      │   │
│  │  • Service configs     │  │  • Styling             │   │
│  │  • Lifecycle hooks     │  │                        │   │
│  └────────────────────────┘  └────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Manifest Schema

The `app.json` manifest declares everything about an app:

```json
{
  "$schema": "https://iris.dev/schemas/app.json",

  "name": "database-explorer",
  "displayName": "Database Explorer",
  "version": "1.0.0",
  "description": "Browse and query SQLite databases",
  "icon": "database",
  "author": "developer@example.com",
  "license": "MIT",

  "iris": {
    "minVersion": "0.1.0"
  },

  "server": {
    "entry": "server.ts"
  },

  "ui": {
    "entry": "ui/index.html",
    "devPort": 5174
  },

  "tools": [
    {
      "name": "query",
      "description": "Execute a SQL query against the database",
      "confirmationRequired": true
    },
    {
      "name": "list_tables",
      "description": "List all tables in the database"
    }
  ],

  "services": [
    {
      "name": "connection",
      "description": "Database connection pool",
      "autoStart": true
    }
  ],

  "permissions": [
    "filesystem:read",
    "filesystem:write:$PROJECT",
    "network:localhost",
    "ai:chat"
  ],

  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "defaultDatabase": {
          "type": "string",
          "description": "Path to default database file"
        },
        "maxConnections": {
          "type": "number",
          "default": 5
        }
      }
    }
  },

  "dependencies": {
    "better-sqlite3": "^9.0.0"
  }
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (lowercase, hyphens) |
| `displayName` | Yes | Human-readable name |
| `version` | Yes | Semver version |
| `description` | No | Brief description |
| `icon` | No | Icon identifier (from Lucide icons) |
| `author` | No | Author email or name |
| `license` | No | SPDX license identifier |
| `iris.minVersion` | No | Minimum Iris version required |
| `server.entry` | Yes | Path to server module |
| `ui.entry` | No | Path to UI entry (if app has UI) |
| `ui.devPort` | No | Port for Vite dev server |
| `tools` | No | Tools exposed to AI agent |
| `services` | No | Background services |
| `permissions` | Yes | Required permissions |
| `configuration` | No | User-configurable settings |
| `dependencies` | No | npm dependencies to install |

## Permission Model

Permissions control what an app can access in the Iris environment.

### Permission Categories

```
┌─────────────────────────────────────────────────────────────┐
│                    PERMISSION CATEGORIES                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FILESYSTEM                                                  │
│  ├─ filesystem:read           Read any file                 │
│  ├─ filesystem:read:$PROJECT  Read within project only      │
│  ├─ filesystem:read:$APP      Read within app directory     │
│  ├─ filesystem:write          Write any file                │
│  ├─ filesystem:write:$PROJECT Write within project only     │
│  └─ filesystem:write:$APP     Write within app directory    │
│                                                              │
│  NETWORK                                                     │
│  ├─ network:*                 Any network access            │
│  ├─ network:localhost         Localhost only                │
│  ├─ network:fetch             HTTP requests only            │
│  └─ network:websocket         WebSocket connections         │
│                                                              │
│  AI                                                          │
│  ├─ ai:chat                   Use chat completions          │
│  ├─ ai:embed                  Use embeddings                │
│  └─ ai:tools                  Invoke other tools via AI     │
│                                                              │
│  PROCESS                                                     │
│  ├─ process:spawn             Spawn child processes         │
│  ├─ process:spawn:$APP        Spawn only in app directory   │
│  └─ process:env               Access environment variables  │
│                                                              │
│  IRIS                                                        │
│  ├─ iris:tools                Call other Iris tools         │
│  ├─ iris:apps                 Interact with other apps      │
│  ├─ iris:navigation           Navigate Iris UI              │
│  └─ iris:notifications        Show notifications            │
│                                                              │
│  SYSTEM                                                      │
│  ├─ system:clipboard          Access clipboard              │
│  └─ system:notifications      OS notifications              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Permission Scopes

Permissions can be scoped to limit access:

| Scope | Meaning |
|-------|---------|
| `$PROJECT` | Current project directory |
| `$APP` | App's own directory |
| `$CONFIG` | App's configuration directory |
| `$DATA` | App's data directory |
| Domain pattern | e.g., `network:*.example.com` |

### Permission Inheritance

```
Development Mode:
  App in project "my-project"
  ├─ Inherits project permissions
  ├─ Has elevated debug permissions
  └─ Can be granted additional permissions interactively

Installed Mode:
  App installed from registry
  ├─ Only declared permissions
  ├─ User approval required at install
  └─ No runtime permission escalation

Standalone Mode:
  App running independently
  ├─ Full access (no sandbox)
  └─ User controls via deployment config
```

## App Lifecycle

### State Machine

```
                    ┌─────────────┐
                    │  DISCOVERED │
                    └──────┬──────┘
                           │ load()
                           ▼
                    ┌─────────────┐
            ┌───────│   LOADING   │───────┐
            │       └──────┬──────┘       │
            │              │              │
       load error     load success    dependency
            │              │            error
            │              ▼              │
            │       ┌─────────────┐       │
            │       │   LOADED    │       │
            │       └──────┬──────┘       │
            │              │              │
            │         activate()          │
            │              │              │
            │              ▼              │
            │       ┌─────────────┐       │
            │  ┌────│  STARTING   │────┐  │
            │  │    └──────┬──────┘    │  │
            │  │           │           │  │
            │  │    onActivate()       │  │
            │  │      success          │  │
            │  │           │           │  │
            │  │           ▼           │  │
            │  │    ┌─────────────┐    │  │
            │  │    │   ACTIVE    │◀───┼──┼──── reload()
            │  │    └──────┬──────┘    │  │
            │  │           │           │  │
            │  │      deactivate()     │  │
            │  │           │           │  │
            │  │           ▼           │  │
            │  │    ┌─────────────┐    │  │
            │  │    │  STOPPING   │    │  │
            │  │    └──────┬──────┘    │  │
            │  │           │           │  │
            │  │    onDeactivate()     │  │
            │  │           │           │  │
            │  │           ▼           │  │
            │  │    ┌─────────────┐    │  │
            └──┼───▶│   STOPPED   │◀───┘  │
               │    └──────┬──────┘       │
               │           │              │
               │      unload()            │
               │           │              │
               │           ▼              │
               │    ┌─────────────┐       │
               └───▶│  UNLOADED   │◀──────┘
                    └─────────────┘
                           │
                      ┌────┴────┐
                      ▼         ▼
               ┌─────────┐ ┌─────────┐
               │  ERROR  │ │DESTROYED│
               └─────────┘ └─────────┘
```

### Lifecycle Hooks

Apps can define hooks for lifecycle events:

```typescript
export default defineApp({
  // Called when app is first loaded (module evaluation)
  // Use for static initialization
  onLoad: async (ctx) => {
    console.log('App module loaded');
  },

  // Called when app becomes active (user opens it or Iris starts)
  // Use for connecting to services, loading data
  onActivate: async (ctx) => {
    await ctx.startService('connection');
    const lastQuery = await ctx.getConfig('lastQuery');
    if (lastQuery) {
      ctx.state.currentQuery.set(lastQuery);
    }
  },

  // Called when app is being deactivated
  // Use for cleanup, saving state
  onDeactivate: async (ctx) => {
    await ctx.setConfig('lastQuery', ctx.state.currentQuery.get());
    await ctx.stopService('connection');
  },

  // Called when app is being hot-reloaded during development
  // Previous state is passed so you can migrate if needed
  onReload: async (ctx, previousState) => {
    // Migrate state if schema changed
    if (previousState.version !== STATE_VERSION) {
      ctx.state.data.set(migrateState(previousState.data));
    }
  },

  // Called when an error occurs in the app
  // Return true to indicate error was handled
  onError: async (ctx, error) => {
    ctx.log.error('App error:', error);
    ctx.state.lastError.set(error.message);
    return true; // Error handled, don't crash
  },
});
```

### Lifecycle Events

The app runtime emits events during lifecycle transitions:

| Event | Payload | Description |
|-------|---------|-------------|
| `app:loading` | `{ appId }` | App load started |
| `app:loaded` | `{ appId, manifest }` | App loaded successfully |
| `app:load-error` | `{ appId, error }` | App failed to load |
| `app:activating` | `{ appId }` | App activation started |
| `app:activated` | `{ appId }` | App is now active |
| `app:activate-error` | `{ appId, error }` | Activation failed |
| `app:deactivating` | `{ appId }` | App deactivation started |
| `app:deactivated` | `{ appId }` | App is now stopped |
| `app:reloading` | `{ appId }` | Hot reload started |
| `app:reloaded` | `{ appId }` | Hot reload complete |
| `app:error` | `{ appId, error }` | Runtime error occurred |

## State Model

Apps manage state through a reactive system that syncs with the UI.

### State Types

```typescript
// 1. Primitive State - Simple reactive values
const count = state(0);
const user = state<User | null>(null);
const items = state<Item[]>([]);

// 2. Computed State - Derived from other state
const doubleCount = computed(() => count.get() * 2);
const activeItems = computed(() => items.get().filter(i => i.active));

// 3. Query State - Async data with caching
const users = query(async () => {
  const response = await fetch('/api/users');
  return response.json();
}, {
  staleTime: 60000,      // Consider fresh for 1 minute
  cacheTime: 300000,     // Keep in cache for 5 minutes
  refetchOnFocus: true,  // Refetch when app becomes visible
});

// 4. Mutation State - Async operations with optimistic updates
const updateUser = mutation(async (userId: string, data: Partial<User>) => {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return response.json();
}, {
  onMutate: (userId, data) => {
    // Optimistic update
    const prev = users.get().find(u => u.id === userId);
    users.update(list => list.map(u => u.id === userId ? {...u, ...data} : u));
    return { prev };
  },
  onError: (error, userId, data, context) => {
    // Rollback on error
    users.update(list => list.map(u => u.id === userId ? context.prev : u));
  },
});
```

### State Serialization

State is automatically serialized for:
- **UI Sync** - Sent to iframe via postMessage
- **Hot Reload** - Preserved across code changes
- **Persistence** - Optionally saved to disk

```typescript
// State with custom serialization
const connection = state<DatabaseConnection | null>(null, {
  // Don't sync to UI (not serializable)
  sync: false,

  // Don't persist (recreate on reload)
  persist: false,
});

// State with persistence
const history = state<QueryHistory[]>([], {
  persist: true,
  persistKey: 'query-history',
});
```

### State Access from UI

The UI accesses state through the bridge:

```typescript
// In app UI (React)
function QueryHistory() {
  // Subscribes to state updates
  const history = useAppState('history');

  // Call server-side mutations
  const clearHistory = useAppAction('clearHistory');

  return (
    <ul>
      {history.map(item => (
        <li key={item.id}>{item.query}</li>
      ))}
      <button onClick={() => clearHistory()}>Clear</button>
    </ul>
  );
}
```

## Tool Model

Tools are functions that AI agents (and the UI) can invoke.

### Tool Definition

```typescript
defineTool({
  // Identity
  name: 'query',
  description: 'Execute a SQL query against the connected database',

  // Parameter schema (Zod)
  parameters: z.object({
    sql: z.string().describe('The SQL query to execute'),
    params: z.array(z.unknown()).optional().describe('Query parameters'),
  }),

  // Return schema (optional, for documentation)
  returns: z.object({
    rows: z.array(z.record(z.unknown())),
    rowCount: z.number(),
    executionTime: z.number(),
  }),

  // Execution handler
  execute: async (args, ctx) => {
    const db = await ctx.getService('connection');
    const start = Date.now();

    try {
      const rows = await db.query(args.sql, args.params);
      return {
        success: true,
        data: {
          rows,
          rowCount: rows.length,
          executionTime: Date.now() - start,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  // Metadata
  category: 'database',
  confirmationRequired: true,  // Ask user before executing
  timeout: 30000,              // 30 second timeout

  // Examples for AI context
  examples: [
    {
      description: 'Get all users',
      args: { sql: 'SELECT * FROM users' },
    },
    {
      description: 'Find user by email',
      args: {
        sql: 'SELECT * FROM users WHERE email = ?',
        params: ['user@example.com'],
      },
    },
  ],
});
```

### Tool Execution Context

```typescript
interface ToolContext extends AppContext {
  // Caller information
  caller: {
    type: 'ai' | 'ui' | 'api';
    agentId?: string;      // If called by AI
    sessionId?: string;    // AI session
    userId?: string;       // User who initiated
  };

  // Progress reporting
  progress: (message: string, percent?: number) => void;

  // Cancellation
  signal: AbortSignal;

  // Tool-specific permissions (may be elevated)
  permissions: PermissionSet;
}
```

### Tool Results

Tools return structured results:

```typescript
interface ToolResult {
  success: boolean;

  // On success
  data?: unknown;

  // On failure
  error?: string;
  errorCode?: string;

  // Rich output
  summary?: string;           // Human-readable summary for AI
  artifacts?: Artifact[];     // Files, images created

  // Side effects
  stateUpdates?: Record<string, unknown>;  // State changes to apply
  notifications?: Notification[];           // User notifications
}

interface Artifact {
  type: 'file' | 'image' | 'chart' | 'table';
  name: string;
  path?: string;      // For files
  data?: unknown;     // For inline data
  mimeType?: string;
}
```

## Service Model

Services are long-running processes or connections managed by the app.

### Service Definition

```typescript
// Process service (external command)
const devServer: ServiceDefinition = {
  name: 'dev-server',
  type: 'process',
  command: 'bun',
  args: ['run', 'dev'],
  cwd: './server',
  env: {
    PORT: '3001',
  },
  autoStart: false,
  restartOnCrash: true,
  healthCheck: async () => {
    const res = await fetch('http://localhost:3001/health');
    return res.ok;
  },
};

// Internal service (in-process)
const dbConnection: ServiceDefinition = {
  name: 'connection',
  type: 'internal',

  start: async (ctx) => {
    const config = await ctx.getConfig('database');
    const db = new Database(config.path);

    // Run migrations
    await db.exec(MIGRATIONS);

    return db;
  },

  stop: async (db) => {
    await db.close();
  },

  autoStart: true,
};
```

### Service Access

```typescript
// In tool or lifecycle hook
async execute(args, ctx) {
  // Get service instance (starts if needed)
  const db = await ctx.getService('connection');

  // Use service
  const result = await db.query(args.sql);

  return { success: true, data: result };
}
```

## Configuration Model

Apps can define configurable settings:

### Configuration Schema

```json
{
  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Path to database file"
            },
            "maxConnections": {
              "type": "number",
              "default": 5,
              "minimum": 1,
              "maximum": 20
            }
          },
          "required": ["path"]
        },
        "ui": {
          "type": "object",
          "properties": {
            "theme": {
              "type": "string",
              "enum": ["light", "dark", "auto"],
              "default": "auto"
            },
            "pageSize": {
              "type": "number",
              "default": 50
            }
          }
        }
      }
    }
  }
}
```

### Configuration Access

```typescript
// Server-side
const dbPath = await ctx.getConfig('database.path');
await ctx.setConfig('ui.theme', 'dark');

// Watch for changes
ctx.onConfigChange('database', async (newConfig) => {
  await ctx.restartService('connection');
});
```

### Configuration UI

Iris auto-generates a settings UI from the schema, or apps can provide custom UI:

```typescript
// In app.json
{
  "configuration": {
    "schema": { ... },
    "ui": "ui/settings.html"  // Custom settings page
  }
}
```

---

*Next: [03-sdk-design.md](./03-sdk-design.md) - SDK API design and developer experience*
