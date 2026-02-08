# Query Primitive: Unified Data Fetching for Botical

## Executive Summary

This document outlines a new **Query Primitive** abstraction for Botical that unifies data fetching across the frontend and backend. The goal is to create a single, consistent API for querying data that:

1. Works identically on client and server
2. Provides automatic caching and invalidation
3. Supports real-time updates via WebSocket
4. Enables better testing through dependency injection
5. Reduces boilerplate and inconsistencies

---

## Problem Statement

### Current State

Botical currently uses multiple data fetching patterns:

1. **TanStack Query** (`useQuery`/`useMutation`) for REST API calls
2. **WebSocket subscriptions** for real-time updates
3. **Manual `fetch` calls** in some places
4. **localStorage** for settings and UI state
5. **Service methods** on the backend that query SQLite

### Pain Points

1. **Inconsistent patterns**: Some queries use `invalidateQueries`, others use `refetchQueries`, some poll
2. **Cache configuration scattered**: `staleTime: 60000` in App.tsx affects all queries
3. **Testing difficulty**: Components are tightly coupled to React Query hooks
4. **Server/client mismatch**: Backend services don't share any abstractions with frontend
5. **Real-time complexity**: Manual WebSocket subscription management
6. **Query key management**: String-based keys prone to typos and mismatches

---

## Proposed Solution

### The Query Primitive

A new `Query<T>` primitive that encapsulates:

```typescript
interface Query<T, P = void> {
  // Identity
  name: string;

  // Data fetching
  fetch: (params: P, context: QueryContext) => Promise<T>;

  // Cache configuration
  cache?: {
    ttl?: number;           // Time-to-live in ms
    scope?: 'global' | 'project' | 'session';
    key?: (params: P) => string[];
  };

  // Real-time configuration
  realtime?: {
    events?: string[];      // WebSocket events that invalidate this query
    subscribe?: (params: P, onData: (data: T) => void) => () => void;
  };

  // Pagination (optional)
  pagination?: {
    defaultLimit: number;
    maxLimit: number;
  };

  // Dependencies (for automatic invalidation)
  invalidatedBy?: Query<any, any>[];
}
```

### Usage Examples

**Defining a Query:**

```typescript
// queries/workflows.ts
export const workflowsQuery = defineQuery({
  name: 'workflows',

  fetch: async ({ projectId }, { db }) => {
    return WorkflowService.list(db, projectId);
  },

  cache: {
    scope: 'project',
    ttl: 60_000,
    key: ({ projectId }) => ['projects', projectId, 'workflows'],
  },

  realtime: {
    events: ['workflow.created', 'workflow.updated', 'workflow.deleted'],
  },

  pagination: {
    defaultLimit: 50,
    maxLimit: 100,
  },
});
```

**Using on the Frontend:**

```typescript
// React component
function WorkflowsPanel({ projectId }) {
  const { data, isLoading, error, refetch } = useBoticalQuery(workflowsQuery, { projectId });

  return (
    <div>
      {data?.map(workflow => <WorkflowItem key={workflow.id} workflow={workflow} />)}
    </div>
  );
}
```

**Using on the Backend:**

```typescript
// API route handler
app.get('/api/workflows', async (c) => {
  const projectId = c.req.query('projectId');
  const data = await executeQuery(workflowsQuery, { projectId }, c);
  return c.json({ data });
});
```

---

## Architecture

### Layer 1: Query Definitions

All queries are defined in a central location with full type safety:

```
src/queries/
  ├── index.ts           # Re-exports all queries
  ├── projects.ts        # Project queries
  ├── sessions.ts        # Session queries
  ├── messages.ts        # Message queries
  ├── workflows.ts       # Workflow queries
  ├── files.ts           # File queries
  ├── git.ts             # Git queries
  ├── processes.ts       # Process queries
  ├── services.ts        # Service queries
  ├── tasks.ts           # Task queries
  ├── missions.ts        # Mission queries
  ├── agents.ts          # Agent queries
  └── tools.ts           # Tool queries
```

### Layer 2: Query Execution

**Backend (`src/query/executor.ts`):**

```typescript
async function executeQuery<T, P>(
  query: Query<T, P>,
  params: P,
  context: HonoContext
): Promise<T> {
  const db = getDbFromContext(context);
  const cache = getCacheFromContext(context);

  // Check cache
  const cacheKey = query.cache?.key?.(params) ?? [query.name];
  const cached = await cache.get(cacheKey);
  if (cached && !isStale(cached, query.cache?.ttl)) {
    return cached.data;
  }

  // Execute query
  const data = await query.fetch(params, { db, cache, ...context });

  // Update cache
  await cache.set(cacheKey, data, query.cache?.ttl);

  return data;
}
```

**Frontend (`webui/src/query/useBoticalQuery.ts`):**

