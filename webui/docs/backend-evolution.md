# Botical Backend Evolution Plan

This document outlines the backend changes needed to support the mission-oriented IDE vision. See [decisions.md](./decisions.md) for architectural decisions.

---

## Executive Summary

The Botical backend evolves from a session-based chat system to a **mission-oriented autonomous agent platform** with full IDE capabilities:

1. **Missions** - Planned, autonomous work with documented goals
2. **Tasks** - Immediate work units (formalize existing todos)
3. **Commands & Services** - Process execution with lifecycle management
4. **Git Integration** - First-class git operations via API
5. **Enhanced Files** - Directory operations, search, bulk actions

---

## New Concepts

### Mission

A mission is a **planned, autonomous work session** within a project. Unlike tasks, missions require upfront planning documented in a markdown file.

```typescript
interface Mission {
  id: string                    // e.g., "mis_abc123"
  projectId: string
  title: string                 // "Implement user authentication"
  status: MissionStatus

  // Planning (the key differentiator from tasks)
  planPath: string              // Path to planning document, e.g., ".botical/missions/auth.md"
  planApprovedAt?: string       // NULL until user approves plan
  planApprovedBy?: string       // User who approved

  // Execution
  sessionId?: string            // Created when mission starts (after plan approval)

  // Lifecycle
  createdAt: string
  startedAt?: string            // When execution began (after approval)
  pausedAt?: string
  completedAt?: string

  // Results
  summary?: string              // AI-generated summary on completion
  completionCriteriaMet: boolean
}

type MissionStatus =
  | 'planning'    // Agent drafting plan, not yet approved
  | 'pending'     // Plan approved, ready to start
  | 'running'     // Actively executing
  | 'paused'      // User paused, can resume
  | 'completed'   // Success - criteria met
  | 'failed'      // Ended with errors
  | 'cancelled'   // User cancelled
```

**Mission Planning Document** (`.botical/missions/{slug}.md`):
```markdown
# Mission: Implement User Authentication

## Goal
Add JWT-based authentication to the API with login/logout endpoints.

## Completion Criteria
- [ ] POST /auth/login returns JWT token
- [ ] POST /auth/logout invalidates token
- [ ] Protected routes reject invalid tokens
- [ ] All tests pass
- [ ] No TypeScript errors

## Approach
1. Create auth middleware
2. Implement login endpoint
3. Implement logout endpoint
4. Add tests

## Constraints
- Use existing User model
- JWT secret from environment variable
- Token expires in 7 days

---
*Plan drafted by Botical. Approved by @user on 2025-01-15.*
```

### Task (Formalized from Todos)

Tasks are **immediate work units** - no planning phase, execution starts right away.

```typescript
interface Task {
  id: string                    // e.g., "tsk_abc123"
  projectId: string
  missionId?: string            // Optional - can be standalone

  title: string                 // "Create login form component"
  description?: string
  status: TaskStatus

  // Ownership
  createdBy: 'agent' | 'user'
  assignedTo: 'agent' | 'user'

  // Hierarchy
  parentTaskId?: string         // For sub-tasks

  // Timing
  createdAt: string
  startedAt?: string
  completedAt?: string

  // Results
  result?: string               // Outcome description
}

type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled'
```

### Commands & Services

Process execution with lifecycle management. Both use PTY under the hood, but differ in intent and lifecycle.

```typescript
interface Process {
  id: string                    // e.g., "proc_abc123"
  projectId: string
  type: 'command' | 'service'

  // Execution
  command: string               // e.g., "npm run dev"
  cwd: string                   // Working directory
  env?: Record<string, string>  // Environment overrides

  // PTY settings
  cols: number
  rows: number

  // Lifecycle scope
  scope: ProcessScope
  scopeId: string               // ID of task/mission/project

  // State
  status: ProcessStatus
  exitCode?: number

  // Timing
  createdAt: string
  startedAt: string
  endedAt?: string

  // Metadata
  label?: string                // User-friendly name, e.g., "Dev Server"
  createdBy: string             // User or agent ID
}

type ProcessScope = 'task' | 'mission' | 'project'

type ProcessStatus =
  | 'starting'
  | 'running'
  | 'completed'    // Exited normally (exit code 0)
  | 'failed'       // Exited with error (exit code != 0)
  | 'killed'       // Terminated by user/system
```

**Lifecycle Rules:**
- **Commands** (type: 'command'): Expected to complete. Scope is typically 'task'.
- **Services** (type: 'service'): Expected to run until stopped. Auto-terminate when scope ends.

```
Project archived → All project services killed
Mission completed → All mission services killed
Task completed → All task commands should have completed
```

---

## Database Schema

### New Tables

