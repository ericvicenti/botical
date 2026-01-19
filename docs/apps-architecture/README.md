# Iris Apps Architecture

> **Building the future of AI-integrated application development**

This documentation describes the architecture for **Iris Apps** — a revolutionary system where applications are developed inside the Iris IDE, expose tools to AI agents, run with full error resilience during development, and can be deployed standalone or shared with others.

## Quick Links

| Document | Description |
|----------|-------------|
| [00-vision.md](./00-vision.md) | The vision, philosophy, and "why" behind Iris Apps |
| [01-architecture.md](./01-architecture.md) | System architecture with Server-Defined Rendering |
| [02-app-model.md](./02-app-model.md) | App structure, lifecycle, and single-file apps |
| [03-sdk-design.md](./03-sdk-design.md) | SDK APIs: defineApp, state, tools, @iris/ui |
| [04-security-model.md](./04-security-model.md) | Permissions and SDR security benefits |
| [05-resilience.md](./05-resilience.md) | Error handling and development experience |
| [06-protocol.md](./06-protocol.md) | Communication protocols (SDR & bridge) |
| [07-implementation-roadmap.md](./07-implementation-roadmap.md) | Phased implementation plan |

## Core Concepts

### What is an Iris App?

An Iris App is a single-file application that:

1. **Runs inside Iris** — As a tab in your project, with instant hot reload
2. **Exposes tools to AI** — The agent can interact with your app's functionality
3. **Handles errors gracefully** — Broken code shows helpful errors, not crashes
4. **Can run standalone** — Deploy independently with `@iris/runtime`
5. **Works everywhere** — Same code runs on web and mobile (React Native)

### Server-Defined Rendering (SDR)

Most Iris Apps use SDR — the server defines what the UI looks like using a simple component tree:

```typescript
// server.ts - A complete Iris App
import { defineApp, state } from '@iris/app-sdk';
import { Stack, Text, Button } from '@iris/ui';

export default defineApp({
  state: {
    count: state(0),
  },

  ui: (ctx) => (
    Stack({ padding: 24, gap: 16 }, [
      Text({ size: '4xl' }, ctx.state.count),
      Button({
        onPress: () => ctx.state.count.update(n => n + 1),
      }, '+1'),
    ])
  ),
});
```

**Why SDR?**
- **Single file** — No separate frontend build, no React boilerplate
- **Instant hot reload** — Change code, see results immediately
- **Mobile native** — Same code renders natively on phones
- **Secure by default** — UI is just data, not executable code
- **AI-friendly** — Simple enough for AI to generate and modify

### The Two Modes

```
┌─────────────────────────────────────────────────────────────────┐
│                    IRIS APP MODES                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SDR MODE (Default)                                              │
│  • Single server.ts file                                        │
│  • ui() function returns component tree                         │
│  • Rendered by @iris/ui component registry                      │
│  • Best for: Most apps, data tools, dashboards                  │
│                                                                  │
│  CUSTOM UI MODE (Escape Hatch)                                   │
│  • Full React app in ui/ folder                                 │
│  • Runs in sandboxed iframe                                     │
│  • Bridge protocol for state/tools                              │
│  • Best for: 3D, canvas, complex interactions                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### App Structure

**SDR App (most apps):**
```
my-app/
├── app.json        # Manifest
└── server.ts       # Everything: state, tools, UI
```

**Custom UI App (escape hatch):**
```
my-app/
├── app.json        # Manifest with ui.mode: "custom"
├── server.ts       # State, tools, services
└── ui/             # Full React app
    ├── index.html
    └── src/App.tsx
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA FLOW (SDR)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SERVER                              CLIENT                      │
│                                                                  │
│  ┌─────────────┐                    ┌─────────────┐             │
│  │  App State  │                    │ State Store │             │
│  │  count: 5   │◄──── WebSocket ───►│  count: 5   │             │
│  └──────┬──────┘                    └──────┬──────┘             │
│         │                                  │                     │
│         ▼                                  ▼                     │
│  ┌─────────────┐                    ┌─────────────┐             │
│  │   ui(ctx)   │    Component Tree  │SDR Renderer │             │
│  │   returns   │──────────────────►│   renders   │             │
│  │   tree      │    (JSON data)     │   React     │             │
│  └─────────────┘                    └──────┬──────┘             │
│                                            │                     │
│                                            ▼                     │
│                                     ┌─────────────┐             │
│                                     │  Native UI  │             │
│                                     │  (Web/RN)   │             │
│                                     └─────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **Single-file simplicity** — Most apps are just `app.json` + `server.ts`
2. **AI-native** — Tools are first-class citizens, easily callable by agents
3. **Resilient by default** — Errors are informative, not fatal
4. **Cross-platform** — Same code runs on web, iOS, Android
5. **Security through simplicity** — SDR means no arbitrary code execution

## Security Model

Like VS Code extensions, Iris Apps are trusted based on their source:

- **Development apps** — Full project access (you're the developer)
- **Installed apps** — Declared permissions, approved at install
- **Untrusted apps** — Minimal permissions, explicit approval required

SDR provides additional security: the UI is just data rendered by trusted components, not arbitrary JavaScript that could steal data or cause harm.

See [04-security-model.md](./04-security-model.md) for details.

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | 📋 Planned | Manifest, loader, component registry |
| Phase 2: SDR Core | 📋 Planned | ui() execution, rendering |
| Phase 3: State & Tools | 📋 Planned | Reactive state, hot reload |
| Phase 4: SDK & DX | 📋 Planned | @iris/app-sdk, @iris/ui |
| Phase 5: Platform Integration | 📋 Planned | AI, filesystem, permissions |
| Phase 6: Production | 📋 Planned | Custom UI, mobile, standalone |

See [07-implementation-roadmap.md](./07-implementation-roadmap.md) for the detailed plan.

## Example App

A database explorer that lets you browse and query SQLite databases:

```typescript
// server.ts
import { defineApp, defineTool, state } from '@iris/app-sdk';
import { Stack, Input, Button, DataTable, Alert } from '@iris/ui';
import { z } from 'zod';

export default defineApp({
  state: {
    query: state('SELECT * FROM users LIMIT 10'),
    results: state<any[]>([]),
    error: state<string | null>(null),
  },

  tools: [
    defineTool({
      name: 'query',
      description: 'Execute a SQL query',
      parameters: z.object({ sql: z.string() }),
      execute: async ({ sql }, ctx) => {
        try {
          const db = await ctx.getService('database');
          const results = await db.query(sql);
          ctx.state.results.set(results);
          ctx.state.error.set(null);
          return { rowCount: results.length };
        } catch (e) {
          ctx.state.error.set(e.message);
          return { error: e.message };
        }
      },
    }),
  ],

  ui: (ctx) => (
    Stack({ padding: 16, gap: 16 }, [
      Input({
        value: ctx.state.query,
        onChangeText: ctx.state.query.set,
        multiline: true,
      }),
      Button({
        onPress: () => ctx.runTool('query', { sql: ctx.state.query.get() }),
      }, 'Run Query'),
      ctx.state.error.get() && Alert({ variant: 'error' }, ctx.state.error),
      DataTable({ data: ctx.state.results }),
    ])
  ),
});
```

## Getting Involved

This architecture is designed to be:

- **Reviewable** — Read through the docs and provide feedback
- **Iterative** — We'll refine as we learn
- **Extensible** — Designed to accommodate future needs

Questions? Ideas? Open an issue or discuss in the team channel.

---

*"The best way to predict the future is to invent it." — Alan Kay*
