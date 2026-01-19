# Iris Apps: SDK Design

## Overview

The Iris App SDK provides a unified developer experience for building apps that run inside Iris and standalone. The SDK is split into two main packages:

```
@iris/app-sdk
├── /server     Server-side APIs (tools, state, services)
├── /react      React hooks and components for UI
├── /runtime    Standalone runtime (for deployment)
└── /types      Shared TypeScript types
```

## Design Principles

### 1. Progressive Disclosure
Simple things should be simple. Complex things should be possible.

```typescript
// Simple: Define a tool in 5 lines
defineTool({
  name: 'hello',
  description: 'Say hello',
  parameters: z.object({ name: z.string() }),
  execute: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
});

// Complex: Full control when needed
defineTool({
  name: 'query',
  description: '...',
  parameters: z.object({ sql: z.string() }),
  execute: async (args, ctx) => {
    ctx.progress('Connecting...');
    const db = await ctx.getService('db');
    ctx.progress('Executing query...');
    // ...
  },
  confirmationRequired: true,
  timeout: 60000,
  permissions: ['filesystem:read'],
});
```

### 2. Type Safety Throughout
Full TypeScript support with inference. No runtime surprises.

```typescript
// Types flow from schema to handler to result
const tool = defineTool({
  parameters: z.object({
    userId: z.string(),
    includeProfile: z.boolean().optional(),
  }),
  // args is typed as { userId: string; includeProfile?: boolean }
  execute: async (args) => {
    const user = await getUser(args.userId);
    // Return type is inferred
    return { user, timestamp: Date.now() };
  },
});
```

### 3. Familiar Patterns
Use patterns developers already know (React hooks, Zod, etc.).

```typescript
// Feels like React Query
const users = useQuery('users');

// Feels like useState
const [count, setCount] = useAppState('count');

// Feels like event handlers
<Button onPress={() => runTool('increment')}>+1</Button>
```

### 4. Resilient by Default
Errors are expected. Handle them gracefully.

```typescript
// Tools can't crash the app
const result = await runTool('query', { sql });
if (result.success) {
  setResults(result.data.rows);
} else {
  setError(result.error);
}

// UI errors show friendly overlays, not white screens
// Server errors are caught and surfaced
```

## Server SDK (`@iris/app-sdk/server`)

### App Definition

```typescript
import {
  defineApp,
  defineTool,
  state,
  computed,
  query,
  mutation,
} from '@iris/app-sdk/server';
import { z } from 'zod';

export default defineApp({
  // State definitions
  state: {
    count: state(0),
    items: state<Item[]>([]),
    selectedId: state<string | null>(null),
  },

  // Computed values
  computed: {
    selectedItem: computed((get) => {
      const items = get('items');
      const id = get('selectedId');
      return items.find(i => i.id === id);
    }),
    itemCount: computed((get) => get('items').length),
  },

  // Async data
  queries: {
    remoteItems: query(async (ctx) => {
      const response = await ctx.fetch('https://api.example.com/items');
      return response.json();
    }, {
      staleTime: 60_000,
    }),
  },

  // Tools exposed to AI and UI
  tools: [
    defineTool({
      name: 'add_item',
      description: 'Add a new item to the list',
      parameters: z.object({
        title: z.string().describe('Item title'),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async (args, ctx) => {
        const item: Item = {
          id: crypto.randomUUID(),
          title: args.title,
          priority: args.priority ?? 'medium',
          createdAt: Date.now(),
        };
        ctx.state.items.update(list => [...list, item]);
        return { success: true, item };
      },
    }),
  ],

  // Background services
  services: {
    sync: {
      start: async (ctx) => {
        // Start sync service
        return startSyncService(ctx);
      },
      stop: async (service) => {
        await service.close();
      },
      autoStart: true,
    },
  },

  // Lifecycle hooks
  onActivate: async (ctx) => {
    ctx.log.info('App activated');
  },

  onDeactivate: async (ctx) => {
    ctx.log.info('App deactivated');
  },
});
```

### State API

