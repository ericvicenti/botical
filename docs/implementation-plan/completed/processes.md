# Phase 11: Process Management

**Goal**: Implement commands and services with PTY support for real shell interaction

## Overview

Processes are shell commands executed within a project context. Two types:

- **Commands**: Short-lived processes that run and complete (e.g., `npm test`, `git status`)
- **Services**: Long-lived processes that run until stopped (e.g., `npm run dev`, `tsc --watch`)

Both use PTY (pseudo-terminal) for full terminal emulation, allowing interactive input and proper signal handling.

---

## Backend

### Dependencies

```json
{
  "dependencies": {
    "node-pty": "^1.0.0"
  }
}
```

**Note**: `node-pty` requires native compilation. Test compatibility with Bun.

### Database Schema

```sql
-- Migration 4: Processes

CREATE TABLE processes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'command' | 'service'
  command TEXT NOT NULL,              -- e.g., "npm run dev"
  cwd TEXT NOT NULL,                  -- Working directory
  env TEXT,                           -- JSON object of env vars
  cols INTEGER NOT NULL DEFAULT 80,
  rows INTEGER NOT NULL DEFAULT 24,
  scope TEXT NOT NULL,                -- 'task' | 'mission' | 'project'
  scope_id TEXT NOT NULL,             -- ID of task/mission/project
  status TEXT NOT NULL DEFAULT 'starting',
  exit_code INTEGER,
  label TEXT,                         -- User-friendly name
  created_by TEXT NOT NULL,           -- User or agent ID
  created_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE process_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,                 -- Output chunk (may include ANSI)
  stream TEXT NOT NULL DEFAULT 'stdout',
  FOREIGN KEY (process_id) REFERENCES processes(id)
);

CREATE INDEX idx_processes_project ON processes(project_id);
CREATE INDEX idx_processes_scope ON processes(scope, scope_id);
CREATE INDEX idx_processes_status ON processes(status);
CREATE INDEX idx_process_output_process ON process_output(process_id);
```

### PTY Manager

Create `src/services/pty-manager.ts`:

```typescript
import * as pty from 'node-pty'

interface PTYInstance {
  pty: pty.IPty
  processId: string
  onData: (data: string) => void
  onExit: (code: number) => void
}

class PTYManager {
  private instances: Map<string, PTYInstance> = new Map()

  create(processId: string, command: string, options: {
    cwd: string
    env?: Record<string, string>
    cols?: number
    rows?: number
    onData: (data: string) => void
    onExit: (code: number) => void
  }): void {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const args = process.platform === 'win32' ? [] : ['-c', command]

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    })

    ptyProcess.onData(options.onData)
    ptyProcess.onExit(({ exitCode }) => options.onExit(exitCode))

    this.instances.set(processId, {
      pty: ptyProcess,
      processId,
      onData: options.onData,
      onExit: options.onExit,
    })
  }

  write(processId: string, data: string): void {
    const instance = this.instances.get(processId)
    if (instance) {
      instance.pty.write(data)
    }
  }

  resize(processId: string, cols: number, rows: number): void {
    const instance = this.instances.get(processId)
    if (instance) {
      instance.pty.resize(cols, rows)
    }
  }

  kill(processId: string): void {
    const instance = this.instances.get(processId)
    if (instance) {
      instance.pty.kill()
      this.instances.delete(processId)
    }
  }

  exists(processId: string): boolean {
    return this.instances.has(processId)
  }
}

export const ptyManager = new PTYManager()
```

### ProcessService

Create `src/services/processes.ts`:

```typescript
interface ProcessService {
  // Lifecycle
  spawn(data: SpawnProcessInput): Promise<Process>
  kill(id: string): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>

  // Input
  write(id: string, data: string): Promise<void>

  // Query
  get(id: string): Promise<Process | null>
  list(filters: ProcessFilters): Promise<Process[]>
  listByProject(projectId: string): Promise<Process[]>
  listRunning(): Promise<Process[]>

  // Output
  getOutput(id: string, options?: {
    limit?: number
    offset?: number
    since?: number  // Timestamp
  }): Promise<ProcessOutput[]>

  // Scope cleanup
  killByScope(scope: ProcessScope, scopeId: string): Promise<void>
}

interface SpawnProcessInput {
  projectId: string
  type: 'command' | 'service'
  command: string
  cwd?: string              // Defaults to project root
  env?: Record<string, string>
  cols?: number
  rows?: number
  scope: 'task' | 'mission' | 'project'
  scopeId: string
  label?: string
  createdBy: string
}
```

**Process Lifecycle:**
```
spawn() → status: 'starting' → 'running'
          PTY created, output streaming begins

kill() → status: 'killed'
         PTY terminated

onExit(0) → status: 'completed'
            Process exited normally

onExit(n) → status: 'failed'
            Process exited with error
```

### Output Storage & Streaming

Output is both:
1. **Stored** in `process_output` table for history/replay
2. **Streamed** via WebSocket to connected clients

```typescript
// In ProcessService.spawn():
ptyManager.create(process.id, data.command, {
  cwd: projectPath,
  onData: async (output) => {
    // Store output
    await db.run(`
      INSERT INTO process_output (process_id, timestamp, data, stream)
      VALUES (?, ?, ?, 'stdout')
    `, [process.id, Date.now(), output])

    // Broadcast to WebSocket
    bus.emit('process.output', {
      id: process.id,
      data: output,
      stream: 'stdout',
    })
  },
  onExit: async (exitCode) => {
    await this.markExited(process.id, exitCode)
  },
})
```

### Scope Cleanup

When a scope ends, kill all associated processes:

