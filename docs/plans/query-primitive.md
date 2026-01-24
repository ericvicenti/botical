# Query Primitive: Unified Data Fetching for Iris

## Executive Summary

This document outlines a new **Query Primitive** abstraction for Iris that unifies data fetching across the frontend and backend. The goal is to create a single, consistent API for querying data that:

1. Works identically on client and server
2. Provides automatic caching and invalidation
3. Supports real-time updates via WebSocket
4. Enables better testing through dependency injection
5. Reduces boilerplate and inconsistencies

---

## Problem Statement

### Current State

Iris currently uses multiple data fetching patterns:

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
  const { data, isLoading, error, refetch } = useIrisQuery(workflowsQuery, { projectId });

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

**Frontend (`webui/src/query/useIrisQuery.ts`):**

```typescript
function useIrisQuery<T, P>(
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

## Migration Plan

### Phase 1: Foundation (Week 1)

1. Create `src/queries/` directory structure
2. Implement `Query<T, P>` type definitions
3. Implement `defineQuery()` helper
4. Implement backend `executeQuery()` function
5. Implement frontend `useIrisQuery()` hook
6. Write comprehensive tests for core functionality

### Phase 2: Simple Queries (Week 2)

Migrate queries with no real-time requirements:
- `agents.list`, `agents.get`
- `tools.core`, `tools.actions`
- `git.identity`
- `settings.*` (localStorage)

### Phase 3: CRUD Queries (Week 3)

Migrate standard CRUD queries:
- `projects.*`
- `workflows.*`
- `services.*`
- `tools.list`, `tools.get`

### Phase 4: Session & Message Queries (Week 4)

Migrate real-time heavy queries:
- `sessions.*`
- `messages.*`
- `tasks.*`

### Phase 5: Complex Queries (Week 5)

Migrate queries with special requirements:
- `files.*` (binary content, git commits)
- `git.*` (polling fallback, multiple events)
- `processes.*` (streaming output)
- `missions.*`

### Phase 6: Cleanup (Week 6)

1. Remove old `queries.ts` file
2. Update all components to use new hooks
3. Remove manual WebSocket subscriptions
4. Update tests
5. Update documentation

---

## Testing Strategy

### Unit Tests

```typescript
describe('workflowsQuery', () => {
  it('fetches workflows from database', async () => {
    const mockDb = createMockDb();
    const result = await executeQuery(workflowsQuery, { projectId: 'proj_1' }, { db: mockDb });
    expect(result).toEqual([/* expected workflows */]);
  });

  it('uses cache when available', async () => {
    const mockCache = createMockCache({ 'projects/proj_1/workflows': [...] });
    const result = await executeQuery(workflowsQuery, { projectId: 'proj_1' }, { cache: mockCache });
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
describe('WorkflowsPanel', () => {
  it('displays workflows from query', async () => {
    const { getByTestId } = render(
      <QueryProvider queries={{ workflows: mockWorkflowsQuery }}>
        <WorkflowsPanel projectId="proj_1" />
      </QueryProvider>
    );

    await waitFor(() => {
      expect(getByTestId('workflow-item-wf_1')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

Continue using Playwright with API mocking, but now mock at the query level:

```typescript
test('creates workflow and shows in list', async ({ page }) => {
  await mockQuery(page, 'workflows.list', { projectId: 'proj_1' }, []);
  await mockMutation(page, 'workflows.create', (params) => ({
    id: 'wf_new',
    ...params,
  }));

  // ... test flow
});
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
