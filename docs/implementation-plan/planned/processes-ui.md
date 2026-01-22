# Phase 17: Processes UI

**Status**: COMPLETED

**Goal**: Implement terminal emulation for commands and services using xterm.js

## Overview

This phase adds:
- Terminal component with xterm.js
- Command output display
- Service management panel
- Process spawning from UI
- Agent service tool for long-running processes

---

## What Was Implemented

### Frontend Components

1. **ProcessTerminal.tsx** - xterm.js terminal with:
   - Dark theme matching app
   - FitAddon for auto-resize
   - WebLinksAddon for clickable links
   - User input → stdin
   - Status indicator overlay

2. **ProcessItem.tsx** - Single process row with:
   - Status icons (running, completed, failed, killed)
   - Type icons (command vs service)
   - Runtime display
   - Kill button for running processes

3. **ProcessList.tsx** - Grouped process list:
   - Running processes first
   - Recent completed/failed after
   - Empty state handling

4. **SpawnProcessForm.tsx** - Process creation form:
   - Command input
   - Type selector (command/service)
   - Optional label
   - Collapsible options

5. **ProcessesPanel.tsx** - Sidebar Run panel:
   - Form at top
   - List below

### Hooks

- **useProcessOutput.ts** - Real-time process output streaming:
  - WebSocket subscription to project room
  - Output accumulation from events
  - write(), resize(), kill() methods
  - Integrates with REST API for initial output

### API Additions (queries.ts)

- `useProcessOutput()` - Fetch process output chunks
- `useSpawnProcess()` - Spawn new processes
- `useKillProcess()` - Kill running processes
- `useWriteToProcess()` - Write to stdin
- `useResizeProcess()` - Resize PTY

### WebSocket Events (events.ts)

- `subscribeToProcessEvents()` - Subscribe to process events
- Handles: process.spawned, process.output, process.exited, process.killed

### UI Context (ui.tsx)

- Added `selectedProcessId` state
- `setSelectedProcess()` auto-opens bottom panel Services tab

### Backend Tool

- **service.ts** - Non-blocking service tool for agents:
  - Uses ProcessService with PTY
  - Returns processId immediately
  - Optional waitForReady parameter
  - Scoped to task session

---

## Backend

Backend process management was completed in Phase 11:
- ProcessService with PTY support
- REST API for spawn, list, kill, write, resize
- WebSocket handlers for real-time I/O
- EventBus for process events

---

## File Structure

```
webui/src/
├── components/processes/
│   ├── index.ts             # Exports
│   ├── ProcessItem.tsx      # Process list item
│   ├── ProcessList.tsx      # Grouped process list
│   ├── ProcessTerminal.tsx  # xterm.js terminal
│   ├── SpawnProcessForm.tsx # New process form
│   └── ProcessesPanel.tsx   # Sidebar panel
├── hooks/
│   └── useProcessOutput.ts  # Streaming hook
└── lib/
    ├── api/queries.ts       # Process mutations
    └── websocket/events.ts  # Process event handlers

src/tools/
└── service.ts               # Agent service tool
```

---

## Validation Criteria

- [x] Terminal renders with proper styling
- [x] Command output displays in terminal
- [x] Interactive input works (via write)
- [x] Services panel shows running services
- [x] Run panel allows spawning new processes
- [x] Stop button kills process
- [x] Process status updates in real-time
- [x] Terminal resize works
- [x] Build passes type checks

**Deliverable**: Full terminal emulation with process management

---

## Frontend

### Dependencies

```bash
bun add xterm xterm-addon-fit xterm-addon-web-links
bun add -D @types/xterm
```

### Terminal Component

```tsx
// src/components/processes/Terminal.tsx
import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useProcessOutput } from '@/lib/api/queries'
import { useWebSocket } from '@/lib/websocket/context'
import 'xterm/css/xterm.css'

interface TerminalProps {
  processId: string
  onData?: (data: string) => void
}

export function Terminal({ processId, onData }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const { data: history } = useProcessOutput(processId)
  const { send, subscribe } = useWebSocket()

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle user input
    terminal.onData((data) => {
      send({
        type: 'process.write',
        payload: { id: processId, data },
      })
      onData?.(data)
    })

    // Handle resize
    const handleResize = () => {
      fitAddon.fit()
      const { cols, rows } = terminal
      send({
        type: 'process.resize',
        payload: { id: processId, cols, rows },
      })
    }

    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    return () => {
      terminal.dispose()
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [processId, send, onData])

  // Write history on mount
  useEffect(() => {
    if (terminalRef.current && history) {
      for (const output of history) {
        terminalRef.current.write(output.data)
      }
    }
  }, [history])

  // Subscribe to live output
  useEffect(() => {
    const unsubscribe = subscribe('process.output', (event) => {
      if (event.payload.id === processId && terminalRef.current) {
        terminalRef.current.write(event.payload.data)
      }
    })

    return unsubscribe
  }, [processId, subscribe])

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-bg-primary"
      style={{ padding: 4 }}
    />
  )
}
```