```sql
-- Missions table
CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,                    -- Created after plan approval
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  plan_path TEXT NOT NULL,            -- Path to .md file
  plan_approved_at INTEGER,
  plan_approved_by TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  paused_at INTEGER,
  completed_at INTEGER,
  summary TEXT,
  completion_criteria_met INTEGER DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Processes table (commands & services)
CREATE TABLE processes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'command' or 'service'
  command TEXT NOT NULL,
  cwd TEXT NOT NULL,
  env TEXT,                           -- JSON object
  cols INTEGER NOT NULL DEFAULT 80,
  rows INTEGER NOT NULL DEFAULT 24,
  scope TEXT NOT NULL,                -- 'task', 'mission', 'project'
  scope_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  exit_code INTEGER,
  label TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Process output (stored for history/replay)
CREATE TABLE process_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,                 -- Output chunk
  stream TEXT NOT NULL DEFAULT 'stdout', -- 'stdout' or 'stderr'
  FOREIGN KEY (process_id) REFERENCES processes(id)
);
```

### Evolve Todos → Tasks

```sql
-- Rename and extend
ALTER TABLE todos RENAME TO tasks;
ALTER TABLE tasks ADD COLUMN mission_id TEXT REFERENCES missions(id);
ALTER TABLE tasks ADD COLUMN created_by TEXT DEFAULT 'agent';
ALTER TABLE tasks ADD COLUMN assigned_to TEXT DEFAULT 'agent';
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN result TEXT;
ALTER TABLE tasks ADD COLUMN started_at INTEGER;
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;

-- Rename content → title for consistency
ALTER TABLE tasks RENAME COLUMN content TO title;

-- Drop active_form (UI concern, not needed in DB)
-- Keep for backwards compat, mark deprecated
```

### Indexes

```sql
CREATE INDEX idx_missions_project ON missions(project_id);
CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_tasks_mission ON tasks(mission_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_processes_project ON processes(project_id);
CREATE INDEX idx_processes_scope ON processes(scope, scope_id);
CREATE INDEX idx_processes_status ON processes(status);
CREATE INDEX idx_process_output_process ON process_output(process_id);
```

---

## Service Layer

### MissionService

```typescript
// src/services/missions.ts

interface MissionService {
  // CRUD
  create(projectId: string, title: string): Promise<Mission>
  get(id: string): Promise<Mission | null>
  list(projectId: string, filters?: MissionFilters): Promise<Mission[]>

  // Planning phase
  updatePlan(id: string, planContent: string): Promise<void>
  approvePlan(id: string, userId: string): Promise<void>

  // Execution
  start(id: string): Promise<void>
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  complete(id: string, summary: string, criteriaMet: boolean): Promise<void>
  cancel(id: string): Promise<void>

  // Queries
  getWithTasks(id: string): Promise<MissionWithTasks>
  getActiveMission(projectId: string): Promise<Mission | null>
}
```

### TaskService (Evolved from TodoService)

```typescript
// src/services/tasks.ts

interface TaskService {
  // CRUD
  create(data: CreateTaskInput): Promise<Task>
  get(id: string): Promise<Task | null>
  update(id: string, data: UpdateTaskInput): Promise<Task>
  delete(id: string): Promise<void>

  // List with filters
  list(filters: TaskFilters): Promise<Task[]>
  listByMission(missionId: string): Promise<Task[]>
  listByProject(projectId: string): Promise<Task[]>

  // Status transitions
  start(id: string): Promise<Task>
  complete(id: string, result?: string): Promise<Task>
  block(id: string, reason?: string): Promise<Task>
  cancel(id: string): Promise<Task>

  // Batch operations (backwards compat with TodoService)
  replaceBatch(sessionId: string, tasks: TaskInput[]): Promise<Task[]>
}
```

### ProcessService

```typescript
// src/services/processes.ts

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
  getOutput(id: string, options?: OutputOptions): Promise<ProcessOutput[]>

  // Scope cleanup
  killByScope(scope: ProcessScope, scopeId: string): Promise<void>
}

// Internal: PTY management
interface PTYManager {
  create(id: string, command: string, options: PTYOptions): IPty
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(id: string, callback: (data: string) => void): void
  onExit(id: string, callback: (code: number) => void): void
}
```

### GitService

```typescript
// src/services/git.ts

interface GitService {
  // Status
  status(projectId: string): Promise<GitStatus>

  // Branches
  listBranches(projectId: string): Promise<Branch[]>
  createBranch(projectId: string, name: string, from?: string): Promise<Branch>
  switchBranch(projectId: string, name: string): Promise<void>
  deleteBranch(projectId: string, name: string): Promise<void>

  // Staging
  stage(projectId: string, paths: string[]): Promise<void>
  unstage(projectId: string, paths: string[]): Promise<void>

  // Commits
  commit(projectId: string, message: string, author?: GitAuthor): Promise<Commit>
  log(projectId: string, options?: LogOptions): Promise<Commit[]>

  // Diff
  diff(projectId: string, options?: DiffOptions): Promise<DiffResult>

  // Remotes
  fetch(projectId: string, remote?: string): Promise<void>
  pull(projectId: string): Promise<PullResult>
  push(projectId: string): Promise<void>

  // Identity
  getIdentity(): Promise<GitIdentity>  // Botical's SSH public key
}

// Botical commits with recognizable author
const BOTICAL_AUTHOR: GitAuthor = {
  name: 'Botical',
  email: 'botical@example.com'  // Or configurable
}
```