```typescript
function useBoticalQuery<T, P>(
  query: Query<T, P>,
  params: P,
  options?: { enabled?: boolean }
) {
  const queryClient = useQueryClient();
  const ws = useWebSocket();

  // Generate cache key
  const queryKey = query.cache?.key?.(params) ?? [query.name];

  // Set up real-time subscription
  useEffect(() => {
    if (!query.realtime?.events) return;

    const unsubscribe = ws.subscribe(query.realtime.events, () => {
      queryClient.invalidateQueries({ queryKey });
    });

    return unsubscribe;
  }, [queryKey]);

  // Use TanStack Query under the hood
  return useQuery({
    queryKey,
    queryFn: () => fetchFromApi(query, params),
    staleTime: query.cache?.ttl,
    enabled: options?.enabled,
  });
}
```

### Layer 3: Mutations

Similar pattern for mutations:

```typescript
interface Mutation<T, P, R = void> {
  name: string;
  execute: (params: P, context: MutationContext) => Promise<R>;
  invalidates?: Query<any, any>[];
  optimisticUpdate?: (params: P, currentData: T) => T;
}
```

---

## Complete Query Inventory

### Projects Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `projects.list` | `{ ownerId?, limit, offset }` | `Project[]` | Yes | `project.*` |
| `projects.get` | `{ projectId }` | `Project` | No | `project.updated` |
| `projects.members` | `{ projectId }` | `ProjectMember[]` | Yes | `project.member.*` |

### Sessions Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `sessions.list` | `{ projectId, status?, limit, offset }` | `Session[]` | Yes | `session.*` |
| `sessions.get` | `{ sessionId, projectId }` | `Session` | No | `session.updated` |
| `sessions.messages` | `{ sessionId, projectId, limit, offset }` | `Message[]` | Yes | `message.*` |

### Messages Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `messages.get` | `{ messageId, projectId }` | `Message` | No | `message.updated` |
| `messages.parts` | `{ messageId, projectId }` | `MessagePart[]` | No | `message.part.*` |

### Tasks Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `tasks.list` | `{ projectId, sessionId?, missionId?, status?, limit, offset }` | `Task[]` | Yes | `task.*` |
| `tasks.get` | `{ taskId, projectId }` | `Task` | No | `task.updated` |
| `tasks.bySession` | `{ sessionId, projectId, limit, offset }` | `Task[]` | Yes | `task.*` |
| `tasks.byMission` | `{ missionId, projectId, limit, offset }` | `Task[]` | Yes | `task.*` |

### Missions Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `missions.list` | `{ projectId, status?, limit, offset }` | `Mission[]` | Yes | `mission.*` |
| `missions.get` | `{ missionId, projectId }` | `Mission` | No | `mission.updated` |
| `missions.plan` | `{ missionId }` | `string` (markdown) | No | `mission.plan.updated` |
| `missions.tasks` | `{ missionId, limit, offset }` | `Task[]` | Yes | `task.*` |

### Workflows Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `workflows.list` | `{ projectId, category?, limit, offset }` | `Workflow[]` | Yes | `workflow.*` |
| `workflows.get` | `{ workflowId, projectId }` | `Workflow` | No | `workflow.updated` |

### Files Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `files.list` | `{ projectId, path? }` | `FileEntry[]` | No | `file.*` |
| `files.get` | `{ projectId, path, commit? }` | `FileContent` | No | `file.updated` |
| `files.folder` | `{ projectId, path?, commit? }` | `FolderDetails` | No | `file.*` |

### Git Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `git.status` | `{ projectId }` | `GitStatus` | No | `git.status.changed` |
| `git.branches` | `{ projectId }` | `Branch[]` | No | `git.branch.*` |
| `git.log` | `{ projectId, limit? }` | `Commit[]` | No | `git.commit.created` |
| `git.diff` | `{ projectId, file? }` | `DiffResult` | No | `git.status.changed` |
| `git.commit` | `{ projectId, hash }` | `CommitDetails` | No | - |
| `git.commitDiff` | `{ projectId, hash, file? }` | `DiffResult` | No | - |
| `git.syncStatus` | `{ projectId }` | `SyncStatus` | No | `git.sync.*` |
| `git.identity` | `{}` | `GitIdentity` | No | - (static) |

### Processes Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `processes.list` | `{ projectId, type?, status?, scope?, limit, offset }` | `Process[]` | Yes | `process.*` |
| `processes.get` | `{ processId }` | `Process` | No | `process.*` |
| `processes.output` | `{ processId, limit?, since? }` | `ProcessOutput[]` | Yes | `process.output` |

### Services Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `services.list` | `{ projectId, autoStart?, enabled?, limit, offset }` | `Service[]` | Yes | `service.*` |
| `services.get` | `{ serviceId }` | `Service` | No | `service.updated` |