### Process Tab View

```tsx
// src/components/tabs/ProcessTab.tsx
import { useProcess } from '@/lib/api/queries'
import { Terminal } from '@/components/processes/Terminal'
import { ProcessHeader } from '@/components/processes/ProcessHeader'

interface ProcessTabProps {
  processId: string
  projectId: string
}

export function ProcessTab({ processId, projectId }: ProcessTabProps) {
  const { data: process, isLoading } = useProcess(processId)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading process...
      </div>
    )
  }

  if (!process) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        Process not found
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <ProcessHeader process={process} />
      <div className="flex-1">
        <Terminal processId={processId} />
      </div>
    </div>
  )
}
```

### Process Header

```tsx
// src/components/processes/ProcessHeader.tsx
import { useKillProcess } from '@/lib/api/queries'
import { cn } from '@/lib/utils/cn'
import { Square, Circle, XCircle, Terminal as TerminalIcon } from 'lucide-react'

interface ProcessHeaderProps {
  process: Process
}

export function ProcessHeader({ process }: ProcessHeaderProps) {
  const killProcess = useKillProcess()

  const statusConfig: Record<string, { color: string; icon: typeof Circle }> = {
    starting: { color: 'text-accent-warning', icon: Circle },
    running: { color: 'text-accent-success', icon: Circle },
    completed: { color: 'text-text-muted', icon: Circle },
    failed: { color: 'text-accent-error', icon: XCircle },
    killed: { color: 'text-text-muted', icon: Square },
  }

  const config = statusConfig[process.status] || statusConfig.running
  const Icon = config.icon

  const isRunning = process.status === 'running' || process.status === 'starting'

  return (
    <div className="h-10 px-4 flex items-center justify-between border-b border-border bg-bg-secondary">
      <div className="flex items-center gap-2">
        <TerminalIcon className="w-4 h-4 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">
          {process.label || process.command}
        </span>
        <div className="flex items-center gap-1">
          <Icon className={cn('w-3 h-3', config.color)} />
          <span className={cn('text-xs', config.color)}>
            {process.status}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {process.exitCode !== undefined && (
          <span className="text-xs text-text-muted">
            Exit: {process.exitCode}
          </span>
        )}
        {isRunning && (
          <button
            onClick={() => killProcess.mutate(process.id)}
            disabled={killProcess.isPending}
            className={cn(
              'px-2 py-1 rounded text-xs flex items-center gap-1',
              'hover:bg-accent-error/20 text-accent-error'
            )}
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
```

### Run Panel (Sidebar)