```typescript
// Hook into mission completion
bus.on('mission.completed', async (mission) => {
  await processService.killByScope('mission', mission.id)
})

bus.on('mission.cancelled', async (mission) => {
  await processService.killByScope('mission', mission.id)
})

// Hook into task completion
bus.on('task.completed', async (task) => {
  await processService.killByScope('task', task.id)
})

// Hook into project archive
bus.on('project.archived', async (project) => {
  await processService.killByScope('project', project.id)
})
```

### REST Routes

Create `src/server/routes/processes.ts`:

```
POST   /api/projects/:projectId/processes    Spawn process
GET    /api/projects/:projectId/processes    List processes (filter by type, status)
GET    /api/processes/:id                    Get process details
GET    /api/processes/:id/output             Get output history
POST   /api/processes/:id/write              Write to stdin
POST   /api/processes/:id/resize             Resize PTY (cols, rows)
POST   /api/processes/:id/kill               Kill process
```

### WebSocket Support

Add to protocol:

```typescript
// Server → Client Events
| { type: 'process.spawned'; payload: Process }
| { type: 'process.output'; payload: { id: string; data: string; stream: 'stdout' | 'stderr' } }
| { type: 'process.exited'; payload: { id: string; exitCode: number; status: ProcessStatus } }
| { type: 'process.killed'; payload: { id: string } }

// Client → Server Requests
| { type: 'process.write'; payload: { id: string; data: string } }
| { type: 'process.resize'; payload: { id: string; cols: number; rows: number } }
| { type: 'process.kill'; payload: { id: string } }
```

WebSocket handlers for interactive I/O:

```typescript
// src/websocket/handlers/processes.ts
export const processHandlers = {
  'process.write': async (ws, payload) => {
    await processService.write(payload.id, payload.data)
  },

  'process.resize': async (ws, payload) => {
    await processService.resize(payload.id, payload.cols, payload.rows)
  },

  'process.kill': async (ws, payload) => {
    await processService.kill(payload.id)
  },
}
```

---

## Frontend

### API Queries

```typescript
// Processes
export function useProcesses(projectId: string, filters?: { type?: string; status?: string }) {
  return useQuery({
    queryKey: ['projects', projectId, 'processes', filters],
    queryFn: () => apiClient<Process[]>(
      `/api/projects/${projectId}/processes?${new URLSearchParams(filters)}`
    ),
  })
}

export function useProcess(processId: string) {
  return useQuery({
    queryKey: ['processes', processId],
    queryFn: () => apiClient<Process>(`/api/processes/${processId}`),
  })
}

export function useProcessOutput(processId: string, options?: { limit?: number }) {
  return useQuery({
    queryKey: ['processes', processId, 'output', options],
    queryFn: () => apiClient<ProcessOutput[]>(
      `/api/processes/${processId}/output?limit=${options?.limit || 1000}`
    ),
  })
}

export function useSpawnProcess() {
  return useMutation({
    mutationFn: (data: SpawnProcessInput) =>
      apiClient<Process>(`/api/projects/${data.projectId}/processes`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })
}
```

### WebSocket Process I/O

```typescript
// Hook for interactive process I/O
export function useProcessIO(processId: string) {
  const { send } = useWebSocket()
  const [output, setOutput] = useState<string>('')

  useEffect(() => {
    const handleOutput = (event: WSEvent) => {
      if (event.type === 'process.output' && event.payload.id === processId) {
        setOutput(prev => prev + event.payload.data)
      }
    }

    // Subscribe to process output
    // ... WebSocket subscription logic

    return () => {
      // Cleanup
    }
  }, [processId])

  const write = (data: string) => {
    send({ type: 'process.write', payload: { id: processId, data } })
  }

  const resize = (cols: number, rows: number) => {
    send({ type: 'process.resize', payload: { id: processId, cols, rows } })
  }

  const kill = () => {
    send({ type: 'process.kill', payload: { id: processId } })
  }

  return { output, write, resize, kill }
}
```

---

## Testing

### Unit Tests

```
tests/unit/services/pty-manager.test.ts    25+ tests
├── create() - spawns PTY with correct options
├── write() - sends data to PTY
├── resize() - resizes PTY
├── kill() - terminates PTY
├── onData callback - receives output
├── onExit callback - receives exit code
└── error handling - missing process

tests/unit/services/processes.test.ts      40+ tests
├── spawn() - creates process record, starts PTY
├── kill() - terminates process
├── resize() - resizes PTY
├── write() - sends input
├── get() / list() - queries
├── getOutput() - retrieves history
├── killByScope() - kills all in scope
├── status transitions
└── output storage

tests/unit/server/routes/processes.test.ts 25+ tests
├── POST /projects/:id/processes
├── GET /projects/:id/processes
├── GET /processes/:id
├── GET /processes/:id/output
├── POST /processes/:id/write
├── POST /processes/:id/resize
├── POST /processes/:id/kill
└── error handling

tests/unit/websocket/handlers/processes.test.ts 15+ tests
├── process.write handler
├── process.resize handler
├── process.kill handler
└── authorization checks
```

### Integration Tests

```
tests/integration/process-lifecycle.test.ts
├── Spawn command, run to completion
├── Spawn service, stop manually
├── Interactive input/output
├── Resize during execution
├── Output streaming via WebSocket
├── Scope cleanup on mission complete
├── Multiple concurrent processes
└── Process recovery after server restart (processes killed)
```

---

## Validation Criteria

- [ ] Commands can be spawned and run to completion
- [ ] Services can be started and stopped manually
- [ ] Output streams to connected WebSocket clients in real-time
- [ ] Output is stored and can be retrieved via API
- [ ] Interactive input works (write to stdin)
- [ ] Resize works correctly
- [ ] Scope cleanup works (mission end → services killed)
- [ ] Multiple processes can run concurrently
- [ ] All 105+ tests pass

**Deliverable**: Full process management with PTY support
