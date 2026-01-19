# Iris Apps: SDK Design

## Overview

The Iris App SDK enables developers to build apps with Server-Defined Rendering. The SDK is intentionally simple—most apps are a single file.

```
@iris/app-sdk
├── defineApp()       Define an app
├── defineTool()      Define a tool
├── state()           Create reactive state
├── computed()        Create derived state
├── query()           Create async query state
└── ...

@iris/ui
├── Stack, Row, Box   Layout components
├── Text, Heading     Typography
├── Button, Input     Form elements
├── DataTable, List   Data display
└── 100+ components   Full UI kit
```

## Quick Start

```typescript
// server.ts - A complete Iris App
import { defineApp, defineTool, state } from '@iris/app-sdk';
import { Stack, Text, Button } from '@iris/ui';
import { z } from 'zod';

export default defineApp({
  state: {
    count: state(0),
  },

  tools: [
    defineTool({
      name: 'increment',
      description: 'Increment the counter',
      parameters: z.object({
        amount: z.number().default(1),
      }),
      execute: async ({ amount }, ctx) => {
        ctx.state.count.update(n => n + amount);
        return { newValue: ctx.state.count.get() };
      },
    }),
  ],

  ui: (ctx) => (
    Stack({ padding: 24, gap: 16, align: 'center' }, [
      Text({ size: '4xl', weight: 'bold' }, ctx.state.count),
      Button({
        onPress: () => ctx.state.count.update(n => n + 1),
        size: 'lg',
      }, '+1'),
    ])
  ),
});
```

## Core API

### defineApp()

Creates an app definition:

```typescript
import { defineApp } from '@iris/app-sdk';

export default defineApp({
  // Reactive state (optional)
  state: {
    count: state(0),
    items: state<Item[]>([]),
  },

  // Computed values (optional)
  computed: {
    total: computed((get) => get('items').reduce((sum, i) => sum + i.price, 0)),
  },

  // Async queries (optional)
  queries: {
    users: query(async (ctx) => {
      return ctx.fetch('/api/users').then(r => r.json());
    }),
  },

  // Tools for AI and UI (optional)
  tools: [
    defineTool({ ... }),
  ],

  // Background services (optional)
  services: {
    database: { ... },
  },

  // UI function - returns component tree
  ui: (ctx) => {
    return Stack({}, [...]);
  },

  // Lifecycle hooks (optional)
  onActivate: async (ctx) => { ... },
  onDeactivate: async (ctx) => { ... },
  onReload: async (ctx) => { ... },
  onError: async (ctx, error) => { ... },
});
```

### defineTool()

Creates a tool that AI agents and the UI can call:

```typescript
import { defineTool } from '@iris/app-sdk';
import { z } from 'zod';

const queryTool = defineTool({
  // Required
  name: 'query',
  description: 'Execute a SQL query against the database',
  parameters: z.object({
    sql: z.string().describe('The SQL query'),
    limit: z.number().optional().default(100),
  }),
  execute: async (args, ctx) => {
    const db = await ctx.getService('database');
    const results = await db.query(args.sql, args.limit);
    ctx.state.lastQuery.set(args.sql);
    ctx.state.results.set(results);
    return { rowCount: results.length, rows: results };
  },

  // Optional
  examples: [
    { description: 'Get all users', input: { sql: 'SELECT * FROM users' } },
  ],
});
```

### state()

Creates reactive state:

```typescript
import { state } from '@iris/app-sdk';

// Primitive values
const count = state(0);
const name = state('');
const isActive = state(false);

// Complex values
const items = state<Item[]>([]);
const user = state<User | null>(null);
const form = state({ name: '', email: '' });

// With options
const history = state<string[]>([], {
  persist: true,           // Save to disk
  persistKey: 'history',   // Custom key
  maxLength: 100,          // Limit array length
});
```

**State Operations:**

```typescript
// Read
const value = count.get();

// Write
count.set(5);

// Update
count.update(n => n + 1);
items.update(list => [...list, newItem]);
items.update(list => list.filter(i => i.id !== targetId));

// In UI context, state is reactive
ui: (ctx) => {
  // This auto-updates when count changes
  return Text({}, `Count: ${ctx.state.count}`);
}
```

### computed()

Creates derived state:

```typescript
import { computed } from '@iris/app-sdk';

// Simple computation
const doubled = computed((get) => get('count') * 2);

// Derived from multiple states
const summary = computed((get) => {
  const items = get('items');
  const filter = get('filter');
  return items
    .filter(i => i.name.includes(filter))
    .map(i => i.name)
    .join(', ');
});

// Async computed (becomes a query)
const filteredUsers = computed(async (get, ctx) => {
  const filter = get('filter');
  const users = await ctx.queries.users.get();
  return users.filter(u => u.name.includes(filter));
});
```

### query()

Creates async data with caching:

```typescript
import { query } from '@iris/app-sdk';

const users = query(
  async (ctx) => {
    const response = await ctx.fetch('/api/users');
    return response.json();
  },
  {
    staleTime: 60_000,      // Fresh for 1 minute
    cacheTime: 300_000,     // Keep in cache for 5 minutes
    refetchOnMount: true,   // Refetch when app opens
    retry: 3,               // Retry failed requests
  }
);

// Usage
const data = users.get();        // Current data (may be undefined)
await users.load();              // Force load
users.invalidate();              // Clear cache
const isLoading = users.loading; // Loading state
const error = users.error;       // Error state
```