```tsx
// src/components/panels/RunPanel.tsx
import { useState } from 'react'
import { useProcesses, useSpawnProcess } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import { Play, Square, Terminal, Server, Plus, RefreshCw } from 'lucide-react'

interface RunPanelProps {
  projectId: string
}

export function RunPanel({ projectId }: RunPanelProps) {
  const { data: processes, refetch } = useProcesses(projectId)
  const [showNew, setShowNew] = useState(false)

  const commands = processes?.filter(p => p.type === 'command') || []
  const services = processes?.filter(p => p.type === 'service') || []
  const running = processes?.filter(p =>
    p.status === 'running' || p.status === 'starting'
  ) || []

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 flex items-center justify-between border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Processes ({running.length} running)
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
            title="New Process"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* New process form */}
      {showNew && (
        <NewProcessForm
          projectId={projectId}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Services section */}
      <div className="flex-1 overflow-auto">
        <div className="py-1">
          <div className="px-2 py-1 text-xs text-text-muted flex items-center gap-1">
            <Server className="w-3 h-3" />
            Services
          </div>
          {services.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-muted">
              No services
            </div>
          ) : (
            services.map((process) => (
              <ProcessItem key={process.id} process={process} />
            ))
          )}
        </div>

        {/* Commands section */}
        <div className="py-1 border-t border-border">
          <div className="px-2 py-1 text-xs text-text-muted flex items-center gap-1">
            <Terminal className="w-3 h-3" />
            Commands
          </div>
          {commands.length === 0 ? (
            <div className="px-2 py-1 text-xs text-text-muted">
              No recent commands
            </div>
          ) : (
            commands.slice(0, 10).map((process) => (
              <ProcessItem key={process.id} process={process} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ProcessItem({ process }: { process: Process }) {
  const { openTab } = useTabs()
  const killProcess = useKillProcess()

  const isRunning = process.status === 'running' || process.status === 'starting'

  const statusColors: Record<string, string> = {
    starting: 'text-accent-warning',
    running: 'text-accent-success',
    completed: 'text-text-muted',
    failed: 'text-accent-error',
    killed: 'text-text-muted',
  }

  return (
    <div
      onClick={() => openTab({
        type: 'process',
        processId: process.id,
        projectId: process.projectId,
      })}
      className={cn(
        'px-2 py-1 flex items-center gap-2 cursor-pointer',
        'hover:bg-bg-elevated rounded mx-1'
      )}
    >
      <div className={cn(
        'w-2 h-2 rounded-full',
        isRunning ? 'bg-accent-success animate-pulse' : 'bg-text-muted'
      )} />
      <span className="flex-1 truncate text-sm text-text-primary">
        {process.label || process.command}
      </span>
      {isRunning && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            killProcess.mutate(process.id)
          }}
          className="p-1 hover:bg-bg-primary rounded text-text-muted hover:text-accent-error"
        >
          <Square className="w-3 h-3" />
        </button>
      )}
      {!isRunning && (
        <span className={cn('text-xs', statusColors[process.status])}>
          {process.exitCode !== undefined ? `(${process.exitCode})` : ''}
        </span>
      )}
    </div>
  )
}

function NewProcessForm({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const [command, setCommand] = useState('')
  const [type, setType] = useState<'command' | 'service'>('command')
  const [label, setLabel] = useState('')
  const spawnProcess = useSpawnProcess()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    try {
      await spawnProcess.mutateAsync({
        projectId,
        command,
        type,
        label: label || undefined,
        scope: 'project',
        scopeId: projectId,
      })
      onClose()
    } catch (err) {
      console.error('Failed to spawn process:', err)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 border-b border-border space-y-2">
      <input
        type="text"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="Command (e.g., npm run dev)"
        className={cn(
          'w-full px-2 py-1 rounded text-sm',
          'bg-bg-elevated border border-border',
          'text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent-primary'
        )}
        autoFocus
      />

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className={cn(
          'w-full px-2 py-1 rounded text-sm',
          'bg-bg-elevated border border-border',
          'text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent-primary'
        )}
      />

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <input
            type="radio"
            checked={type === 'command'}
            onChange={() => setType('command')}
          />
          Command
        </label>
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <input
            type="radio"
            checked={type === 'service'}
            onChange={() => setType('service')}
          />
          Service
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!command.trim() || spawnProcess.isPending}
          className={cn(
            'flex-1 px-2 py-1 rounded text-sm',
            'bg-accent-primary text-bg-primary',
            'disabled:opacity-50'
          )}
        >
          <Play className="w-3 h-3 inline mr-1" />
          Run
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'px-2 py-1 rounded text-sm',
            'bg-bg-elevated hover:bg-bg-primary'
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

### Bottom Panel Services Tab

```tsx
// src/components/panels/ServicesPanel.tsx
import { useProcesses, useKillProcess } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import { Square, ExternalLink } from 'lucide-react'

interface ServicesPanelProps {
  projectId: string | null
}

export function ServicesPanel({ projectId }: ServicesPanelProps) {
  const { data: processes } = useProcesses(projectId || '')

  const services = processes?.filter(p =>
    p.type === 'service' &&
    (p.status === 'running' || p.status === 'starting')
  ) || []

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Select a project to view services
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <div className="p-4 text-sm text-text-muted">
        No services running
      </div>
    )
  }

  return (
    <div className="p-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="pb-1 font-medium">Name</th>
            <th className="pb-1 font-medium">Command</th>
            <th className="pb-1 font-medium">Status</th>
            <th className="pb-1 font-medium">Uptime</th>
            <th className="pb-1 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ServiceRow({ service }: { service: Process }) {
  const { openTab } = useTabs()
  const killProcess = useKillProcess()

  const uptime = service.startedAt
    ? formatUptime(Date.now() - service.startedAt)
    : '-'

  return (
    <tr className="border-t border-border hover:bg-bg-elevated">
      <td className="py-1 text-text-primary">
        {service.label || 'Unnamed'}
      </td>
      <td className="py-1 text-text-secondary font-mono text-xs">
        {service.command}
      </td>
      <td className="py-1">
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded',
          service.status === 'running'
            ? 'bg-accent-success/20 text-accent-success'
            : 'bg-accent-warning/20 text-accent-warning'
        )}>
          {service.status}
        </span>
      </td>
      <td className="py-1 text-text-muted">
        {uptime}
      </td>
      <td className="py-1 text-right">
        <button
          onClick={() => openTab({
            type: 'process',
            processId: service.id,
            projectId: service.projectId,
          })}
          className="p-1 hover:bg-bg-primary rounded text-text-muted hover:text-text-primary"
          title="Open Terminal"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
        <button
          onClick={() => killProcess.mutate(service.id)}
          className="p-1 hover:bg-bg-primary rounded text-text-muted hover:text-accent-error"
          title="Stop"
        >
          <Square className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}
