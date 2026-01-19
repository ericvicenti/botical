# Iris Apps: Vision Document

## The Problem

Today's software development is fractured:

1. **IDEs are separate from runtime** - You write code in VS Code, but your app runs elsewhere. Context switching kills flow.

2. **AI assistants are disconnected** - AI can help write code, but it can't truly interact with your running application. It suggests; it doesn't collaborate.

3. **Extensions are second-class** - VS Code extensions can't really "do" things in your application. They're limited to IDE chrome, not application logic.

4. **Mobile is an afterthought** - Most development tools barely work on tablets, let alone phones. Yet mobile is where users spend their time.

5. **Deployment is a chasm** - The gap between "it works on my machine" and "it's deployed" remains enormous.

## The Vision

**Iris Apps** is a new paradigm where:

> *The application you're building is running inside the tool you're using to build it, and an AI agent can interact with both.*

### Core Principles

#### 1. Self-Hosted Development
You build Iris Apps inside Iris. The app runs as a tab alongside your code. Edit a file, see it update instantly. No separate terminal, no browser tab, no context switch.

```
┌─────────────────────────────────────────────────────────────┐
│ IRIS                                                        │
├─────────────┬───────────────────────────────────────────────┤
│ Files       │  [app.json] [server.ts] [▶ My App]           │
│ ├─ app.json │  ┌─────────────────────────────────────────┐ │
│ ├─ server.ts│  │                                         │ │
│ └─ ui/      │  │     Your app running live here          │ │
│   └─ App.tsx│  │                                         │ │
│             │  │     Edit code on left                   │ │
│             │  │     See changes instantly on right      │ │
│             │  │                                         │ │
│             │  └─────────────────────────────────────────┘ │
└─────────────┴───────────────────────────────────────────────┘
```

#### 2. AI-Native Architecture
Apps aren't just code—they expose **tools** that AI agents can use. The agent doesn't just help you write a database query; it can *run* the query through your app's exposed tool and see the results.

```typescript
// Your app exposes this tool
defineTool({
  name: 'query_database',
  description: 'Run a SQL query',
  execute: async ({ sql }) => db.query(sql)
})

// The AI agent can now:
// 1. Understand what your app does
// 2. Actually use it to accomplish tasks
// 3. Help users interact with YOUR app
```

#### 3. Graceful Degradation
During development, code breaks. That's normal. Iris Apps are resilient:

- **Broken UI?** Show an error overlay with source link, not a white screen
- **Server crash?** Catch it, show the stack trace, let the developer fix it
- **Partial functionality?** Keep working parts running while broken parts show helpful errors

The development experience should feel like pair programming with a safety net, not walking a tightrope.

#### 4. Universal Runtime
An Iris App runs in three modes from the same codebase:

| Mode | Context | Use Case |
|------|---------|----------|
| **Development** | Inside Iris IDE | Building the app |
| **Installed** | As a tab in any Iris project | Using the app as a tool |
| **Standalone** | Independent deployment | Production, sharing |

Write once. Run everywhere. Not as a compromise, but as a feature.

#### 5. Mobile-First
Iris Apps work beautifully on phones and tablets. Not "mobile-compatible"—truly mobile-first:

- Touch-optimized interactions
- Responsive layouts by default
- Native performance through React Native
- Develop on your iPad, deploy to the world

## What This Enables

### For Individual Developers
- Build custom tools that integrate with AI assistance
- Create personal productivity apps in minutes
- Prototype ideas with instant feedback
- Take your tools with you on any device

### For Teams
- Share internal tools as installable apps
- Standardize workflows across projects
- Give AI agents team-specific capabilities
- Collaborate on apps in real-time

### For the Ecosystem
- A new category of AI-enhanced applications
- Apps that get smarter as AI improves
- A marketplace of composable capabilities
- The bridge between code and conversation

## The Breakthrough

The key insight is this:

> **Applications and development environments have been artificially separated.**

When your app runs inside your development environment:
- The AI can see and interact with your actual application
- Errors become learning opportunities, not catastrophes
- The feedback loop approaches zero latency
- The boundary between "building" and "using" dissolves

This is not incremental improvement. This is a new way of creating software.

## Success Metrics

We'll know we've succeeded when:

1. **Developers build apps without leaving Iris** - No context switching to browsers, terminals, or other tools

2. **AI agents meaningfully use app tools** - Not just code suggestions, but actual tool invocation and result interpretation

3. **Broken code doesn't break flow** - Errors are informative and recoverable, not showstoppers

4. **Apps deploy with one command** - From development to production is a single step

5. **Mobile development feels native** - Building on a tablet is as natural as on a desktop

## What We're Not Building

To stay focused, we explicitly exclude:

- **A general-purpose IDE** - Iris is for Iris Apps, not arbitrary codebases
- **A no-code platform** - This is for developers who write code
- **A runtime without AI** - AI integration is core, not optional
- **A web-only solution** - Mobile parity is a requirement

## The Name

**Iris** - The messenger goddess, the rainbow bridge between worlds.

We're building the bridge between:
- Development and runtime
- Human intent and machine execution
- Code and conversation
- Desktop and mobile

**Iris Apps** - Applications that see, understand, and respond.

---

*"The best way to predict the future is to invent it." — Alan Kay*

*We're not predicting. We're building.*
