# Phase 13: WebUI Foundation

**Goal**: Set up the React application with routing, state management, and WebSocket connection

## Overview

This phase establishes the frontend foundation:
- React 19 with Vite
- TanStack Router for type-safe routing
- TanStack Query for server state
- WebSocket connection with cache integration
- Tailwind CSS for styling

---

## Project Setup

### Initialize Project

```bash
cd webui
bun create vite . --template react-ts
```

### Install Dependencies

```bash
# Core
bun add react@19 react-dom@19

# Routing & State
bun add @tanstack/react-query @tanstack/react-router

# Styling
bun add tailwindcss postcss autoprefixer
bun add clsx tailwind-merge

# UI Primitives (for later phases)
bun add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
bun add @radix-ui/react-tooltip @radix-ui/react-tabs

# Dev
bun add -D @types/react@19 @types/react-dom@19
bun add -D @tanstack/router-vite-plugin
bun add -D vitest @testing-library/react @testing-library/dom
```

### Directory Structure

```
webui/src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component with providers
├── routeTree.gen.ts           # Generated route tree
│
├── routes/                     # File-based routes
│   ├── __root.tsx             # Root layout
│   ├── index.tsx              # Home/dashboard
│   ├── projects/
│   │   └── $projectId.tsx     # Project view
│   ├── missions/
│   │   └── $missionId.tsx     # Mission view
│   └── files/
│       └── $.tsx              # File editor (catch-all)
│
├── components/
│   ├── ui/                    # Base UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── ...                    # Feature components (later phases)
│
├── lib/
│   ├── api/
│   │   ├── client.ts          # HTTP client
│   │   ├── queries.ts         # TanStack Query hooks
│   │   └── types.ts           # API types
│   ├── websocket/
│   │   ├── context.tsx        # WebSocket provider
│   │   ├── hooks.ts           # useWebSocket, etc.
│   │   └── events.ts          # Event handlers
│   └── utils/
│       ├── cn.ts              # Class name utility
│       └── ...
│
├── contexts/
│   └── ui.tsx                 # UI state (theme, sidebar)
│
├── styles/
│   └── globals.css            # Tailwind + custom styles
│
└── types/
    └── index.ts               # Shared types
```

---

## Configuration

### Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4096',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4096',
        ws: true,
      },
    },
  },
})
```

### Tailwind Config

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme (Catppuccin Mocha inspired)
        bg: {
          primary: '#1e1e2e',
          secondary: '#181825',
          elevated: '#313244',
        },
        text: {
          primary: '#cdd6f4',
          secondary: '#a6adc8',
          muted: '#6c7086',
        },
        accent: {
          primary: '#89b4fa',
          success: '#a6e3a1',
          warning: '#f9e2af',
          error: '#f38ba8',
        },
        border: '#45475a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

### TypeScript Config

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## Core Implementation

### Entry Point

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### App with Providers

```tsx
// src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { WebSocketProvider } from './lib/websocket/context'
import { UIProvider } from './contexts/ui'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,      // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <UIProvider>
          <RouterProvider router={router} />
        </UIProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  )
}
```

### API Client

```typescript
// src/lib/api/client.ts
const API_BASE = import.meta.env.VITE_API_URL || ''

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: { error: { code: string; message: string } }
  ) {
    super(data.error.message)
    this.name = 'ApiError'
  }
}

export async function apiClient<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(response.status, data)
  }

  return data.data ?? data
}
```

### API Types

```typescript
// src/lib/api/types.ts
export interface Project {
  id: string
  name: string
  path: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface Mission {
  id: string
  projectId: string
  title: string
  status: 'planning' | 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  planPath: string
  planApprovedAt?: number
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface Task {
  id: string
  projectId: string
  missionId?: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  createdAt: number
  completedAt?: number
}

export interface Process {
  id: string
  projectId: string
  type: 'command' | 'service'
  command: string
  status: 'starting' | 'running' | 'completed' | 'failed' | 'killed'
  exitCode?: number
  createdAt: number
}

// ... more types
```

### TanStack Query Hooks

```typescript
// src/lib/api/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Project, Mission, Task } from './types'

// Projects
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient<Project[]>('/api/projects'),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiClient<Project>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  })
}

// Missions
export function useMissions(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'missions'],
    queryFn: () => apiClient<Mission[]>(`/api/projects/${projectId}/missions`),
    enabled: !!projectId,
  })
}

export function useMission(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId],
    queryFn: () => apiClient<Mission>(`/api/missions/${missionId}`),
    enabled: !!missionId,
  })
}

export function useCreateMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { projectId: string; title: string }) =>
      apiClient<Mission>(`/api/projects/${data.projectId}/missions`, {
        method: 'POST',
        body: JSON.stringify({ title: data.title }),
      }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', mission.projectId, 'missions'],
      })
    },
  })
}

// Tasks
export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'tasks'],
    queryFn: () => apiClient<Task[]>(`/api/projects/${projectId}/tasks`),
    enabled: !!projectId,
  })
}

export function useMissionTasks(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId, 'tasks'],
    queryFn: () => apiClient<Task[]>(`/api/missions/${missionId}/tasks`),
    enabled: !!missionId,
  })
}
```

### WebSocket Context

```tsx
// src/lib/websocket/context.tsx
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { handleWebSocketEvent } from './events'

type WSStatus = 'connecting' | 'connected' | 'disconnected'