### Agents Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `agents.list` | `{ projectId?, mode?, includeHidden? }` | `Agent[]` | No | - (static) |
| `agents.get` | `{ name, projectId? }` | `Agent` | No | - |

### Tools Domain

| Query Name | Parameters | Returns | Pagination | Real-time Events |
|------------|------------|---------|------------|------------------|
| `tools.core` | `{}` | `CoreTool[]` | No | - (static) |
| `tools.actions` | `{}` | `Action[]` | No | - (static) |
| `tools.list` | `{ projectId, type?, enabled?, limit, offset }` | `Tool[]` | Yes | `tool.*` |
| `tools.get` | `{ toolId, projectId }` | `Tool` | No | - |

### Settings Domain (localStorage)

| Query Name | Parameters | Returns | Pagination | Storage |
|------------|------------|---------|------------|---------|
| `settings.get` | `{}` | `Settings` | No | localStorage |
| `settings.ui` | `{}` | `UISettings` | No | localStorage |
| `settings.tabs` | `{}` | `Tab[]` | No | localStorage |
| `settings.dirtyContent` | `{ path }` | `string?` | No | localStorage |

---

## Migration Plan with Integrated Testing

Each phase includes specific unit tests and e2e tests that must pass before proceeding. Tests are run automatically via `bun test` (unit) and `bunx playwright test` (e2e).

---

### Phase 1: Foundation

**Goal:** Build the core Query primitive infrastructure with comprehensive test coverage.

#### 1.1 Implementation Tasks

| Task | Files Created | Description |
|------|---------------|-------------|
| Directory structure | `src/queries/` | Create query definition directory |
| Type definitions | `src/queries/types.ts` | `Query<T,P>`, `Mutation<T,P,R>`, `QueryContext` |
| defineQuery helper | `src/queries/define.ts` | Factory function for creating queries |
| Backend executor | `src/queries/executor.ts` | `executeQuery()`, `executeMutation()` |
| Backend cache | `src/queries/cache.ts` | In-memory cache with TTL support |
| Frontend hook | `webui/src/queries/useBoticalQuery.ts` | React hook wrapping TanStack Query |
| Frontend mutation hook | `webui/src/queries/useBoticalMutation.ts` | Mutation hook with auto-invalidation |
| Query provider | `webui/src/queries/QueryProvider.tsx` | Context for dependency injection |

#### 1.2 Unit Tests (`tests/unit/queries/`)

**File: `tests/unit/queries/types.test.ts`**
```typescript
describe('Query type definitions', () => {
  it('defineQuery returns valid Query object with all required fields');
  it('defineQuery applies default cache settings');
  it('defineQuery validates query name format');
  it('defineMutation returns valid Mutation object');
  it('defineMutation links invalidates to query definitions');
});
```

**File: `tests/unit/queries/executor.test.ts`**
```typescript
describe('executeQuery', () => {
  it('calls query.fetch with correct params and context');
  it('returns data from query.fetch');
  it('passes database connection in context');
  it('handles query.fetch errors gracefully');
  it('supports queries without cache config');
});

describe('executeQuery with caching', () => {
  it('stores result in cache after fetch');
  it('returns cached data when available and fresh');
  it('refetches when cache is stale (TTL expired)');
  it('generates correct cache key from params');
  it('respects cache scope (global vs project)');
});

describe('executeMutation', () => {
  it('calls mutation.execute with correct params');
  it('returns mutation result');
  it('invalidates specified queries after success');
  it('does not invalidate on error');
});
```

**File: `tests/unit/queries/cache.test.ts`**
```typescript
describe('QueryCache', () => {
  it('stores and retrieves values by key');
  it('returns undefined for missing keys');
  it('expires entries after TTL');
  it('clears all entries on reset');
  it('supports array keys (converted to string)');
  it('handles concurrent access correctly');
});
```

**Run command:** `bun test tests/unit/queries/`

**Pass criteria:** All 20+ unit tests pass.

#### 1.3 Frontend Unit Tests (`webui/src/queries/__tests__/`)

**File: `webui/src/queries/__tests__/useBoticalQuery.test.tsx`**
```typescript
describe('useBoticalQuery', () => {
  it('fetches data on mount when enabled');
  it('does not fetch when enabled=false');
  it('returns isLoading=true while fetching');
  it('returns data after successful fetch');
  it('returns error on fetch failure');
  it('uses query cache key for TanStack Query');
  it('respects query TTL for staleTime');
  it('refetch() triggers new fetch');
});

describe('useBoticalQuery with realtime', () => {
  it('subscribes to WebSocket events on mount');
  it('unsubscribes on unmount');
  it('invalidates query when event received');
  it('handles multiple event types');
});
```

