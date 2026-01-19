# Iris Apps Architecture

> **Building the future of AI-integrated application development**

This documentation describes the architecture for **Iris Apps** — a revolutionary system where applications are developed inside the Iris IDE, expose tools to AI agents, run with full error resilience during development, and can be deployed standalone or shared with others.

## Quick Links

| Document | Description |
|----------|-------------|
| [00-vision.md](./00-vision.md) | The vision, philosophy, and "why" behind Iris Apps |
| [01-architecture.md](./01-architecture.md) | System architecture and component overview |
| [02-app-model.md](./02-app-model.md) | App structure, lifecycle, and configuration |
| [03-sdk-design.md](./03-sdk-design.md) | SDK APIs for building apps (server + React) |
| [04-security-model.md](./04-security-model.md) | Permissions, sandboxing, and security |
| [05-resilience.md](./05-resilience.md) | Error handling and development experience |
| [06-protocol.md](./06-protocol.md) | Communication protocols between components |
| [07-implementation-roadmap.md](./07-implementation-roadmap.md) | Phased implementation plan |

## Core Concepts

### What is an Iris App?

An Iris App is a self-contained application that:

1. **Runs inside Iris** — As a tab in your project, with full hot reload
2. **Exposes tools to AI** — The agent can interact with your app's functionality
3. **Handles errors gracefully** — Broken code shows helpful errors, not crashes
4. **Can run standalone** — Deploy independently with `@iris/runtime`

### The Three Modes

```
┌─────────────────────────────────────────────────────────────┐
│                    IRIS APP MODES                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  DEVELOPMENT MODE                                            │
│  • App source lives in your project                         │
│  • Hot reload as you edit                                   │
│  • Full debugging and error overlays                        │
│  • AI agent can use your app's tools                        │
│                                                              │
│  INSTALLED MODE                                              │
│  • Pre-built app from registry or local path                │
│  • Runs in sandboxed environment                            │
│  • Tools available to AI agent                              │
│  • User approves permissions at install                     │
│                                                              │
│  STANDALONE MODE                                             │
│  • App runs independently with @iris/runtime                │
│  • Can be deployed anywhere                                 │
│  • API access to tools (without AI)                         │
│  • Same codebase as development mode                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### App Structure

```
my-iris-app/
├── app.json              # Manifest: name, tools, permissions
├── server.ts             # Backend: state, tools, services
└── ui/                   # Frontend: React application
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        └── App.tsx
```

### Key Principles

1. **Self-hosted development** — Build apps inside the app
2. **AI-native** — Tools are first-class citizens
3. **Resilient by default** — Errors are informative, not fatal
4. **Universal runtime** — Same code runs everywhere
5. **Security-first** — Permissions, sandboxing, audit logging

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         IRIS                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ App Manager  │  │ Tool Registry│  │Service Runner│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                  │
│                  ┌────────▼────────┐                        │
│                  │   App Runtime   │                        │
│                  │                 │                        │
│                  │  • State mgmt   │                        │
│                  │  • Tool exec    │                        │
│                  │  • Platform API │                        │
│                  └────────┬────────┘                        │
│                           │                                  │
│            ┌──────────────┼──────────────┐                  │
│            │              │              │                  │
│     ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐         │
│     │  App Host   │ │ AI Agent  │ │  Protocol   │         │
│     │  (iframe)   │ │Integration│ │   Layer     │         │
│     └─────────────┘ └───────────┘ └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Security Model

Apps have access to powerful capabilities but operate within strict security boundaries:

- **Permissions** — Apps declare required permissions in manifest
- **Sandboxing** — UI runs in iframe, server in restricted context
- **Audit logging** — All sensitive operations are logged
- **Trust levels** — Different trust for dev, installed, and unknown apps

See [04-security-model.md](./04-security-model.md) for details.

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation | 📋 Planned | Manifest, loader, basic display |
| Phase 2: Core Runtime | 📋 Planned | State, tools, bridge |
| Phase 3: SDK & DX | 📋 Planned | SDK package, CLI, hot reload |
| Phase 4: Platform Integration | 📋 Planned | AI, filesystem, cross-app |
| Phase 5: Security | 📋 Planned | Permissions, sandboxing |
| Phase 6: Production | 📋 Planned | Standalone, marketplace |

See [07-implementation-roadmap.md](./07-implementation-roadmap.md) for the detailed plan.

## Getting Involved

This architecture is designed to be:

- **Reviewable** — Read through the docs and provide feedback
- **Iterative** — We'll refine as we learn
- **Extensible** — Designed to accommodate future needs

Questions? Ideas? Open an issue or discuss in the team channel.

---

*"The best way to predict the future is to invent it." — Alan Kay*
