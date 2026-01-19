# Iris Apps: App Model & Lifecycle

## The App Model

An Iris App is a single-file application that combines:

1. **State** - Reactive values that drive the UI
2. **Tools** - Functions exposed to AI agents and the UI
3. **UI** - A function that returns a component tree (SDR)
4. **Services** - Optional background processes

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
│  │  • Requirements (permissions)                         │  │
│  │  • UI mode (sdr or custom)                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Server Module                       │  │
│  │                   (server.ts)                         │  │
│  │                                                        │  │
│  │  export default defineApp({                           │  │
│  │    state: { ... },      // Reactive state             │  │
│  │    tools: [ ... ],      // AI-callable functions      │  │
│  │    ui: (ctx) => ...,    // SDR UI function            │  │
│  │    services: { ... },   // Background services        │  │
│  │    onActivate: ...,     // Lifecycle hooks            │  │
│  │  })                                                   │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  For most apps: NO SEPARATE UI FOLDER                       │
│  The ui() function IS the UI                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## App Structure

### Minimal App (Single File)

```
my-app/
├── app.json        # Manifest
└── server.ts       # Everything else
```

### App with Assets

```
my-app/
├── app.json        # Manifest
├── server.ts       # App logic + UI
└── assets/         # Static files (optional)
    ├── icon.png
    └── data.json
```

### App with Custom UI (Escape Hatch)

```
my-app/
├── app.json        # Manifest with ui.mode: "custom"
├── server.ts       # Tools, state, services
└── ui/             # Full React app
    ├── index.html
    ├── vite.config.ts
    └── src/
        └── App.tsx
```

## Manifest Schema

### SDR App (Default)

```json
{
  "$schema": "https://iris.dev/schemas/app.json",

  "name": "database-explorer",
  "displayName": "Database Explorer",
  "version": "1.0.0",
  "description": "Browse and query SQLite databases",
  "icon": "database",

  "server": "server.ts",

  "tools": [
    {
      "name": "query",
      "description": "Execute a SQL query against the database"
    },
    {
      "name": "list_tables",
      "description": "List all tables in the database"
    }
  ],

  "permissions": [
    "filesystem:read:$PROJECT",
    "ai:chat"
  ]
}
```

### Custom UI App

```json
{
  "name": "3d-visualizer",
  "displayName": "3D Visualizer",
  "version": "1.0.0",

  "server": "server.ts",

  "ui": {
    "mode": "custom",
    "entry": "ui/index.html",
    "devPort": 5174
  },

  "tools": [...],
  "permissions": [...]
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (lowercase, hyphens) |
| `displayName` | Yes | Human-readable name |
| `version` | Yes | Semver version |
| `description` | No | Brief description |
| `icon` | No | Icon name (from Lucide icons) |
| `server` | Yes | Path to server module |
| `ui` | No | Custom UI config (omit for SDR) |
| `ui.mode` | No | `"sdr"` (default) or `"custom"` |
| `ui.entry` | Only for custom | Path to UI entry point |
| `tools` | No | Tools exposed to AI agent |
| `services` | No | Background services |
| `permissions` | Yes | Required permissions |

## Complete App Example

```typescript
// server.ts
import { defineApp, defineTool, state } from '@iris/app-sdk';
import { Stack, Heading, Input, Button, DataTable, Text, Alert } from '@iris/ui';
import { z } from 'zod';