**File: `webui/src/queries/__tests__/useBoticalMutation.test.tsx`**
```typescript
describe('useBoticalMutation', () => {
  it('calls API on mutate()');
  it('returns isPending=true while executing');
  it('returns data on success');
  it('returns error on failure');
  it('invalidates specified queries on success');
  it('does not invalidate on error');
  it('supports onSuccess callback');
  it('supports onError callback');
});
```

**File: `webui/src/queries/__tests__/QueryProvider.test.tsx`**
```typescript
describe('QueryProvider', () => {
  it('provides query context to children');
  it('allows query override for testing');
  it('merges default and custom queries');
});
```

**Run command:** `cd webui && bun test src/queries/__tests__/`

**Pass criteria:** All 25+ frontend unit tests pass.

#### 1.4 E2E Tests (`webui/e2e/query-primitive.spec.ts`)

```typescript
describe('Query Primitive E2E', () => {
  describe('Basic query flow', () => {
    it('loads data using useBoticalQuery and displays in component');
    it('shows loading state while query is pending');
    it('shows error state when query fails');
    it('refetches data when refetch is called');
  });

  describe('Mutation flow', () => {
    it('executes mutation and updates UI');
    it('invalidates related queries after mutation');
    it('shows error when mutation fails');
  });

  describe('Real-time updates', () => {
    it('updates UI when WebSocket event received');
    it('handles WebSocket disconnect gracefully');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/query-primitive.spec.ts`

**Pass criteria:** All 9 e2e tests pass.

#### 1.5 Phase 1 Validation Checklist

- [ ] `bun test tests/unit/queries/` - All pass
- [ ] `cd webui && bun test src/queries/__tests__/` - All pass
- [ ] `cd webui && bunx playwright test e2e/query-primitive.spec.ts` - All pass
- [ ] TypeScript compiles with no errors
- [ ] No console errors in browser

---

### Phase 2: Simple Queries (Static Data)

**Goal:** Migrate queries that have no real-time requirements to validate the pattern.

#### 2.1 Queries to Migrate

| Query | Current Location | New Location | Has Cache | Has Realtime |
|-------|------------------|--------------|-----------|--------------|
| `agents.list` | `queries.ts:useAgents` | `src/queries/agents.ts` | Yes (static) | No |
| `agents.get` | `queries.ts:useAgent` | `src/queries/agents.ts` | Yes (static) | No |
| `tools.core` | `queries.ts:useCoreTools` | `src/queries/tools.ts` | Yes (static) | No |
| `tools.actions` | `queries.ts:useBackendActions` | `src/queries/tools.ts` | Yes (static) | No |
| `git.identity` | `queries.ts:useGitIdentity` | `src/queries/git.ts` | Yes (forever) | No |

#### 2.2 Implementation Tasks

| Task | Description |
|------|-------------|
| Create `src/queries/agents.ts` | Define `agentsListQuery`, `agentsGetQuery` |
| Create `src/queries/tools.ts` | Define `toolsCoreQuery`, `toolsActionsQuery` |
| Create `src/queries/git.ts` | Define `gitIdentityQuery` |
| Create frontend adapters | `useAgents()` → `useBoticalQuery(agentsListQuery)` |
| Update components | Replace old hooks with new ones |

#### 2.3 Unit Tests

**File: `tests/unit/queries/agents.test.ts`**
```typescript
describe('agentsListQuery', () => {
  it('fetches built-in agents from AgentRegistry');
  it('fetches custom agents from database when projectId provided');
  it('filters by mode when specified');
  it('excludes hidden agents by default');
  it('uses static cache (never expires)');
});

describe('agentsGetQuery', () => {
  it('returns agent by name');
  it('checks custom agents first, then built-in');
  it('throws NotFoundError for unknown agent');
});
```

**File: `tests/unit/queries/tools.test.ts`**
```typescript
describe('toolsCoreQuery', () => {
  it('returns list of core tools');
  it('includes tool metadata (name, description, params)');
  it('uses static cache');
});

describe('toolsActionsQuery', () => {
  it('returns list of backend actions');
  it('includes action metadata (id, label, category)');
  it('uses static cache');
});
```

**File: `tests/unit/queries/git.test.ts`**
```typescript
describe('gitIdentityQuery', () => {
  it('returns SSH public key');
  it('uses forever cache (staleTime: Infinity)');
  it('handles missing SSH key gracefully');
});
```

**Run command:** `bun test tests/unit/queries/agents.test.ts tests/unit/queries/tools.test.ts tests/unit/queries/git.test.ts`

**Pass criteria:** All 12+ tests pass.

#### 2.4 E2E Tests

