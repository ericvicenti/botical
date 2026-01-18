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
    │   ├── __root.tsx      # Root layout with shell
    │   ├── index.tsx       # Home/project view
    │   ├── create-project.tsx
    │   ├── settings.tsx
    │   └── files/
    │       └── $.tsx       # File viewer route
    │
    ├── commands/           # Command palette system
    │   ├── types.ts        # Command types
    │   ├── registry.ts     # Command registry
    │   ├── context.tsx     # Command context provider
    │   └── definitions/    # Command definitions
    │       ├── index.ts
    │       ├── view.commands.ts
    │       ├── tab.commands.ts
    │       └── navigation.commands.ts
    │
    ├── components/
    │   ├── ui/             # Base UI primitives
    │   │   ├── Modal.tsx
    │   │   ├── FocusTrap.tsx
    │   │   ├── Markdown.tsx      # Markdown renderer for chat
    │   │   └── ToolCall.tsx      # Unified tool call display
    │   ├── layout/         # App shell components
    │   │   ├── Sidebar.tsx
    │   │   ├── TabBar.tsx
    │   │   ├── BottomPanel.tsx   # Includes connection status
    │   │   └── ProjectSelector.tsx
    │   ├── command-palette/
    │   │   └── CommandPalette.tsx
    │   ├── tasks/          # Task/chat components
    │   │   ├── TasksPanel.tsx    # Session list sidebar
    │   │   ├── TaskChat.tsx      # Chat interface with model selector
    │   │   └── MessageBubble.tsx # Message display with part grouping
    │   └── files/          # File browser
    │       └── FileTree.tsx      # Folder tree with expansion
    │
    ├── hooks/
    │   ├── useKeyboardShortcuts.ts  # Global keyboard shortcuts
    │   └── useTaskMessages.ts       # Message fetching + streaming
    │
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts   # HTTP client wrapper
    │   │   ├── queries.ts  # TanStack Query hooks
    │   │   └── types.ts    # API response types
    │   ├── websocket/
    │   │   ├── context.tsx # WebSocket provider
    │   │   └── events.ts   # Event handlers + streaming
    │   └── utils/
    │       └── cn.ts       # Class name utility
    │
    ├── contexts/
    │   ├── ui.tsx          # UI state (sidebar, theme, panels)
    │   └── tabs.tsx        # Tab state with localStorage persistence
    │
    ├── styles/
    │   └── globals.css     # Tailwind imports + custom styles
    │
    └── types/
        ├── index.ts        # Shared TypeScript types
        └── tabs.ts         # Tab type definitions
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

### Streaming Events

For real-time streaming of agent responses, use `subscribeToStreamingEvents`:

```typescript
// In a component or hook
useEffect(() => {
  const unsubscribe = subscribeToStreamingEvents((event) => {
    if (event.payload.sessionId !== sessionId) return;

    switch (event.type) {
      case "message.created":
        // Start streaming state
        break;
      case "message.text.delta":
        // Append text to streaming message
        break;
      case "message.reasoning.delta":
        // Append reasoning/thinking text
        break;
      case "message.tool.call":
        // Show tool call in progress
        break;
      case "message.tool.result":
        // Show tool result
        break;
      case "message.complete":
        // Clear streaming state, refetch
        break;
    }
  });
  return unsubscribe;
}, [sessionId]);
```

### Message Part Grouping

Messages contain multiple parts (text, tool calls, tool results, reasoning). The UI groups these for display:

```typescript
// Group tool-call parts with their matching tool-result parts
const groupedParts = useMemo(() => {
  const result = [];
  const toolResultsById = new Map();

  // First pass: collect tool results by toolCallId
  for (const part of parts) {
    if (part.type === "tool-result" && part.toolCallId) {
      toolResultsById.set(part.toolCallId, part);
    }
  }

  // Second pass: create groups
  for (const part of parts) {
    switch (part.type) {
      case "text":
        result.push({ type: "text", textPart: part });
        break;
      case "tool-call":
        const matchingResult = toolResultsById.get(part.toolCallId);
        result.push({
          type: "tool",
          toolCallPart: part,
          toolResultPart: matchingResult,
        });
        break;
      // tool-result: skip (already paired above)
    }
  }
  return result;
}, [parts]);
```

### Markdown Rendering

Assistant messages are rendered as GitHub Flavored Markdown using `react-markdown`:

```tsx
import { Markdown } from "@/components/ui/Markdown";

// In message display
{isUser ? (
  <p className="whitespace-pre-wrap">{text}</p>
) : (
  <Markdown>{text}</Markdown>
)}
```

The Markdown component supports:
- Headings, paragraphs, lists
- Code blocks with language hints
- Tables (GFM)
- Links (open in new tab)
- Blockquotes
- Bold, italic, strikethrough

### Command Palette

The command palette system provides VS Code-style command execution:

```typescript
// Register commands in commands/definitions/
export const viewCommands: Command[] = [
  {
    id: "view.toggleSidebar",
    label: "Toggle Sidebar",
    shortcut: { key: "b", mod: true },
    execute: (ctx) => ctx.ui.toggleSidebar(),
  },
];

// Use in components
const { execute, openPalette } = useCommands();
execute("view.toggleSidebar");
```

Commands are shared between keyboard shortcuts and the command palette (Cmd+K).

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
// Subscribe to session events (for streaming)
subscribe(`session:${sessionId}`);

// Unsubscribe when component unmounts
unsubscribe(`session:${sessionId}`);

// The context handles the wire format:
// { id: "req_xxx", type: "subscribe", payload: { channel: "session:xxx" } }
```

### Receiving Events

Events from the server trigger query cache invalidations, keeping the UI in sync without polling.

Streaming events (message.text.delta, message.tool.call, etc.) are handled separately via `subscribeToStreamingEvents` for real-time UI updates without full refetches.

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