```

### API Queries for Processes

```typescript
// src/lib/api/queries.ts (additions)
export function useProcesses(projectId: string, filters?: { type?: string; status?: string }) {
  return useQuery({
    queryKey: ['projects', projectId, 'processes', filters],
    queryFn: () => apiClient<Process[]>(
      `/api/projects/${projectId}/processes?${new URLSearchParams(filters as any)}`
    ),
    enabled: !!projectId,
    refetchInterval: 5000,  // Poll for status updates
  })
}

export function useProcess(processId: string) {
  return useQuery({
    queryKey: ['processes', processId],
    queryFn: () => apiClient<Process>(`/api/processes/${processId}`),
    enabled: !!processId,
  })
}

export function useProcessOutput(processId: string, options?: { limit?: number }) {
  return useQuery({
    queryKey: ['processes', processId, 'output', options],
    queryFn: () => apiClient<ProcessOutput[]>(
      `/api/processes/${processId}/output?limit=${options?.limit || 1000}`
    ),
    enabled: !!processId,
  })
}

export function useSpawnProcess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      projectId: string
      command: string
      type: 'command' | 'service'
      label?: string
      scope: string
      scopeId: string
    }) => apiClient<Process>(`/api/projects/${data.projectId}/processes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: (process) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', process.projectId, 'processes'],
      })
    },
  })
}

export function useKillProcess() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (processId: string) =>
      apiClient(`/api/processes/${processId}/kill`, { method: 'POST' }),
    onSuccess: (_, processId) => {
      queryClient.invalidateQueries({
        queryKey: ['processes', processId],
      })
    },
  })
}
```

### WebSocket Updates for Processes

```typescript
// src/lib/websocket/context.tsx (additions)
// Add subscribe method to allow components to listen for specific events
interface WebSocketContextValue {
  status: WSStatus
  send: (message: object) => void
  subscribe: (type: string, handler: (event: WSEvent) => void) => () => void
}

// In WebSocketProvider:
const subscribers = useRef<Map<string, Set<(event: WSEvent) => void>>>(new Map())

const subscribe = useCallback((type: string, handler: (event: WSEvent) => void) => {
  if (!subscribers.current.has(type)) {
    subscribers.current.set(type, new Set())
  }
  subscribers.current.get(type)!.add(handler)

  return () => {
    subscribers.current.get(type)?.delete(handler)
  }
}, [])

// In onmessage handler:
socket.onmessage = (event) => {
  const data = JSON.parse(event.data)
  handleWebSocketEvent(data, queryClient)

  // Notify subscribers
  const handlers = subscribers.current.get(data.type)
  handlers?.forEach(handler => handler(data))
}
```

---

## Testing

### Unit Tests

```
tests/components/processes/Terminal.test.tsx         20+ tests
├── renders terminal container
├── displays output history
├── live output via WebSocket
├── user input sent to server
├── resize events sent
├── handles reconnection
├── theme applied correctly
└── links are clickable

tests/components/processes/ProcessHeader.test.tsx    10+ tests
├── shows process info
├── status colors correct
├── stop button works
├── exit code displayed
└── label or command shown

tests/components/panels/RunPanel.test.tsx            15+ tests
├── renders services and commands
├── process items clickable
├── stop button works
├── new process form works
├── empty states handled
└── running indicator shown

tests/components/panels/ServicesPanel.test.tsx       10+ tests
├── renders service table
├── uptime calculated
├── open terminal button works
├── stop button works
└── empty state shown
```

### Integration Tests

```
tests/integration/terminal.test.ts
├── Spawn command → output displayed
├── Interactive input works
├── Service starts and runs
├── Stop service works
├── Reconnection recovers state
├── Multiple terminals work
└── Large output handled
```

---

## Validation Criteria

- [ ] Terminal renders with proper styling
- [ ] Command output displays in terminal
- [ ] Interactive input works
- [ ] Services panel shows running services
- [ ] Run panel allows spawning new processes
- [ ] Stop button kills process
- [ ] Process status updates in real-time
- [ ] Terminal resize works
- [ ] All 55+ tests pass

**Deliverable**: Full terminal emulation with process management