## UI Components (@iris/ui)

### Layout Components

```typescript
import { Stack, Row, Box, ScrollView, Divider } from '@iris/ui';

// Vertical stack
Stack({ gap: 8, padding: 16 }, [
  child1,
  child2,
])

// Horizontal row
Row({ gap: 8, justify: 'space-between' }, [
  left,
  right,
])

// Generic container
Box({ padding: 16, background: 'muted', rounded: 'lg' }, content)

// Scrollable area
ScrollView({ maxHeight: 400 }, longContent)

// Separator
Divider({ orientation: 'horizontal' })
```

### Typography

```typescript
import { Text, Heading, Code, Link } from '@iris/ui';

// Basic text
Text({}, 'Hello world')
Text({ size: 'lg', weight: 'bold', color: 'primary' }, 'Important')

// Headings
Heading({ level: 1 }, 'Page Title')
Heading({ level: 2 }, 'Section')

// Code
Code({ language: 'typescript' }, 'const x = 1')

// Links
Link({ href: '/other-page' }, 'Click here')
```

### Form Elements

```typescript
import { Button, Input, TextArea, Select, Checkbox, Switch } from '@iris/ui';

// Button
Button({ onPress: handler, variant: 'primary', size: 'lg' }, 'Submit')
Button({ onPress: handler, disabled: true }, 'Disabled')

// Text input
Input({
  value: ctx.state.name,
  onChangeText: ctx.state.name.set,
  placeholder: 'Enter name...',
})

// Number input
Input({
  type: 'number',
  value: ctx.state.amount,
  onChangeText: v => ctx.state.amount.set(Number(v)),
})

// Text area
TextArea({
  value: ctx.state.description,
  onChangeText: ctx.state.description.set,
  rows: 4,
})

// Select dropdown
Select({
  value: ctx.state.category,
  onValueChange: ctx.state.category.set,
  options: [
    { label: 'Option 1', value: 'opt1' },
    { label: 'Option 2', value: 'opt2' },
  ],
})

// Checkbox
Checkbox({
  checked: ctx.state.agreed,
  onCheckedChange: ctx.state.agreed.set,
  label: 'I agree to terms',
})

// Switch/toggle
Switch({
  checked: ctx.state.enabled,
  onCheckedChange: ctx.state.enabled.set,
})
```

### Data Display

```typescript
import { DataTable, List, Card, Badge, Avatar } from '@iris/ui';

// Data table
DataTable({
  data: ctx.state.users,
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (role) => Badge({}, role) },
  ],
  onRowClick: (row) => ctx.state.selected.set(row.id),
})

// List
List({
  data: ctx.state.items,
  renderItem: (item) => (
    Row({ gap: 8 }, [
      Avatar({ src: item.avatar }),
      Text({}, item.name),
    ])
  ),
})

// Card
Card({ padding: 16 }, [
  Heading({ level: 3 }, 'Card Title'),
  Text({}, 'Card content'),
])

// Badge
Badge({ variant: 'success' }, 'Active')
Badge({ variant: 'error' }, 'Failed')
```

### Feedback

```typescript
import { Alert, Spinner, Progress, Toast } from '@iris/ui';

// Alert
Alert({ variant: 'info', title: 'Note' }, 'This is informational')
Alert({ variant: 'error' }, 'Something went wrong')

// Loading spinner
Spinner({ size: 'lg' })

// Progress bar
Progress({ value: 0.7, max: 1 })

// Toast (triggered via context)
ctx.toast({ message: 'Saved!', variant: 'success' })
```

### Overlays

```typescript
import { Dialog, Sheet, Tooltip, Popover } from '@iris/ui';

// Dialog
Dialog({
  open: ctx.state.dialogOpen,
  onOpenChange: ctx.state.dialogOpen.set,
  title: 'Confirm',
}, [
  Text({}, 'Are you sure?'),
  Row({ gap: 8, justify: 'end' }, [
    Button({ onPress: () => ctx.state.dialogOpen.set(false) }, 'Cancel'),
    Button({ onPress: handleConfirm, variant: 'primary' }, 'Confirm'),
  ]),
])

// Tooltip
Tooltip({ content: 'More information' },
  Button({}, 'Hover me')
)
```

### Icons

```typescript
import { Icon } from '@iris/ui';

// Uses Lucide icons
Icon({ name: 'database', size: 24 })
Icon({ name: 'check', color: 'green' })
Icon({ name: 'x', color: 'red' })
```

### Specialized Components

```typescript
import { CodeEditor, Terminal, FileTree, Markdown } from '@iris/ui';

// Code editor
CodeEditor({
  value: ctx.state.code,
  onChange: ctx.state.code.set,
  language: 'typescript',
  theme: 'dark',
})

// Terminal output
Terminal({
  lines: ctx.state.logs,
  autoScroll: true,
})

// File tree
FileTree({
  files: ctx.state.files,
  onSelect: (path) => ctx.state.selectedFile.set(path),
})

// Markdown renderer
Markdown({}, ctx.state.readme)
```