```typescript
import { state, computed, query, mutation } from '@iris/app-sdk/server';

// Primitive state
const count = state(0);
count.get();              // 0
count.set(5);             // Set to 5
count.update(n => n + 1); // Increment

// With options
const history = state<string[]>([], {
  persist: true,           // Save to disk
  persistKey: 'history',   // Custom storage key
  sync: true,              // Sync to UI (default: true)
  maxHistory: 100,         // Keep last N values for undo
});

// Computed state
const doubled = computed(() => count.get() * 2);
doubled.get(); // Always up-to-date

// Query state (async with caching)
const users = query(async (ctx) => {
  const res = await ctx.fetch('/api/users');
  return res.json();
}, {
  staleTime: 60_000,       // Fresh for 1 minute
  cacheTime: 300_000,      // Cache for 5 minutes
  refetchOnFocus: true,    // Refetch when app visible
  retry: 3,                // Retry failed requests
});

users.get();          // Current data (may be undefined)
users.load();         // Force load, returns promise
users.invalidate();   // Clear cache

// Mutation state (async operations)
const createUser = mutation(
  async (data: CreateUserInput, ctx) => {
    const res = await ctx.fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  {
    onMutate: (data, ctx) => {
      // Optimistic update
    },
    onSuccess: (result, data, ctx) => {
      users.invalidate();
    },
    onError: (error, data, ctx, rollback) => {
      rollback();
    },
  }
);
```

### Tool Definition API

```typescript
import { defineTool } from '@iris/app-sdk/server';
import { z } from 'zod';

const queryTool = defineTool({
  // Required
  name: 'query',
  description: 'Execute a SQL query',
  parameters: z.object({
    sql: z.string().describe('SQL query to execute'),
    params: z.array(z.unknown()).optional(),
  }),
  execute: async (args, ctx) => {
    // Implementation
  },

  // Optional metadata
  category: 'database',
  tags: ['sql', 'data'],

  // Behavior
  confirmationRequired: true,   // Prompt user before running
  timeout: 30_000,              // Execution timeout
  retryable: false,             // Can AI retry on failure

  // Permissions (elevated beyond app permissions)
  permissions: [],

  // Documentation
  examples: [
    {
      description: 'Select all users',
      input: { sql: 'SELECT * FROM users' },
      output: { rows: [{ id: 1, name: 'Alice' }] },
    },
  ],

  // Return type (for documentation/validation)
  returns: z.object({
    rows: z.array(z.unknown()),
    count: z.number(),
  }),
});
```

### Context API

```typescript
interface AppContext {
  // Identity
  appId: string;
  appName: string;
  appVersion: string;
  projectId: string;
  projectPath: string;

  // State access
  state: StateMap;       // All state handles
  queries: QueryMap;     // All query handles

  // Services
  getService<T>(name: string): Promise<T>;
  startService(name: string): Promise<void>;
  stopService(name: string): Promise<void>;
  restartService(name: string): Promise<void>;

  // Configuration
  getConfig<T = unknown>(path: string): Promise<T>;
  setConfig<T>(path: string, value: T): Promise<void>;
  onConfigChange(path: string, handler: (value: unknown) => void): () => void;

  // Iris Platform Access (requires permissions)
  iris: {
    // AI capabilities
    ai: {
      chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
      embed(text: string | string[]): Promise<number[][]>;
      complete(prompt: string, options?: CompleteOptions): Promise<string>;
    };

    // Filesystem (scoped by permissions)
    fs: {
      read(path: string): Promise<string>;
      write(path: string, content: string): Promise<void>;
      list(path: string): Promise<FileInfo[]>;
      exists(path: string): Promise<boolean>;
      watch(path: string, handler: (event: FSEvent) => void): () => void;
    };

    // Other Iris tools
    tools: {
      list(): Promise<ToolInfo[]>;
      call(name: string, args: unknown): Promise<ToolResult>;
    };

    // Other apps (requires iris:apps permission)
    apps: {
      list(): Promise<AppInfo[]>;
      call(appName: string, toolName: string, args: unknown): Promise<ToolResult>;
    };

    // UI navigation
    navigate(path: string): void;
    openTab(tabData: TabData): void;

    // Notifications
    notify(message: string, options?: NotifyOptions): void;
  };

  // Network (scoped by permissions)
  fetch: typeof fetch;

  // Logging
  log: {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };

  // Events
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
}
```

### Iris Platform Integration

The SDK provides safe access to Iris capabilities:

