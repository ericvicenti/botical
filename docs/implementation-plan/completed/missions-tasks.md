# Phase 10: Missions & Tasks

**Goal**: Implement the mission system with planning documents and evolve todos into tasks

## Overview

Missions are the core unit of autonomous work in Botical. Unlike simple chat sessions, missions have:
- A **planning phase** with a markdown document
- **Completion criteria** drafted by the agent, approved by the user
- **Tasks** as granular work units within the mission

This phase also evolves the existing `todos` system into a proper `tasks` system.

---

## Backend

### Database Migration

```sql
-- Migration 3: Missions and Tasks

-- Create missions table
CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,                    -- Created after plan approval
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  plan_path TEXT NOT NULL,            -- e.g., ".botical/missions/auth.md"
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

CREATE INDEX idx_missions_project ON missions(project_id);
CREATE INDEX idx_missions_status ON missions(status);

-- Evolve todos to tasks
ALTER TABLE todos RENAME TO tasks;
ALTER TABLE tasks ADD COLUMN mission_id TEXT REFERENCES missions(id);
ALTER TABLE tasks ADD COLUMN created_by TEXT DEFAULT 'agent';
ALTER TABLE tasks ADD COLUMN assigned_to TEXT DEFAULT 'agent';
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN result TEXT;
ALTER TABLE tasks ADD COLUMN started_at INTEGER;
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;
ALTER TABLE tasks RENAME COLUMN content TO title;

CREATE INDEX idx_tasks_mission ON tasks(mission_id);
```

### MissionService

Create `src/services/missions.ts`:

```typescript
interface MissionService {
  // CRUD
  create(projectId: string, title: string): Promise<Mission>
  get(id: string): Promise<Mission | null>
  list(projectId: string, filters?: MissionFilters): Promise<Mission[]>
  delete(id: string): Promise<void>

  // Planning phase
  getPlan(id: string): Promise<string>           // Read plan markdown
  updatePlan(id: string, content: string): Promise<void>
  approvePlan(id: string, userId: string): Promise<void>

  // Execution lifecycle
  start(id: string): Promise<void>               // Creates session, begins agent
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  complete(id: string, summary: string, criteriaMet: boolean): Promise<void>
  cancel(id: string): Promise<void>

  // Queries
  getWithTasks(id: string): Promise<MissionWithTasks>
  getActiveMissions(projectId: string): Promise<Mission[]>
}
```

**Mission Lifecycle:**
```
create() → status: 'planning'
           Agent drafts plan in .botical/missions/{slug}.md

approvePlan() → status: 'pending'
                Plan approved, ready to start

start() → status: 'running'
          Creates session, agent begins execution

pause() → status: 'paused'
          Execution paused, can resume

resume() → status: 'running'
           Continues from paused state

complete() → status: 'completed'
             Mission finished successfully

cancel() → status: 'cancelled'
           User cancelled the mission
```

### TaskService (Evolved from TodoService)

Update `src/services/todos.ts` → `src/services/tasks.ts`:

```typescript
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
  listBySession(sessionId: string): Promise<Task[]>  // Backwards compat

  // Status transitions
  start(id: string): Promise<Task>
  complete(id: string, result?: string): Promise<Task>
  block(id: string, reason?: string): Promise<Task>
  cancel(id: string): Promise<Task>

  // Batch operations (backwards compat)
  replaceBatch(sessionId: string, tasks: TaskInput[]): Promise<Task[]>
  clearCompleted(sessionId: string): Promise<void>
}
```

### REST Routes

Create `src/server/routes/missions.ts`:

```
POST   /api/projects/:projectId/missions     Create mission (starts planning)
GET    /api/projects/:projectId/missions     List missions
GET    /api/missions/:id                     Get mission details
GET    /api/missions/:id/plan                Get plan markdown content
PUT    /api/missions/:id/plan                Update plan content
POST   /api/missions/:id/approve             Approve plan (requires userId)
POST   /api/missions/:id/start               Start execution
POST   /api/missions/:id/pause               Pause execution
POST   /api/missions/:id/resume              Resume execution
POST   /api/missions/:id/complete            Mark complete
POST   /api/missions/:id/cancel              Cancel mission
DELETE /api/missions/:id                     Delete mission
GET    /api/missions/:id/tasks               List mission tasks
POST   /api/missions/:id/tasks               Create task in mission
```

Update `src/server/routes/todos.ts` → `src/server/routes/tasks.ts`:

```
POST   /api/projects/:projectId/tasks        Create standalone task
GET    /api/projects/:projectId/tasks        List project tasks
GET    /api/tasks/:id                        Get task
PUT    /api/tasks/:id                        Update task
POST   /api/tasks/:id/start                  Start task
POST   /api/tasks/:id/complete               Complete task
DELETE /api/tasks/:id                        Delete task

# Backwards compatibility aliases
GET    /api/sessions/:sessionId/todos        → List tasks by session
POST   /api/sessions/:sessionId/todos        → Create task in session
PUT    /api/sessions/:sessionId/todos        → Batch replace
```

### WebSocket Events

Add to `src/websocket/protocol.ts`:

