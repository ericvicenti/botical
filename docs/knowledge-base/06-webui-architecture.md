# WebUI Architecture

This document describes the frontend architecture for Iris WebUI, including technology choices, patterns, and conventions.

---

## Overview

The WebUI is a React single-page application that communicates with the Iris backend via REST API and WebSocket. It provides a real-time interface for managing projects, sessions, missions, and processes.

```
┌──────────────────────────────────────────────────────────────┐
│                         WebUI                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │  TanStack   │ │  TanStack   │ │  WebSocket  │            │
│  │   Router    │ │   Query     │ │   Context   │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│         │               │               │                    │
│         ▼               ▼               ▼                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  React Components                      │   │
│  │   Routes → Layouts → Views → UI Components            │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                              │
              REST API (/api/*) + WebSocket (/ws)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                      Iris Backend                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Build Tool: Vite

Vite is used for development and production builds:

- **Hot Module Replacement (HMR)** for fast development
- **API Proxy** routes `/api/*` and `/ws` to backend during development
- **TanStack Router Plugin** for file-based routing code generation

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4096", changeOrigin: true },
      "/ws": { target: "ws://localhost:4096", ws: true },
    },
  },
});
```

### Runtime: Bun

Bun is used as the package manager and script runner:
- `bun install` - Install dependencies
- `bun run dev` - Start Vite dev server
- `bun run build` - Production build
- `bun run typecheck` - TypeScript validation

### React 19

Latest React version with:
- Concurrent features
- Improved suspense
- Better TypeScript support

### TanStack Router

File-based routing with full type safety:

```
src/routes/
├── __root.tsx              # Root layout (header, navigation)
├── index.tsx               # Home page (/)
└── projects/
    └── $projectId.tsx      # Project detail (/projects/:projectId)
```

Routes are auto-generated into `routeTree.gen.ts` by the Vite plugin.

### TanStack Query

Server state management with caching, background refetching, and optimistic updates:

```typescript
// Fetching data
const { data, isLoading } = useProjects();

// Mutations with cache invalidation
const createProject = useCreateProject();
await createProject.mutateAsync({ name: "New Project" });
```

### Tailwind CSS

Utility-first CSS with a custom dark theme (Catppuccin Mocha inspired):

```typescript
// tailwind.config.ts
colors: {
  bg: {
    primary: "#1e1e2e",
    secondary: "#181825",
    elevated: "#313244",
  },
  text: {
    primary: "#cdd6f4",
    secondary: "#a6adc8",
    muted: "#6c7086",
  },
  accent: {
    primary: "#89b4fa",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
  },
  border: "#45475a",
}
```

---

## Directory Structure

```
webui/
├── index.html              # HTML entry point
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tailwind.config.ts      # Tailwind theme
├── tsconfig.json           # TypeScript config
│
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Root component with providers
    ├── routeTree.gen.ts    # Auto-generated route tree
    │
    ├── routes/             # File-based routes
    │   ├── __root.tsx      # Root layout
    │   ├── index.tsx       # Home page
    │   └── projects/
    │       └── $projectId.tsx
    │
    ├── components/         # Reusable components
    │   └── ui/             # Base UI primitives
    │
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts   # HTTP client wrapper
    │   │   ├── queries.ts  # TanStack Query hooks
    │   │   └── types.ts    # API response types
    │   ├── websocket/
    │   │   ├── context.tsx # WebSocket provider
    │   │   └── events.ts   # Event handlers
    │   └── utils/
    │       └── cn.ts       # Class name utility
    │
    ├── contexts/
    │   └── ui.tsx          # UI state (sidebar, theme)
    │
    ├── styles/
    │   └── globals.css     # Tailwind imports + custom styles
    │
    └── types/
        └── index.ts        # Shared TypeScript types
```

---

## Core Patterns

### Provider Stack

The app wraps components in a provider hierarchy:

```tsx
// src/App.tsx
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <UIProvider>
          <RouterProvider router={router} />
        </UIProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}
```

### API Client

A typed wrapper around fetch:

```typescript
// src/lib/api/client.ts
export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.json());
  }

  const data = await response.json();
  return data.data ?? data;
}
```

### Query Hooks

TanStack Query hooks for data fetching:

```typescript
// src/lib/api/queries.ts
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const response = await apiClientRaw<Project[]>("/api/projects");
      return response.data;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => apiClient<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
```

### WebSocket Integration

WebSocket events automatically invalidate TanStack Query caches:

```typescript
// src/lib/websocket/events.ts
export function handleWebSocketEvent(event: WSEvent, queryClient: QueryClient) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      queryClient.invalidateQueries({
        queryKey: ["projects", event.payload.projectId, "sessions"],
      });
      break;
    // ... other events
  }
}
```

### Class Name Utility

Combines clsx and tailwind-merge for conditional classes:

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn(
  "px-4 py-2 rounded",
  isActive && "bg-accent-primary",
  disabled && "opacity-50"
)} />
```

---

## State Management

### Server State (TanStack Query)

All data from the backend is managed by TanStack Query:
- Automatic caching
- Background refetching
- Optimistic updates
- Request deduplication

### Client State (React Context)

UI-only state lives in React contexts:

```typescript
// src/contexts/ui.tsx
interface UIState {
  sidebarCollapsed: boolean;
  sidebarPanel: "nav" | "files" | "git" | "run";
  bottomPanelVisible: boolean;
  bottomPanelTab: "output" | "problems" | "services";
  theme: "dark" | "light";
}
```

### WebSocket State

Connection status and subscription management:

```typescript
const { status, send, subscribe, unsubscribe } = useWebSocket();
```

---

## WebSocket Protocol

### Connecting

WebSocket connects automatically on app load with exponential backoff reconnection.

### Subscribing to Rooms

```typescript
// Subscribe to project events
send({ type: "subscribe", room: `project:${projectId}` });

// Subscribe to session events
send({ type: "subscribe", room: `session:${sessionId}` });
```

### Receiving Events

Events from the server trigger query cache invalidations, keeping the UI in sync without polling.

---

## Styling Conventions

### Dark Theme First

The app uses a dark theme by default with the `dark` class on `<html>`.

### Tailwind Utilities

Use Tailwind utility classes directly in components:

```tsx
<button className="px-4 py-2 bg-accent-primary text-bg-primary rounded-lg hover:bg-accent-primary/90">
  Click me
</button>
```

### Custom Scrollbar

```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: theme("colors.border") transparent;
}
```

---

## Development Workflow

### Start Development

```bash
# Terminal 1: Backend
cd /path/to/iris && bun run dev

# Terminal 2: Frontend
cd /path/to/iris/webui && bun run dev
```

### Access URLs

- WebUI: http://localhost:5173
- Backend API: http://localhost:4096
- API through proxy: http://localhost:5173/api/*

### Type Checking

```bash
bun run typecheck
```

### Building for Production

```bash
bun run build
```

Output goes to `webui/dist/`.

---

## Related Documents

- [Architecture](./01-architecture.md) - Backend system architecture
- [API Reference](./03-api-reference.md) - REST and WebSocket endpoints
- [Phase 13: WebUI Foundation](../implementation-plan/13-webui-foundation.md) - Implementation details