```typescript
// Using AI (requires ai:chat permission)
const response = await ctx.iris.ai.chat([
  { role: 'user', content: 'Summarize this data' },
], {
  model: 'claude-sonnet',
  maxTokens: 1000,
});

// Reading files (requires filesystem:read permission)
const content = await ctx.iris.fs.read('/path/to/file.txt');

// Calling other tools (requires iris:tools permission)
const result = await ctx.iris.tools.call('builtin:bash', {
  command: 'ls -la',
});

// Navigating Iris UI (requires iris:navigation permission)
ctx.iris.navigate(`/projects/${ctx.projectId}/files/src/index.ts`);

// Cross-app communication (requires iris:apps permission)
const dbResult = await ctx.iris.apps.call('database-explorer', 'query', {
  sql: 'SELECT * FROM users',
});
```

## React SDK (`@iris/app-sdk/react`)

### Provider Setup

```tsx
// ui/src/main.tsx
import { IrisAppProvider } from '@iris/app-sdk/react';
import App from './App';

// Provider connects to app server via bridge
ReactDOM.createRoot(document.getElementById('root')!).render(
  <IrisAppProvider>
    <App />
  </IrisAppProvider>
);
```

### State Hooks

```tsx
import {
  useAppState,
  useComputed,
  useQuery,
  useMutation,
  useAppContext,
} from '@iris/app-sdk/react';

function MyComponent() {
  // Subscribe to primitive state
  const [count, setCount] = useAppState('count');
  // count: number
  // setCount: (value: number | (prev: number) => number) => void

  // Subscribe to computed state
  const doubled = useComputed('doubled');
  // doubled: number (read-only)

  // Subscribe to query state
  const users = useQuery('users');
  // users: { data?: User[], isLoading: boolean, error?: Error, refetch: () => void }

  // Get mutation handle
  const createUser = useMutation('createUser');
  // createUser: { mutate: (args) => Promise, isLoading: boolean, error?: Error }

  // Access full app context
  const ctx = useAppContext();
  // ctx: { appId, projectId, theme, ... }

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>

      <p>Doubled: {doubled}</p>

      {users.isLoading ? (
        <Spinner />
      ) : (
        <ul>
          {users.data?.map(user => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      )}

      <button
        onClick={() => createUser.mutate({ name: 'New User' })}
        disabled={createUser.isLoading}
      >
        Add User
      </button>
    </div>
  );
}
```

### Tool Hooks

```tsx
import { useTool, useToolCall } from '@iris/app-sdk/react';

function QueryRunner() {
  // Full tool control
  const queryTool = useTool('query');
  // queryTool: {
  //   call: (args) => Promise<ToolResult>,
  //   isRunning: boolean,
  //   lastResult?: ToolResult,
  //   lastError?: Error,
  //   reset: () => void,
  // }

  // Simple one-shot call
  const [runQuery, queryState] = useToolCall('query');
  // runQuery: (args) => Promise<ToolResult>
  // queryState: { isRunning, result?, error? }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await queryTool.call({ sql: e.target.sql.value });
    if (result.success) {
      setResults(result.data.rows);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea name="sql" placeholder="Enter SQL..." />
      <button disabled={queryTool.isRunning}>
        {queryTool.isRunning ? 'Running...' : 'Execute'}
      </button>
      {queryTool.lastError && (
        <p className="error">{queryTool.lastError.message}</p>
      )}
    </form>
  );
}
```

### Iris Integration Hooks

```tsx
import {
  useIrisAI,
  useIrisFS,
  useIrisTools,
  useIrisNavigation,
  useIrisNotifications,
} from '@iris/app-sdk/react';

function AIAssistant() {
  const ai = useIrisAI();

  const handleAsk = async (question: string) => {
    const response = await ai.chat([
      { role: 'user', content: question }
    ]);
    return response.content;
  };

  // ...
}

function FileBrowser() {
  const fs = useIrisFS();
  const [files, setFiles] = useState<FileInfo[]>([]);

  useEffect(() => {
    fs.list('/src').then(setFiles);
  }, []);

  // ...
}

function ToolCaller() {
  const tools = useIrisTools();

  const handleBash = async () => {
    const result = await tools.call('builtin:bash', {
      command: 'git status',
    });
    // ...
  };

  // ...
}

function Navigation() {
  const nav = useIrisNavigation();

  return (
    <button onClick={() => nav.openFile('/src/index.ts')}>
      Open Source
    </button>
  );
}
```