---

## API Endpoints

### REST Routes

```
# Missions
POST   /api/projects/:projectId/missions          Create mission (starts planning)
GET    /api/projects/:projectId/missions          List missions
GET    /api/missions/:id                          Get mission with plan
PUT    /api/missions/:id/plan                     Update plan content
POST   /api/missions/:id/approve                  Approve plan
POST   /api/missions/:id/start                    Start execution
POST   /api/missions/:id/pause                    Pause execution
POST   /api/missions/:id/resume                   Resume execution
POST   /api/missions/:id/complete                 Mark complete
POST   /api/missions/:id/cancel                   Cancel mission
DELETE /api/missions/:id                          Delete mission

# Tasks
POST   /api/projects/:projectId/tasks             Create standalone task
POST   /api/missions/:missionId/tasks             Create task in mission
GET    /api/projects/:projectId/tasks             List project tasks
GET    /api/missions/:missionId/tasks             List mission tasks
GET    /api/tasks/:id                             Get task
PUT    /api/tasks/:id                             Update task
POST   /api/tasks/:id/start                       Start task
POST   /api/tasks/:id/complete                    Complete task
DELETE /api/tasks/:id                             Delete task

# Processes (Commands & Services)
POST   /api/projects/:projectId/processes         Spawn process
GET    /api/projects/:projectId/processes         List processes
GET    /api/processes/:id                         Get process
GET    /api/processes/:id/output                  Get output history
POST   /api/processes/:id/write                   Write to stdin
POST   /api/processes/:id/resize                  Resize PTY
POST   /api/processes/:id/kill                    Kill process

# Git
GET    /api/projects/:projectId/git/status        Get status
GET    /api/projects/:projectId/git/branches      List branches
POST   /api/projects/:projectId/git/branches      Create branch
POST   /api/projects/:projectId/git/checkout      Switch branch
POST   /api/projects/:projectId/git/stage         Stage files
POST   /api/projects/:projectId/git/commit        Commit
GET    /api/projects/:projectId/git/log           Commit history
GET    /api/projects/:projectId/git/diff          Get diff
POST   /api/projects/:projectId/git/push          Push
POST   /api/projects/:projectId/git/pull          Pull
GET    /api/git/identity                          Get Botical SSH public key
```

### WebSocket Events

```typescript
// Server → Client Events
type ServerEvent =
  // Missions
  | { type: 'mission.created'; payload: Mission }
  | { type: 'mission.updated'; payload: Mission }
  | { type: 'mission.plan.updated'; payload: { id: string; planContent: string } }
  | { type: 'mission.started'; payload: Mission }
  | { type: 'mission.paused'; payload: Mission }
  | { type: 'mission.completed'; payload: Mission }
  | { type: 'mission.failed'; payload: Mission }

  // Tasks
  | { type: 'task.created'; payload: Task }
  | { type: 'task.updated'; payload: Task }
  | { type: 'task.started'; payload: Task }
  | { type: 'task.completed'; payload: Task }

  // Processes
  | { type: 'process.spawned'; payload: Process }
  | { type: 'process.output'; payload: { id: string; data: string; stream: 'stdout' | 'stderr' } }
  | { type: 'process.exited'; payload: { id: string; exitCode: number } }
  | { type: 'process.killed'; payload: { id: string } }

  // Git
  | { type: 'git.status.changed'; payload: GitStatus }
  | { type: 'git.branch.switched'; payload: { branch: string } }
  | { type: 'git.commit.created'; payload: Commit }

// Client → Server Requests (via WebSocket)
type ClientRequest =
  | { type: 'process.write'; payload: { id: string; data: string } }
  | { type: 'process.resize'; payload: { id: string; cols: number; rows: number } }
  | { type: 'process.kill'; payload: { id: string } }
```

---

## Dependencies

```json
{
  "dependencies": {
    "simple-git": "^3.x",       // Git operations
    "node-pty": "^1.x"          // PTY for commands/services
  }
}
```

**Note:** `node-pty` requires native compilation. Test with Bun; may need alternative.

---

## Migration Path

### From Todos to Tasks

1. Rename table: `todos` → `tasks`
2. Rename column: `content` → `title`
3. Add new columns (mission_id, created_by, etc.)
4. Keep `active_form` for backwards compat, deprecate
5. Update TodoService → TaskService with backwards-compat methods
6. Update API routes, maintain old endpoints as aliases

### Session Integration

- Missions create sessions when started (after plan approval)
- Tasks can optionally link to sessions
- Existing session/message flow unchanged