**File: `webui/e2e/queries-phase2.spec.ts`**
```typescript
describe('Phase 2: Static Queries', () => {
  describe('Agents', () => {
    it('displays agent list in agent selector');
    it('shows agent details when selected');
    it('filters agents by mode');
  });

  describe('Tools', () => {
    it('displays core tools in tool list');
    it('displays backend actions in command palette');
  });

  describe('Git Identity', () => {
    it('displays SSH public key in settings');
    it('caches identity across page navigation');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/queries-phase2.spec.ts`

**Pass criteria:** All 7 e2e tests pass.

#### 2.5 Phase 2 Validation Checklist

- [ ] `bun test tests/unit/queries/agents.test.ts` - All pass
- [ ] `bun test tests/unit/queries/tools.test.ts` - All pass
- [ ] `bun test tests/unit/queries/git.test.ts` - All pass
- [ ] `cd webui && bunx playwright test e2e/queries-phase2.spec.ts` - All pass
- [ ] Old hooks (`useAgents`, `useCoreTools`, etc.) still work (backward compat)
- [ ] No regressions in existing e2e tests

---

### Phase 3: CRUD Queries

**Goal:** Migrate standard CRUD operations with cache invalidation.

#### 3.1 Queries to Migrate

| Query | Mutations | Real-time Events |
|-------|-----------|------------------|
| `projects.list` | `createProject`, `updateProject`, `archiveProject` | `project.*` |
| `projects.get` | - | `project.updated` |
| `workflows.list` | `createWorkflow`, `updateWorkflow`, `deleteWorkflow` | `workflow.*` |
| `workflows.get` | - | `workflow.updated` |
| `services.list` | `createService`, `updateService`, `deleteService` | `service.*` |
| `services.get` | - | `service.updated` |

#### 3.2 Unit Tests

**File: `tests/unit/queries/projects.test.ts`**
```typescript
describe('projectsListQuery', () => {
  it('fetches projects from database');
  it('supports pagination (limit, offset)');
  it('filters by ownerId');
  it('excludes archived projects by default');
});

describe('projectsGetQuery', () => {
  it('fetches single project by ID');
  it('throws NotFoundError for missing project');
});

describe('createProjectMutation', () => {
  it('creates project in database');
  it('invalidates projects.list query');
  it('returns created project');
});

describe('updateProjectMutation', () => {
  it('updates project fields');
  it('invalidates projects.list and projects.get');
});
```

**File: `tests/unit/queries/workflows.test.ts`**
```typescript
describe('workflowsListQuery', () => {
  it('fetches workflows for project');
  it('supports category filter');
  it('supports pagination');
});

describe('workflowsGetQuery', () => {
  it('fetches single workflow by ID');
  it('throws NotFoundError for missing workflow');
});

describe('createWorkflowMutation', () => {
  it('creates workflow in database');
  it('invalidates workflows.list query');
});

describe('updateWorkflowMutation', () => {
  it('updates workflow fields');
  it('invalidates both list and get queries');
});

describe('deleteWorkflowMutation', () => {
  it('deletes workflow from database');
  it('invalidates workflows.list query');
});
```

**File: `tests/unit/queries/services.test.ts`**
```typescript
describe('servicesListQuery', () => {
  it('fetches services for project');
  it('filters by autoStart flag');
  it('filters by enabled flag');
});

describe('servicesGetQuery', () => {
  it('fetches single service by ID');
  it('includes running status');
});

describe('service mutations', () => {
  it('createServiceMutation creates service config');
  it('updateServiceMutation updates service');
  it('deleteServiceMutation removes service');
  it('startServiceMutation spawns process');
  it('stopServiceMutation kills process');
});
```

**Run command:** `bun test tests/unit/queries/projects.test.ts tests/unit/queries/workflows.test.ts tests/unit/queries/services.test.ts`

**Pass criteria:** All 25+ tests pass.

#### 3.3 E2E Tests

**File: `webui/e2e/queries-phase3.spec.ts`**
```typescript
describe('Phase 3: CRUD Queries', () => {
  describe('Projects', () => {
    it('displays project list');
    it('creates new project and shows in list');
    it('updates project and reflects changes');
    it('archives project and removes from list');
  });

  describe('Workflows', () => {
    it('displays workflow list in sidebar');
    it('creates workflow and shows in list immediately');
    it('updates workflow and reflects in list');
    it('deletes workflow and removes from list');
  });

  describe('Services', () => {
    it('displays service list');
    it('creates service and shows in list');
    it('starts service and shows running status');
    it('stops service and shows stopped status');
    it('deletes service and removes from list');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/queries-phase3.spec.ts`

**Pass criteria:** All 13 e2e tests pass.

#### 3.4 Phase 3 Validation Checklist

