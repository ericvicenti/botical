# Iris Apps: Resilience & Error Handling

## Philosophy

> **Broken code is normal. Broken experiences are not.**

During development, apps will constantly be in broken states. SDR makes error handling simpler because all logic runs on the server—we have full control over error recovery.

## Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **Server Load** | Syntax error in server.ts | Show error overlay, wait for fix |
| **Server Runtime** | Tool throws exception | Catch, show error in UI, don't crash |
| **UI Generation** | ui() returns invalid tree | Render valid parts, highlight broken |
| **Action Execution** | User action fails | Return error result, show message |

## SDR Error Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SDR ERROR HANDLING                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. Server Error (server.ts won't load)                                │
│      ┌────────────────────────────────────────────────────────┐        │
│      │  Show full error overlay:                               │        │
│      │  • Syntax error message                                 │        │
│      │  • File + line number                                   │        │
│      │  • "Open in Editor" button                              │        │
│      │  • Auto-reload when file changes                        │        │
│      └────────────────────────────────────────────────────────┘        │
│                                                                          │
│   2. UI Generation Error (ui() throws)                                  │
│      ┌────────────────────────────────────────────────────────┐        │
│      │  Show last valid UI + error banner:                     │        │
│      │  • Error message at top                                 │        │
│      │  • Stack trace in details                               │        │
│      │  • App still partially usable                           │        │
│      └────────────────────────────────────────────────────────┘        │
│                                                                          │
│   3. Invalid UI Tree (ui() returns bad data)                            │
│      ┌────────────────────────────────────────────────────────┐        │
│      │  Validate tree, render valid parts:                     │        │
│      │  • Unknown components → show placeholder                │        │
│      │  • Invalid props → use defaults                         │        │
│      │  • Show warnings in dev tools                           │        │
│      └────────────────────────────────────────────────────────┘        │
│                                                                          │
│   4. Action Error (tool execution fails)                                │
│      ┌────────────────────────────────────────────────────────┐        │
│      │  Return error to UI, let app handle:                    │        │
│      │  • { success: false, error: "message" }                 │        │
│      │  • App shows error via Alert component                  │        │
│      │  • No crash, no white screen                            │        │
│      └────────────────────────────────────────────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Server Load Errors

When server.ts fails to load (syntax error, missing import, etc.):

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ App Error: database-explorer                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SyntaxError: Unexpected token '}' at line 42                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  40 │   const result = await db.query(sql);            │    │
│  │  41 │   return { success: true, data: result           │    │
│  │  42 │   }  // ← Missing comma before this line         │    │
│  │  43 │ });                                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  server.ts:42:3                                                 │
│                                                                  │
│  [Open in Editor]  [Retry]                                      │
│                                                                  │
│  Watching for changes...                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- App shows error overlay instead of UI
- File watcher active—auto-retries on save
- User can click to open file at error location

## UI Generation Errors

When ui() throws during rendering:

```typescript
// This will throw
ui: (ctx) => {
  const user = ctx.state.user.get();
  return Stack({}, [
    Text({}, user.name),  // Error if user is null!
  ]);
}
```

**Error Display:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ UI Error                                        [Dismiss]   │
│  TypeError: Cannot read property 'name' of null                 │
│  at ui (server.ts:45)                                          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [Last valid UI rendered here]                                  │
│                                                                  │
│  User can still interact with existing UI                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Fix in Code:**

```typescript
ui: (ctx) => {
  const user = ctx.state.user.get();

  // Guard against null
  if (!user) {
    return Stack({ padding: 24 }, [
      Text({}, 'Please select a user'),
    ]);
  }

  return Stack({}, [
    Text({}, user.name),
  ]);
}
```

## Invalid UI Tree

When ui() returns invalid data:

```typescript
// Returns unknown component
ui: (ctx) => {
  return Stack({}, [
    MyCustomThing({ data: 'test' }),  // Not in registry!
  ]);
}
```

**Rendered:**