### Event Hooks

```tsx
import { useAppEvent, useAppEmit } from '@iris/app-sdk/react';

function ConnectionStatus() {
  const [status, setStatus] = useState('unknown');

  // Subscribe to events
  useAppEvent('connection:status', (payload) => {
    setStatus(payload.status);
  });

  // Emit events
  const emit = useAppEmit();

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={() => emit('connection:reconnect')}>
        Reconnect
      </button>
    </div>
  );
}
```

### Theme Integration

```tsx
import { useIrisTheme, IrisThemeProvider } from '@iris/app-sdk/react';

function ThemedComponent() {
  const { theme, isDark } = useIrisTheme();
  // theme: 'light' | 'dark' | 'auto'
  // isDark: boolean (resolved)

  return (
    <div className={isDark ? 'dark-mode' : 'light-mode'}>
      {/* ... */}
    </div>
  );
}

// Or use the provider for CSS variable integration
function App() {
  return (
    <IrisThemeProvider>
      {/* Child components get Iris theme CSS variables */}
      <ThemedComponent />
    </IrisThemeProvider>
  );
}
```

### Error Boundary

```tsx
import { AppErrorBoundary, useAppError } from '@iris/app-sdk/react';

function App() {
  return (
    <AppErrorBoundary
      fallback={({ error, resetError, viewSource }) => (
        <div className="error-screen">
          <h2>Something went wrong</h2>
          <p>{error.message}</p>
          <button onClick={resetError}>Try Again</button>
          {error.file && (
            <button onClick={viewSource}>View Source</button>
          )}
        </div>
      )}
    >
      <MainContent />
    </AppErrorBoundary>
  );
}

// Or handle errors manually
function SafeComponent() {
  const { error, clearError, reportError } = useAppError();

  const handleRiskyOperation = async () => {
    try {
      await riskyOperation();
    } catch (e) {
      reportError(e);
    }
  };

  if (error) {
    return <ErrorDisplay error={error} onDismiss={clearError} />;
  }

  return <NormalUI onRisky={handleRiskyOperation} />;
}
```

## Runtime SDK (`@iris/app-sdk/runtime`)

For standalone deployment:

```typescript
// standalone.ts
import { createRuntime } from '@iris/app-sdk/runtime';
import app from './server';

const runtime = createRuntime({
  app,
  port: 3000,

  // Provide implementations for Iris services
  implementations: {
    // Simple in-memory config
    config: new InMemoryConfigStore(),

    // Or connect to external services
    ai: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  },

  // Standalone mode settings
  standalone: {
    serveUI: true,        // Serve UI from dist/
    cors: true,           // Enable CORS for API
    auth: 'api-key',      // Require API key for tool calls
  },
});

runtime.start().then(() => {
  console.log('App running at http://localhost:3000');
});
```

## CLI Integration

The SDK includes CLI commands for development:

```bash
# Create new app from template
iris app create my-app

# Start development mode
iris app dev

# Build for production
iris app build

# Run standalone
iris app start

# Publish to registry
iris app publish
```

## Type Generation

Types are automatically generated from your app definition:

```typescript
// .iris/types.d.ts (auto-generated)
declare module '@iris/app-sdk/react' {
  interface AppState {
    count: number;
    items: Item[];
    selectedId: string | null;
  }

  interface AppComputed {
    selectedItem: Item | undefined;
    itemCount: number;
  }

  interface AppQueries {
    remoteItems: Item[];
  }

  interface AppTools {
    add_item: {
      params: { title: string; priority?: 'low' | 'medium' | 'high' };
      result: { success: boolean; item: Item };
    };
  }
}
```

This enables full autocomplete and type checking:

```tsx
// TypeScript knows the shape of everything
const [count, setCount] = useAppState('count');
//     ^-- number        ^-- (value: number) => void

const result = await runTool('add_item', { title: 'Test' });
//    ^-- { success: boolean; item: Item }
```

---

*Next: [04-security-model.md](./04-security-model.md) - Security, permissions, and sandboxing*