export default defineApp({
  // Reactive state
  state: {
    query: state('SELECT * FROM users LIMIT 10'),
    results: state<any[]>([]),
    error: state<string | null>(null),
    isLoading: state(false),
  },

  // Tools exposed to AI agent
  tools: [
    defineTool({
      name: 'query',
      description: 'Execute a SQL query against the database',
      parameters: z.object({
        sql: z.string().describe('The SQL query to execute'),
      }),
      execute: async ({ sql }, ctx) => {
        ctx.state.isLoading.set(true);
        ctx.state.error.set(null);
        ctx.state.query.set(sql);

        try {
          const db = await ctx.getService('database');
          const results = await db.query(sql);
          ctx.state.results.set(results);
          return { success: true, rowCount: results.length };
        } catch (e) {
          ctx.state.error.set(e.message);
          return { success: false, error: e.message };
        } finally {
          ctx.state.isLoading.set(false);
        }
      },
    }),

    defineTool({
      name: 'list_tables',
      description: 'List all tables in the database',
      parameters: z.object({}),
      execute: async (_, ctx) => {
        const db = await ctx.getService('database');
        const tables = await db.query(
          "SELECT name FROM sqlite_master WHERE type='table'"
        );
        return { tables: tables.map(t => t.name) };
      },
    }),
  ],

  // Services
  services: {
    database: {
      start: async (ctx) => {
        const dbPath = await ctx.getConfig('databasePath');
        return new Database(dbPath);
      },
      stop: async (db) => {
        await db.close();
      },
      autoStart: true,
    },
  },

  // UI function - returns component tree
  ui: (ctx) => {
    const { query, results, error, isLoading } = ctx.state;

    return Stack({ padding: 16, gap: 16 }, [
      // Header
      Heading({ level: 1 }, 'Database Explorer'),

      // Query input
      Stack({ gap: 8 }, [
        Input({
          value: query,
          onChangeText: query.set,
          placeholder: 'Enter SQL query...',
          multiline: true,
          rows: 3,
        }),
        Button({
          onPress: () => ctx.runTool('query', { sql: query.get() }),
          disabled: isLoading,
        }, isLoading ? 'Running...' : 'Execute Query'),
      ]),

      // Error display
      error && Alert({ variant: 'error' }, error),

      // Results table
      results.length > 0 && DataTable({
        data: results,
        columns: Object.keys(results[0] || {}),
      }),

      // Empty state
      results.length === 0 && !error && !isLoading &&
        Text({ color: 'muted' }, 'Run a query to see results'),
    ]);
  },

  // Lifecycle
  onActivate: async (ctx) => {
    ctx.log.info('Database Explorer activated');
  },
});
```

## SDR UI Model

### Component Functions

UI is built with component functions that return component nodes:

```typescript
// Component function signature
function ComponentName(props: Props, children?: Children): ComponentNode

// Examples
Heading({ level: 1 }, 'Hello World')
Button({ onPress: handler, variant: 'primary' }, 'Click Me')
Stack({ gap: 8, padding: 16 }, [child1, child2, child3])
```

### Component Node Structure

```typescript
// What the component function returns
interface ComponentNode {
  $: 'component';
  type: string;              // 'Button', 'Stack', etc.
  props: Record<string, PropValue>;
  children?: UINode[];
}

// Example
Heading({ level: 1 }, 'Hello')
// Returns:
{
  $: 'component',
  type: 'Heading',
  props: { level: 1 },
  children: ['Hello']
}
```

### Conditional Rendering

```typescript
// Using && for conditional
error && Alert({ variant: 'error' }, error)

// Using ternary
isLoading ? Spinner({}) : Button({}, 'Submit')

// Filtering arrays
items.filter(item => item.visible).map(item => Card({}, item.name))
```

### Lists and Keys

```typescript
// Map over data with keys
items.map(item =>
  Card({ key: item.id }, [
    Text({ weight: 'bold' }, item.title),
    Text({ color: 'muted' }, item.description),
  ])
)
```

### Event Handlers

```typescript
// Direct state update
Input({
  value: ctx.state.query,
  onChangeText: ctx.state.query.set,
})

// Tool call
Button({
  onPress: () => ctx.runTool('submit', { data: ctx.state.form.get() }),
}, 'Submit')

// Custom handler
Button({
  onPress: { $action: 'increment', args: { amount: 5 } },
}, '+5')
```

### State References

```typescript
// Reading state in UI
Text({}, `Count: ${ctx.state.count}`)

// The ctx.state.count is reactive - UI updates when it changes
```

## State Model

### State Types

```typescript
import { state, computed, query } from '@iris/app-sdk';

// Primitive state - simple reactive value
const count = state(0);
const name = state('');
const items = state<Item[]>([]);

// Computed state - derived from other state
const doubled = computed((get) => get(count) * 2);
const filtered = computed((get) =>
  get(items).filter(i => i.active)
);

// Query state - async data with caching
const users = query(async (ctx) => {
  const response = await ctx.fetch('/api/users');
  return response.json();
}, {
  staleTime: 60_000,  // Fresh for 1 minute
});
```

### State Operations

```typescript
// Get current value
const current = count.get();

// Set new value
count.set(5);

// Update based on previous
count.update(n => n + 1);

// For arrays
items.update(list => [...list, newItem]);
items.update(list => list.filter(i => i.id !== id));