```
┌─────────────────────────────────────────────────────────────────┐
│  [Valid Stack renders]                                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  ⚠️ Unknown component: MyCustomThing                    │    │
│  │  This component is not in the @iris/ui registry        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Console Warning:**
```
[Iris] Unknown component "MyCustomThing" at path root.children[0]
Available components: Stack, Row, Text, Button, ...
```

## Action Execution Errors

Tools should return errors, not throw:

```typescript
// GOOD: Return error state
defineTool({
  name: 'query',
  execute: async (args, ctx) => {
    try {
      const result = await db.query(args.sql);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

// Handle in UI
ui: (ctx) => {
  const { error, results } = ctx.state;

  return Stack({}, [
    // Show error if present
    error && Alert({ variant: 'error' }, error),

    // Results
    results && DataTable({ data: results }),
  ]);
}
```

## Hot Reload Resilience

When code changes, state is preserved:

```
┌─────────────────────────────────────────────────────────────────┐
│                      HOT RELOAD FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. File change detected                                        │
│                                                                  │
│  2. Snapshot current state                                      │
│     { count: 5, items: [...], selectedId: 'abc' }              │
│                                                                  │
│  3. Unload old module                                           │
│                                                                  │
│  4. Load new module                                             │
│     ├── Success → Continue                                      │
│     └── Error → Show overlay, keep old module running           │
│                                                                  │
│  5. Restore state                                               │
│     ├── State exists in new module → Restore                   │
│     └── State removed → Drop (with warning)                     │
│                                                                  │
│  6. Re-run ui() with restored state                             │
│                                                                  │
│  7. Push new UI to client                                       │
│     (Client sees instant update, state preserved)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Migration

If state shape changes:

```typescript
export default defineApp({
  state: {
    // Renamed from 'count' to 'counter'
    counter: state(0),
  },

  onReload: async (ctx, previousState) => {
    // Migrate state
    if ('count' in previousState) {
      ctx.state.counter.set(previousState.count);
    }
  },
});
```

## Global Error Handler

Catch errors at the app level:

```typescript
export default defineApp({
  onError: async (ctx, error) => {
    // Log error
    ctx.log.error('App error:', error);

    // Update UI state
    ctx.state.lastError.set(error.message);

    // Return true = error handled, don't propagate
    // Return false = propagate to Iris error overlay
    return true;
  },
});
```

## Service Resilience

Services restart automatically on failure:

```typescript
services: {
  database: {
    start: async (ctx) => {
      return new Database(ctx.getConfig('dbPath'));
    },
    stop: async (db) => {
      await db.close();
    },

    // Restart on crash
    restartOnCrash: true,
    maxRestarts: 5,
    restartDelay: 1000,  // Exponential backoff base

    // Health check
    healthCheck: async (db) => {
      await db.query('SELECT 1');
      return true;
    },
    healthInterval: 30000,
  },
}
```

## Error Display Components

Use built-in components for error states:

```typescript
import { Alert, Spinner, Stack, Text, Button } from '@iris/ui';

ui: (ctx) => {
  const { isLoading, error, data } = ctx.state;

  // Loading state
  if (isLoading) {
    return Stack({ align: 'center', justify: 'center', minHeight: 200 }, [
      Spinner({ size: 'lg' }),
      Text({ color: 'muted' }, 'Loading...'),
    ]);
  }

  // Error state
  if (error) {
    return Stack({ padding: 16, gap: 12 }, [
      Alert({ variant: 'error', title: 'Error' }, error),
      Button({
        onPress: () => ctx.runTool('retry'),
        variant: 'outline',
      }, 'Retry'),
    ]);
  }

  // Success state
  return DataTable({ data });
}
```

## Console Logging

Apps can log to the Iris console:

```typescript
// In tools or lifecycle
ctx.log.debug('Debug info');
ctx.log.info('Something happened');
ctx.log.warn('Warning');
ctx.log.error('Error occurred', error);

// Logs appear in:
// 1. Iris console panel
// 2. Server terminal
// 3. Browser dev tools (in dev mode)
```

---

*Next: [06-protocol.md](./06-protocol.md) - Communication protocols*