```typescript
// Server → Client Events
| { type: 'mission.created'; payload: Mission }
| { type: 'mission.updated'; payload: Mission }
| { type: 'mission.plan.updated'; payload: { id: string; content: string } }
| { type: 'mission.started'; payload: Mission }
| { type: 'mission.paused'; payload: Mission }
| { type: 'mission.resumed'; payload: Mission }
| { type: 'mission.completed'; payload: Mission }
| { type: 'mission.failed'; payload: { id: string; error: string } }

| { type: 'task.created'; payload: Task }
| { type: 'task.updated'; payload: Task }
| { type: 'task.started'; payload: Task }
| { type: 'task.completed'; payload: Task }
```

### Mission Planning Document

When a mission is created, generate `.botical/missions/{slug}.md`:

```markdown
# Mission: {title}

## Goal
{User's initial description}

## Completion Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Approach
1. Step 1
2. Step 2
3. Step 3

## Constraints
- Constraint 1
- Constraint 2

## Notes
Additional context...

---
*Plan drafted by Botical on {date}*
```

---

## Frontend

### API Queries

Add to `webui/src/lib/api/queries.ts`:

```typescript
// Missions
export function useMissions(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'missions'],
    queryFn: () => apiClient<Mission[]>(`/api/projects/${projectId}/missions`),
  })
}

export function useMission(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId],
    queryFn: () => apiClient<Mission>(`/api/missions/${missionId}`),
  })
}

export function useMissionPlan(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId, 'plan'],
    queryFn: () => apiClient<{ content: string }>(`/api/missions/${missionId}/plan`),
  })
}

export function useMissionTasks(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId, 'tasks'],
    queryFn: () => apiClient<Task[]>(`/api/missions/${missionId}/tasks`),
  })
}

// Mutations
export function useCreateMission() {
  return useMutation({
    mutationFn: (data: { projectId: string; title: string }) =>
      apiClient<Mission>(`/api/projects/${data.projectId}/missions`, {
        method: 'POST',
        body: JSON.stringify({ title: data.title }),
      }),
  })
}

export function useApproveMissionPlan() {
  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/approve`, { method: 'POST' }),
  })
}

export function useStartMission() {
  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/start`, { method: 'POST' }),
  })
}
```

### WebSocket Cache Updates

Handle mission events in WebSocket provider:

```typescript
function handleWebSocketEvent(event: WSEvent, queryClient: QueryClient) {
  switch (event.type) {
    case 'mission.created':
    case 'mission.updated':
    case 'mission.started':
    case 'mission.paused':
    case 'mission.completed':
      queryClient.invalidateQueries({
        queryKey: ['projects', event.payload.projectId, 'missions']
      })
      queryClient.setQueryData(
        ['missions', event.payload.id],
        event.payload
      )
      break

    case 'task.created':
    case 'task.updated':
    case 'task.completed':
      if (event.payload.missionId) {
        queryClient.invalidateQueries({
          queryKey: ['missions', event.payload.missionId, 'tasks']
        })
      }
      break
  }
}
```

---

## Testing

### Unit Tests

```
tests/unit/services/missions.test.ts       40+ tests
├── create() - creates mission with plan file
├── get() - retrieves mission by id
├── list() - filters by status, project
├── getPlan() / updatePlan() - plan CRUD
├── approvePlan() - sets approved timestamp
├── start() - creates session, changes status
├── pause() / resume() - lifecycle transitions
├── complete() - marks complete with summary
├── cancel() - marks cancelled
└── validation - rejects invalid transitions

tests/unit/services/tasks.test.ts          35+ tests (update existing)
├── create() - with/without missionId
├── status transitions - start, complete, block
├── listByMission() - filters correctly
├── backwards compat - session-based operations
└── batch operations - replaceBatch, clearCompleted

tests/unit/server/routes/missions.test.ts  30+ tests
├── POST /projects/:id/missions
├── GET /projects/:id/missions
├── GET /missions/:id
├── PUT /missions/:id/plan
├── POST /missions/:id/approve
├── POST /missions/:id/start
├── POST /missions/:id/pause
├── POST /missions/:id/complete
└── error handling

tests/unit/server/routes/tasks.test.ts     25+ tests (update existing)
```

### Integration Tests

```
tests/integration/mission-lifecycle.test.ts
├── Full workflow: create → plan → approve → start → complete
├── Pause and resume
├── Cancel during planning
├── Cancel during execution
├── Tasks within mission
└── WebSocket events broadcast correctly
```

---

## Validation Criteria

- [ ] Missions can be created with auto-generated planning documents
- [ ] Plans can be read and updated via API
- [ ] Plan approval changes status to 'pending'
- [ ] Starting a mission creates a session and begins agent execution
- [ ] Mission lifecycle transitions work (pause, resume, complete, cancel)
- [ ] Tasks can be created standalone or within missions
- [ ] Existing todo functionality preserved (backwards compat)
- [ ] WebSocket events broadcast for all mission/task changes
- [ ] All 130+ tests pass

**Deliverable**: Backend support for missions and tasks with full API