- [ ] `bun test tests/unit/queries/projects.test.ts` - All pass
- [ ] `bun test tests/unit/queries/workflows.test.ts` - All pass
- [ ] `bun test tests/unit/queries/services.test.ts` - All pass
- [ ] `cd webui && bunx playwright test e2e/queries-phase3.spec.ts` - All pass
- [ ] Existing workflow e2e tests still pass
- [ ] Cache invalidation works correctly (list updates after mutations)

---

### Phase 4: Real-time Queries

**Goal:** Migrate queries that require WebSocket updates.

#### 4.1 Queries to Migrate

| Query | WebSocket Events | Special Behavior |
|-------|------------------|------------------|
| `sessions.list` | `session.created`, `session.updated`, `session.deleted` | Paginated |
| `sessions.get` | `session.updated` | Single item |
| `sessions.messages` | `message.created`, `message.text.delta`, `message.complete` | Streaming |
| `tasks.list` | `task.created`, `task.updated`, `task.completed` | Multi-filter |
| `tasks.get` | `task.updated` | Single item |
| `messages.get` | `message.updated` | With parts |
| `messages.parts` | `message.part.created` | Streaming |

#### 4.2 Unit Tests

**File: `tests/unit/queries/sessions.test.ts`**
```typescript
describe('sessionsListQuery', () => {
  it('fetches sessions for project');
  it('supports status filter');
  it('supports pagination');
  it('subscribes to session.* events');
});

describe('sessionsGetQuery', () => {
  it('fetches single session');
  it('subscribes to session.updated event');
});

describe('sessionsMessagesQuery', () => {
  it('fetches messages for session');
  it('supports pagination');
  it('subscribes to message.* events');
});
```

**File: `tests/unit/queries/tasks.test.ts`**
```typescript
describe('tasksListQuery', () => {
  it('fetches tasks for project');
  it('filters by sessionId');
  it('filters by missionId');
  it('filters by status');
  it('subscribes to task.* events');
});

describe('tasksGetQuery', () => {
  it('fetches single task');
  it('subscribes to task.updated event');
});

describe('task mutations', () => {
  it('createTaskMutation creates task');
  it('updateTaskMutation updates task');
  it('completeTaskMutation marks complete');
  it('cancelTaskMutation cancels task');
});
```

**File: `tests/unit/queries/messages.test.ts`**
```typescript
describe('messagesGetQuery', () => {
  it('fetches message by ID');
  it('includes message parts');
  it('subscribes to message.updated event');
});

describe('messagesPartsQuery', () => {
  it('fetches parts for message');
  it('subscribes to message.part.created event');
});

describe('sendMessageMutation', () => {
  it('sends message to API');
  it('invalidates sessions.messages query');
  it('handles streaming response');
});
```

**Run command:** `bun test tests/unit/queries/sessions.test.ts tests/unit/queries/tasks.test.ts tests/unit/queries/messages.test.ts`

**Pass criteria:** All 20+ tests pass.

#### 4.3 E2E Tests

**File: `webui/e2e/queries-phase4.spec.ts`**
```typescript
describe('Phase 4: Real-time Queries', () => {
  describe('Sessions', () => {
    it('displays session list');
    it('updates list when new session created via WebSocket');
    it('updates session status in real-time');
  });

  describe('Messages', () => {
    it('displays message list');
    it('shows new message when created');
    it('updates message content during streaming');
    it('shows tool calls and results');
  });

  describe('Tasks', () => {
    it('displays task list');
    it('updates task status in real-time');
    it('filters tasks by status');
    it('shows task completion');
  });

  describe('WebSocket resilience', () => {
    it('reconnects after disconnect');
    it('refetches data after reconnect');
    it('shows connection status indicator');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/queries-phase4.spec.ts`

**Pass criteria:** All 13 e2e tests pass.

#### 4.4 Phase 4 Validation Checklist

- [ ] `bun test tests/unit/queries/sessions.test.ts` - All pass
- [ ] `bun test tests/unit/queries/tasks.test.ts` - All pass
- [ ] `bun test tests/unit/queries/messages.test.ts` - All pass
- [ ] `cd webui && bunx playwright test e2e/queries-phase4.spec.ts` - All pass
- [ ] WebSocket events trigger UI updates
- [ ] Streaming messages work correctly

---

### Phase 5: Complex Queries

**Goal:** Migrate queries with special requirements.

#### 5.1 Queries to Migrate

| Query | Complexity | Special Requirements |
|-------|------------|---------------------|
| `files.list` | Directory traversal | Path handling, symlinks |
| `files.get` | Binary content | Git commits, encodings |
| `git.status` | Polling fallback | 30s interval, WebSocket |
| `git.branches` | Branch operations | Checkout, create, delete |
| `git.log` | Commit history | Pagination, diff links |
| `git.diff` | Diff parsing | File-level, commit-level |
| `processes.list` | Process state | Running status |
| `processes.output` | Streaming | Real-time terminal output |
| `missions.list` | Complex state | Plan content, tasks |

