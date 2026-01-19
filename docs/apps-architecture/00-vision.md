# Iris Apps: Vision Document

## The Problem

Today's software development is fractured:

1. **IDEs are separate from runtime** - You write code in VS Code, but your app runs elsewhere. Context switching kills flow.

2. **AI assistants are disconnected** - AI can help write code, but it can't truly interact with your running application. It suggests; it doesn't collaborate.

3. **Extensions are second-class** - VS Code extensions can't really "do" things in your application. They're limited to IDE chrome, not application logic.

4. **Mobile is an afterthought** - Most development tools barely work on tablets, let alone phones. Yet mobile is where users spend their time.

5. **UI and logic are entangled** - Building an app means maintaining separate frontend and backend codebases, build systems, and deployment pipelines.

## The Vision

**Iris Apps** is a new paradigm where:

> *The application you're building runs inside the tool you're using to build it, the UI is defined by your server code, and an AI agent can interact with everything.*

### Core Principles

#### 1. Server-Defined Rendering (SDR)

The breakthrough insight: **UI is just data**.

Instead of maintaining a separate frontend codebase, your server returns a component tree that the client renders. Change your server code, and the UI updates instantly.

```typescript
// Your entire app - server AND UI - in one file
export default defineApp({
  state: {
    query: state(''),
    results: state<Row[]>([]),
  },

  tools: [
    defineTool({
      name: 'run_query',
      description: 'Execute a SQL query',
      parameters: z.object({ sql: z.string() }),
      execute: async ({ sql }, ctx) => {
        const rows = await db.query(sql);
        ctx.state.results.set(rows);
        return { rowCount: rows.length };
      },
    }),
  ],

  ui: (ctx) => (
    Stack({ padding: 16, gap: 12 }, [
      Heading({}, 'Database Explorer'),
      Input({
        value: ctx.state.query,
        onChangeText: ctx.state.query.set,
        placeholder: 'SELECT * FROM ...',
      }),
      Button({ onPress: () => ctx.runTool('run_query', { sql: ctx.state.query }) },
        'Execute'
      ),
      ctx.state.results.length > 0 && DataTable({ data: ctx.state.results }),
    ])
  ),
});
```

No separate frontend. No build step for UI. No bundler configuration. Just describe what you want, and it renders—on web AND mobile.

#### 2. Self-Hosted Development

You build Iris Apps inside Iris. The app runs as a tab alongside your code. Edit your server file, see the UI update instantly.

```
┌─────────────────────────────────────────────────────────────┐
│ IRIS                                                        │
├─────────────┬───────────────────────────────────────────────┤
│ Files       │  [server.ts] [▶ My App]                       │
│             │  ┌─────────────────────────────────────────┐ │
│ ├─ app.json │  │                                         │ │
│ └─ server.ts│  │     Your app running live here          │ │
│             │  │                                         │ │
│             │  │     Edit code on left                   │ │
│             │  │     See changes instantly on right      │ │
│             │  │                                         │ │
│             │  └─────────────────────────────────────────┘ │
└─────────────┴───────────────────────────────────────────────┘
```

Notice: there's no `ui/` folder. No Vite. No React build. The UI IS the server code.

#### 3. AI-Native Architecture

Apps expose **tools** that AI agents can use. The agent doesn't just help you write code; it can *use* your app to accomplish tasks.

```typescript
// The AI agent can now:
// 1. Understand what your app does (from tool descriptions)
// 2. Actually use it ("Run a query to find all users")
// 3. See and interpret the results
// 4. Help users interact with YOUR app
```

#### 4. True Mobile-First

Because UI is rendered from component definitions, the same app works natively on mobile:

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   WEB                          MOBILE (React Native)        │
│                                                              │
│   Stack({ padding: 16 })   →   <View style={padding: 16}>  │
│   Text({ size: 'lg' })     →   <Text style={fontSize: 18}> │
│   Button({ onPress })      →   <Pressable onPress>         │
│   Input({ value })         →   <TextInput value>           │
│                                                              │
│   Same code. Native components. No WebView.                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 5. Graceful Degradation

During development, code breaks. That's normal. Iris Apps are resilient:

- **Server error?** Show the error with stack trace and source link
- **Invalid UI tree?** Render what's valid, highlight what's broken
- **Tool fails?** Return error state, don't crash the app

The development experience should feel like pair programming with a safety net.

#### 6. Universal Runtime

An Iris App runs in three modes from the same codebase:

| Mode | Context | Use Case |
|------|---------|----------|
| **Development** | Inside Iris IDE | Building the app |
| **Installed** | In any Iris project | Using the app as a tool |
| **Standalone** | Independent server | Production deployment |

Write once. Run everywhere. Not as a compromise, but as a feature.

## What This Enables

### For Individual Developers
- Build custom tools in a single file
- See changes instantly—no build step
- AI can use your tools immediately
- Works on your phone and tablet

### For Teams
- Share internal tools as installable apps
- Consistent UI via shared component library
- AI agents get team-specific capabilities
- Same app works on all devices

### For the Ecosystem
- Apps are tiny (just server code)
- Easy to review, audit, and trust
- Component library evolves independently
- Mobile and web parity by default

## Why Server-Defined Rendering?

The traditional approach:

```
Server Code  →  API  →  Frontend Code  →  Build  →  Bundle  →  Browser
     │                       │               │          │
     └─── Two codebases ─────┘               └── Slow ──┘
```

The SDR approach:

```
Server Code  →  Component Tree  →  Render
     │               │               │
     └── One file ───┴── Instant ────┘
```

**Benefits:**
- **Instant updates** - No build step, no bundling
- **Single source of truth** - UI logic lives with business logic
- **Mobile parity** - Same components render natively
- **Smaller apps** - No frontend bundle to ship
- **AI-friendly** - UI is introspectable data

**Trade-offs:**
- Limited to the component library (by design)
- Can't use arbitrary npm packages in UI (but can in server)
- Less flexibility for highly custom UIs

For the 90% of apps that are forms, lists, and data displays, SDR is dramatically simpler. For the 10% that need full control, we provide an escape hatch.

## The Escape Hatch

Some apps genuinely need full React control:
- 3D visualization (Three.js)
- Rich text editors (ProseMirror, TipTap)
- Canvas-based drawing
- Complex animations

For these, apps can opt into **Custom UI Mode**:

```json
{
  "ui": {
    "mode": "custom",
    "entry": "ui/index.html"
  }
}
```

Custom UI runs in a sandboxed context with a bridge to the server. It's more work to build but provides full flexibility when needed.

## Success Metrics

We'll know we've succeeded when:

1. **Most apps are single-file** - No separate UI codebase needed

2. **Mobile works automatically** - Apps built on desktop work on phones

3. **AI agents use apps naturally** - Tool invocation feels seamless

4. **Instant feedback** - Edit → See change is under 100ms

5. **Errors don't break flow** - Every error has a recovery path

## What We're Not Building

To stay focused, we explicitly exclude:

- **A general-purpose IDE** - Iris is for Iris Apps
- **A no-code platform** - This is for developers who write code
- **Arbitrary React apps** - SDR is the primary path; custom UI is the escape hatch
- **A web-only solution** - Mobile parity is a requirement

## The Name

**Iris** - The messenger goddess, the rainbow bridge between worlds.

We're building the bridge between:
- Server and UI (SDR)
- Development and runtime
- Human intent and machine execution
- Desktop and mobile

**Iris Apps** - Applications that see, understand, and respond.

---

*"The best way to predict the future is to invent it." — Alan Kay*

*We're not predicting. We're building.*