interface WebSocketContextValue {
  status: WSStatus
  send: (message: object) => void
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WSStatus>('disconnected')
  const [ws, setWs] = useState<WebSocket | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      setStatus('connected')
      setWs(socket)
    }

    socket.onclose = () => {
      setStatus('disconnected')
      setWs(null)
      // Reconnect after delay
      setTimeout(() => {
        // Reconnection logic
      }, 1000)
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWebSocketEvent(data, queryClient)
    }

    setStatus('connecting')

    return () => {
      socket.close()
    }
  }, [queryClient])

  const send = useCallback((message: object) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }, [ws])

  return (
    <WebSocketContext.Provider value={{ status, send }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}
```

### WebSocket Event Handlers

```typescript
// src/lib/websocket/events.ts
import { QueryClient } from '@tanstack/react-query'

interface WSEvent {
  type: string
  payload: any
}

export function handleWebSocketEvent(event: WSEvent, queryClient: QueryClient) {
  switch (event.type) {
    // Mission events
    case 'mission.created':
    case 'mission.updated':
    case 'mission.started':
    case 'mission.paused':
    case 'mission.completed':
    case 'mission.failed':
      queryClient.invalidateQueries({
        queryKey: ['projects', event.payload.projectId, 'missions'],
      })
      queryClient.setQueryData(['missions', event.payload.id], event.payload)
      break

    // Task events
    case 'task.created':
    case 'task.updated':
    case 'task.completed':
      if (event.payload.missionId) {
        queryClient.invalidateQueries({
          queryKey: ['missions', event.payload.missionId, 'tasks'],
        })
      }
      queryClient.invalidateQueries({
        queryKey: ['projects', event.payload.projectId, 'tasks'],
      })
      break

    // Process events
    case 'process.spawned':
    case 'process.exited':
    case 'process.killed':
      queryClient.invalidateQueries({
        queryKey: ['projects', event.payload.projectId, 'processes'],
      })
      break

    // Git events
    case 'git.status.changed':
      queryClient.invalidateQueries({
        queryKey: ['projects', event.payload.projectId, 'git', 'status'],
      })
      break
  }
}
```

### UI Context

```tsx
// src/contexts/ui.tsx
import { createContext, useContext, useState, ReactNode } from 'react'

interface UIState {
  sidebarCollapsed: boolean
  sidebarPanel: 'nav' | 'files' | 'git' | 'run'
  bottomPanelVisible: boolean
  bottomPanelTab: 'output' | 'problems' | 'services'
  theme: 'dark' | 'light'
}

interface UIContextValue extends UIState {
  toggleSidebar: () => void
  setSidebarPanel: (panel: UIState['sidebarPanel']) => void
  toggleBottomPanel: () => void
  setBottomPanelTab: (tab: UIState['bottomPanelTab']) => void
  setTheme: (theme: UIState['theme']) => void
}

const UIContext = createContext<UIContextValue | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>({
    sidebarCollapsed: false,
    sidebarPanel: 'nav',
    bottomPanelVisible: true,
    bottomPanelTab: 'output',
    theme: 'dark',
  })

  const value: UIContextValue = {
    ...state,
    toggleSidebar: () => setState(s => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarPanel: (panel) => setState(s => ({ ...s, sidebarPanel: panel })),
    toggleBottomPanel: () => setState(s => ({ ...s, bottomPanelVisible: !s.bottomPanelVisible })),
    setBottomPanelTab: (tab) => setState(s => ({ ...s, bottomPanelTab: tab })),
    setTheme: (theme) => setState(s => ({ ...s, theme })),
  }

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within UIProvider')
  }
  return context
}
```

### Root Layout

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useUI } from '@/contexts/ui'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { theme } = useUI()

  return (
    <div className={`h-screen flex flex-col ${theme}`}>
      {/* Tab bar - Phase 14 */}
      <div className="h-9 bg-bg-secondary border-b border-border">
        Tab Bar Placeholder
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Phase 14 */}
        <div className="w-60 bg-bg-secondary border-r border-border">
          Sidebar Placeholder
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-bg-primary">
          <Outlet />
        </main>
      </div>

      {/* Bottom panel - Phase 14 */}
      <div className="h-48 bg-bg-secondary border-t border-border">
        Bottom Panel Placeholder
      </div>
    </div>
  )
}
```

### Home Route

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useProjects } from '@/lib/api/queries'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: projects, isLoading } = useProjects()

  if (isLoading) {
    return <div className="p-4 text-text-secondary">Loading projects...</div>
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-text-primary mb-4">Projects</h1>
      <div className="space-y-2">
        {projects?.map((project) => (
          <div
            key={project.id}
            className="p-3 bg-bg-elevated rounded border border-border"
          >
            <div className="font-medium text-text-primary">{project.name}</div>
            <div className="text-sm text-text-secondary">{project.path}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Testing

### Test Setup

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  readyState = WebSocket.OPEN
  send = vi.fn()
  close = vi.fn()
}
global.WebSocket = MockWebSocket as any
```

### Component Tests

```typescript
// src/lib/api/__tests__/queries.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useProjects } from '../queries'

const wrapper = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useProjects', () => {
  it('fetches projects', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
  })
})
```

---

## Validation Criteria

- [ ] App builds and runs without errors (`bun run dev`)
- [ ] Routing works (navigate between routes)
- [ ] API client fetches data from backend
- [ ] TanStack Query caches responses correctly
- [ ] WebSocket connects and receives events
- [ ] Query cache updates on WebSocket events
- [ ] UI context manages state correctly
- [ ] Dark theme applied by default
- [ ] All tests pass

**Deliverable**: Working React application foundation with data fetching and real-time updates