#### 5.2 Unit Tests

**File: `tests/unit/queries/files.test.ts`**
```typescript
describe('filesListQuery', () => {
  it('lists directory contents');
  it('handles nested paths');
  it('excludes hidden files by default');
  it('handles symlinks correctly');
});

describe('filesGetQuery', () => {
  it('fetches file content');
  it('detects encoding (utf8, binary)');
  it('fetches from git commit when specified');
  it('handles large files');
});
```

**File: `tests/unit/queries/git-status.test.ts`**
```typescript
describe('gitStatusQuery', () => {
  it('fetches working tree status');
  it('categorizes files (staged, unstaged, untracked)');
  it('polls every 30 seconds as fallback');
  it('invalidates on git.status.changed event');
});

describe('gitBranchesQuery', () => {
  it('lists local branches');
  it('lists remote branches');
  it('identifies current branch');
});

describe('gitLogQuery', () => {
  it('fetches commit history');
  it('supports limit parameter');
  it('includes commit metadata');
});

describe('gitDiffQuery', () => {
  it('fetches working tree diff');
  it('supports single file diff');
  it('parses diff hunks correctly');
});
```

**File: `tests/unit/queries/processes.test.ts`**
```typescript
describe('processesListQuery', () => {
  it('fetches processes for project');
  it('filters by type (command, service)');
  it('filters by status (running, exited)');
  it('includes exit code for completed');
});

describe('processesGetQuery', () => {
  it('fetches single process');
  it('includes current status');
});

describe('processesOutputQuery', () => {
  it('fetches process output');
  it('supports since parameter for incremental');
  it('subscribes to process.output event');
  it('handles large output (pagination)');
});
```

**File: `tests/unit/queries/missions.test.ts`**
```typescript
describe('missionsListQuery', () => {
  it('fetches missions for project');
  it('filters by status');
  it('includes task count');
});

describe('missionsGetQuery', () => {
  it('fetches single mission');
  it('includes plan summary');
});

describe('missionsPlanQuery', () => {
  it('fetches plan markdown content');
});

describe('missionsTasksQuery', () => {
  it('fetches tasks for mission');
  it('supports pagination');
});
```

**Run command:** `bun test tests/unit/queries/files.test.ts tests/unit/queries/git-status.test.ts tests/unit/queries/processes.test.ts tests/unit/queries/missions.test.ts`

**Pass criteria:** All 30+ tests pass.

#### 5.3 E2E Tests

**File: `webui/e2e/queries-phase5.spec.ts`**
```typescript
describe('Phase 5: Complex Queries', () => {
  describe('Files', () => {
    it('displays file tree');
    it('opens file content in editor');
    it('saves file and updates tree');
    it('handles binary files gracefully');
  });

  describe('Git Status', () => {
    it('displays git status in panel');
    it('updates status after file change');
    it('shows staged vs unstaged files');
    it('polls status every 30 seconds');
  });

  describe('Git Branches', () => {
    it('displays branch list');
    it('switches branch and updates UI');
    it('creates new branch');
  });

  describe('Git Log', () => {
    it('displays commit history');
    it('shows commit details');
    it('displays commit diff');
  });

  describe('Processes', () => {
    it('displays process list');
    it('shows process output in terminal');
    it('streams output in real-time');
    it('kills process and updates status');
  });

  describe('Missions', () => {
    it('displays mission list');
    it('shows mission details with tasks');
    it('updates plan content');
    it('shows task progress');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/queries-phase5.spec.ts`

**Pass criteria:** All 20 e2e tests pass.

#### 5.4 Phase 5 Validation Checklist

- [ ] `bun test tests/unit/queries/files.test.ts` - All pass
- [ ] `bun test tests/unit/queries/git-status.test.ts` - All pass
- [ ] `bun test tests/unit/queries/processes.test.ts` - All pass
- [ ] `bun test tests/unit/queries/missions.test.ts` - All pass
- [ ] `cd webui && bunx playwright test e2e/queries-phase5.spec.ts` - All pass
- [ ] Git polling works correctly
- [ ] Process streaming works correctly

---

### Phase 6: Cleanup and Migration

**Goal:** Remove old code, update all components, final validation.

#### 6.1 Cleanup Tasks

| Task | Description |
|------|-------------|
| Remove `webui/src/lib/api/queries.ts` | Delete old query file |
| Update all components | Replace `useProjects` with `useBoticalQuery(projectsListQuery)` etc. |
| Remove manual WebSocket subscriptions | Components no longer need `useEffect` for WS |
| Update test utilities | New mock helpers for query testing |
| Update CLAUDE.md | Document new query patterns |

#### 6.2 Regression Tests