## UI Context

The `ui` function receives a context with everything needed:

```typescript
ui: (ctx) => {
  // State access
  const { count, items, user } = ctx.state;

  // Computed values
  const { total, filteredItems } = ctx.computed;

  // Query data
  const users = ctx.queries.users;

  // Run tools
  const handleSubmit = () => ctx.runTool('submit', { data: form.get() });

  // Access Iris platform (if permitted)
  const handleAI = async () => {
    const response = await ctx.iris.ai.chat([
      { role: 'user', content: 'Summarize this' }
    ]);
  };

  // Show notifications
  ctx.toast({ message: 'Saved!', variant: 'success' });

  // Theme info
  const { theme, isDark } = ctx.theme;

  // App info
  const { appId, projectId } = ctx.app;

  return Stack({}, [...]);
}
```

## Platform Access

Apps can access Iris platform features through the context:

### AI Access

```typescript
// Requires: "ai:chat" permission
const response = await ctx.iris.ai.chat([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: userQuestion },
], {
  model: 'claude-sonnet',
  maxTokens: 1000,
});

// Requires: "ai:embed" permission
const embeddings = await ctx.iris.ai.embed(['text1', 'text2']);
```

### File System

```typescript
// Requires: "filesystem:read:$PROJECT" permission
const content = await ctx.iris.fs.read('src/index.ts');
const files = await ctx.iris.fs.list('src');
const exists = await ctx.iris.fs.exists('package.json');

// Requires: "filesystem:write:$APP/data" permission
await ctx.iris.fs.write('data/output.json', JSON.stringify(data));
```

### Other Tools

```typescript
// Requires: "iris:tools" permission
const result = await ctx.iris.tools.call('bash', {
  command: 'npm run build',
});
```

### Navigation

```typescript
// Requires: "iris:navigation" permission (usually implicit)
ctx.iris.navigate('/files/src/index.ts');
ctx.iris.openTab({ type: 'file', path: 'src/index.ts' });
```

## Type Safety

The SDK provides full TypeScript support:

```typescript
// Types are inferred from state definitions
const count = state(0);              // StateHandle<number>
const items = state<Item[]>([]);     // StateHandle<Item[]>

// Tool parameters are validated at runtime AND compile time
defineTool({
  parameters: z.object({
    id: z.string(),
    count: z.number(),
  }),
  execute: async (args, ctx) => {
    // args is typed as { id: string; count: number }
    args.id;    // string
    args.count; // number
  },
});

// Component props are typed
Button({
  onPress: () => {},  // required
  variant: 'primary', // 'primary' | 'secondary' | 'ghost' | ...
  size: 'lg',         // 'sm' | 'md' | 'lg'
  disabled: false,    // boolean
}, 'Click');
```

## Custom UI Mode

For apps that need full React control, opt into custom UI mode:

```json
{
  "ui": {
    "mode": "custom",
    "entry": "ui/index.html"
  }
}
```

Then create a full React app in `ui/`:

```typescript
// ui/src/App.tsx
import { useIrisApp, IrisAppProvider } from '@iris/app-sdk/react';

function App() {
  return (
    <IrisAppProvider>
      <CustomUI />
    </IrisAppProvider>
  );
}

function CustomUI() {
  const { state, runTool, iris } = useIrisApp();

  // Full React control
  return (
    <div>
      <ThreeJSVisualization data={state.data} />
      <button onClick={() => runTool('refresh')}>
        Refresh
      </button>
    </div>
  );
}
```

**Custom UI Hooks:**

```typescript
import {
  useIrisApp,      // Full app context
  useAppState,     // Single state value
  useRunTool,      // Tool execution
  useIrisAI,       // AI access
  useIrisFS,       // File system
} from '@iris/app-sdk/react';

function MyComponent() {
  const [count, setCount] = useAppState('count');
  const runTool = useRunTool();
  const ai = useIrisAI();

  // Use like regular React hooks
}
```

## Error Handling

### In Tools

```typescript
defineTool({
  execute: async (args, ctx) => {
    try {
      const result = await riskyOperation(args);
      return { success: true, data: result };
    } catch (error) {
      // Return error - don't throw
      return { success: false, error: error.message };
    }
  },
});
```

### In UI

```typescript
ui: (ctx) => {
  const { error, isLoading, data } = ctx.state;

  // Handle error states in UI
  if (error) {
    return Alert({ variant: 'error' }, error);
  }

  if (isLoading) {
    return Stack({ align: 'center', padding: 24 }, [
      Spinner({}),
      Text({}, 'Loading...'),
    ]);
  }

  return DataTable({ data });
}
```

### Global Error Handler

```typescript
export default defineApp({
  onError: async (ctx, error) => {
    ctx.log.error('App error:', error);
    ctx.state.lastError.set(error.message);

    // Return true to indicate error was handled
    // Return false or throw to propagate
    return true;
  },
});
```

---

*Next: [04-security-model.md](./04-security-model.md) - Security and permissions*