// Subscribe to changes (rarely needed - UI auto-subscribes)
const unsubscribe = count.subscribe(value => {
  console.log('Count changed:', value);
});
```

### State in UI Context

```typescript
ui: (ctx) => {
  // Access state values (reactive)
  const { count, items } = ctx.state;

  // Use in UI
  return Stack({}, [
    Text({}, `Count: ${count}`),
    Text({}, `Items: ${items.length}`),

    // Update state
    Button({ onPress: () => count.update(n => n + 1) }, '+1'),
  ]);
}
```

## Tool Model

### Tool Definition

```typescript
defineTool({
  // Required
  name: 'query',
  description: 'Execute a SQL query',
  parameters: z.object({
    sql: z.string().describe('SQL query to execute'),
    params: z.array(z.unknown()).optional(),
  }),
  execute: async (args, ctx) => {
    // Implementation
    return { success: true, data: results };
  },

  // Optional
  examples: [
    {
      description: 'Get all users',
      input: { sql: 'SELECT * FROM users' },
    },
  ],
})
```

### Tool Context

```typescript
interface ToolContext {
  // App identity
  appId: string;
  projectId: string;

  // State access
  state: StateMap;

  // Services
  getService<T>(name: string): Promise<T>;

  // Platform access
  iris: {
    ai: { chat, embed };
    fs: { read, write, list };
    tools: { call };
  };

  // Logging
  log: Logger;
}
```

### Calling Tools from UI

```typescript
ui: (ctx) => {
  return Button({
    onPress: async () => {
      const result = await ctx.runTool('query', {
        sql: ctx.state.query.get()
      });
      if (!result.success) {
        ctx.state.error.set(result.error);
      }
    }
  }, 'Run Query');
}
```

## Service Model

### Internal Service

```typescript
services: {
  database: {
    start: async (ctx) => {
      const config = await ctx.getConfig('database');
      const db = new Database(config.path);
      return db;
    },
    stop: async (db) => {
      await db.close();
    },
    autoStart: true,
  },
}

// Usage in tools
const db = await ctx.getService('database');
```

### Process Service

```typescript
services: {
  'dev-server': {
    type: 'process',
    command: 'npm',
    args: ['run', 'dev'],
    cwd: './server',
    env: { PORT: '3001' },
    autoStart: false,
  },
}
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
                    │   LOADING   │
                    └──────┬──────┘
                           │
                      ┌────┴────┐
                      ▼         ▼
               ┌─────────┐ ┌─────────┐
               │  ERROR  │ │  LOADED │
               └─────────┘ └────┬────┘
                                │ activate()
                                ▼
                         ┌─────────────┐
                         │   ACTIVE    │◄──── Hot reload
                         └──────┬──────┘      (re-run ui())
                                │
                           deactivate()
                                │
                                ▼
                         ┌─────────────┐
                         │   STOPPED   │
                         └─────────────┘
```

### Lifecycle Hooks

```typescript
export default defineApp({
  // Called when app becomes active
  onActivate: async (ctx) => {
    await ctx.startService('database');
    ctx.log.info('App activated');
  },

  // Called when app is deactivated
  onDeactivate: async (ctx) => {
    await ctx.stopService('database');
    ctx.log.info('App deactivated');
  },

  // Called on hot reload (state is preserved)
  onReload: async (ctx, previousState) => {
    ctx.log.info('App reloaded');
  },

  // Called when an error occurs
  onError: async (ctx, error) => {
    ctx.log.error('App error:', error);
    ctx.state.lastError.set(error.message);
    return true; // Error handled
  },
});
```

## Configuration

### Config Schema in Manifest

```json
{
  "configuration": {
    "properties": {
      "databasePath": {
        "type": "string",
        "description": "Path to SQLite database file",
        "default": "./data.db"
      },
      "maxResults": {
        "type": "number",
        "default": 100
      }
    }
  }
}
```

### Accessing Config

```typescript
// In tools or lifecycle hooks
const dbPath = await ctx.getConfig('databasePath');
await ctx.setConfig('maxResults', 50);

// Watch for changes
ctx.onConfigChange('databasePath', async (newPath) => {
  await ctx.restartService('database');
});
```

## Permission Model

### Permission Declaration

```json
{
  "permissions": [
    "filesystem:read:$PROJECT",
    "filesystem:write:$APP/data",
    "network:localhost",
    "ai:chat"
  ]
}
```

### Permission Scopes

| Scope | Description |
|-------|-------------|
| `$PROJECT` | Current project directory |
| `$APP` | App's directory |
| `$DATA` | App's data directory |
| Domain pattern | e.g., `*.example.com` |

### Permission Categories

- `filesystem:read`, `filesystem:write` - File access
- `network:*`, `network:localhost` - Network access
- `ai:chat`, `ai:embed` - AI model access
- `iris:tools` - Call other Iris tools
- `process:spawn` - Run shell commands

---

*Next: [03-sdk-design.md](./03-sdk-design.md) - SDK API design*