Run the full test suite to ensure no regressions:

```bash
# Backend unit tests
bun test tests/

# Frontend unit tests
cd webui && bun test

# All e2e tests
cd webui && bunx playwright test
```

#### 6.3 E2E Regression Suite

**File: `webui/e2e/regression.spec.ts`**
```typescript
describe('Full Regression Suite', () => {
  describe('Projects', () => {
    it('creates, edits, and archives project');
  });

  describe('Sessions', () => {
    it('creates session and sends messages');
    it('receives AI responses with streaming');
  });

  describe('Workflows', () => {
    it('creates, edits, saves, and deletes workflow');
    it('workflow appears in sidebar after creation');
  });

  describe('Files', () => {
    it('browses, opens, edits, and saves files');
  });

  describe('Git', () => {
    it('views status, stages files, commits');
  });

  describe('Processes', () => {
    it('spawns, views output, kills process');
  });

  describe('Services', () => {
    it('creates, starts, stops, deletes service');
  });
});
```

**Run command:** `cd webui && bunx playwright test e2e/regression.spec.ts`

**Pass criteria:** All regression tests pass.

#### 6.4 Phase 6 Validation Checklist

- [ ] `bun test tests/` - All backend tests pass
- [ ] `cd webui && bun test` - All frontend tests pass
- [ ] `cd webui && bunx playwright test` - All e2e tests pass
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] Old `queries.ts` file deleted
- [ ] All components updated to new hooks
- [ ] Documentation updated

---

## Test Summary

| Phase | Unit Tests | E2E Tests | Total |
|-------|------------|-----------|-------|
| Phase 1: Foundation | 45 | 9 | 54 |
| Phase 2: Simple Queries | 12 | 7 | 19 |
| Phase 3: CRUD Queries | 25 | 13 | 38 |
| Phase 4: Real-time Queries | 20 | 13 | 33 |
| Phase 5: Complex Queries | 30 | 20 | 50 |
| Phase 6: Cleanup | 0 | 7 | 7 |
| **Total** | **132** | **69** | **201** |

---

## Continuous Integration

Each phase should be validated before proceeding:

```bash
#!/bin/bash
# validate-phase.sh

set -e

echo "Running unit tests..."
bun test tests/unit/queries/

echo "Running frontend tests..."
cd webui && bun test src/queries/__tests__/

echo "Running e2e tests..."
cd webui && bunx playwright test e2e/queries-phase*.spec.ts

echo "TypeScript check..."
cd webui && bunx tsc --noEmit

echo "All validations passed!"
```

---

## Benefits

### 1. Consistency
- Single pattern for all data fetching
- Predictable cache behavior
- Uniform error handling

### 2. Testability
- Queries can be mocked at any level
- Components decoupled from data fetching implementation
- Easy to test cache behavior

### 3. Type Safety
- Full TypeScript support
- Query parameters and return types enforced
- IDE autocomplete for query names

### 4. Real-time by Default
- WebSocket events automatically invalidate queries
- No manual subscription management
- Graceful fallback to polling

### 5. Server/Client Parity
- Same query definitions work on both sides
- Shared cache keys
- SSR-ready (future)

### 6. Performance
- Optimized cache management
- Automatic request deduplication
- Configurable TTLs per query

---

## Open Questions

1. **Cache storage on backend**: Use in-memory Map or Redis for distributed deployments?
2. **SSR support**: Do we need server-side rendering support now or later?
3. **Offline support**: Should queries support offline-first with sync?
4. **GraphQL-like batching**: Should we support batching multiple queries?
5. **Optimistic updates**: How to handle optimistic UI for mutations?

---

## Success Metrics

1. **Reduced boilerplate**: 50% less code for data fetching
2. **Improved test coverage**: 90%+ coverage on query layer
3. **Fewer cache bugs**: Zero cache invalidation bugs after migration
4. **Faster development**: New queries can be added in <10 minutes
5. **Better DX**: Full autocomplete and type checking

---

## Appendix: Current Query Count

| Domain | Queries | Mutations | Total |
|--------|---------|-----------|-------|
| Projects | 3 | 2 | 5 |
| Sessions | 3 | 2 | 5 |
| Messages | 2 | 1 | 3 |
| Tasks | 4 | 6 | 10 |
| Missions | 5 | 7 | 12 |
| Workflows | 2 | 3 | 5 |
| Files | 3 | 4 | 7 |
| Git | 8 | 10 | 18 |
| Processes | 3 | 4 | 7 |
| Services | 2 | 5 | 7 |
| Agents | 2 | 3 | 5 |
| Tools | 4 | 3 | 7 |
| Settings | 4 | 4 | 8 |
| **Total** | **45** | **54** | **99** |

This represents 99 data operations that will be unified under the Query primitive.
