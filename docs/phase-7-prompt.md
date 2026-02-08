# Phase 7: Custom Tools & Todo Tracking

## Context

You are continuing implementation of the Botical backend server. Phases 1-6 are complete:

- **Phase 1**: Database schema, migrations, server setup
- **Phase 2**: Agent orchestrator, LLM integration, core tools
- **Phase 3**: WebSocket real-time communication
- **Phase 4**: Agent system, sub-agents, permissions
- **Phase 5**: REST API routes for sessions, messages, agents
- **Phase 6**: Project management, file versioning, snapshots

All 777+ tests pass. The codebase uses:
- Bun runtime with native SQLite
- Hono for HTTP/WebSocket server
- Vercel AI SDK for LLM integration
- Zod for validation
- Static service classes with database passed as parameter

## Phase 7 Objective

Implement the remaining two services from the data model: **Custom Tools** and **Todos**.

---

## Task 1: ToolService

Create `src/services/tools.ts` implementing custom tool management.

### Schema (from database)

```sql
CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('code', 'mcp', 'http')),
  code TEXT,                    -- For type='code': JavaScript code
  mcp_server TEXT,              -- For type='mcp': MCP server URL
  mcp_tool TEXT,                -- For type='mcp': Tool name on server
  http_url TEXT,                -- For type='http': Endpoint URL
  http_method TEXT,             -- For type='http': GET/POST/PUT/DELETE
  parameters_schema TEXT,       -- JSON Schema for parameters
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Requirements

1. **CRUD Operations**:
   - `create(db, input)` - Create custom tool with validation
   - `getById(db, toolId)` - Get tool by ID
   - `getByName(db, name)` - Get tool by name
   - `list(db, options)` - List tools with filtering
   - `update(db, toolId, input)` - Update tool
   - `delete(db, toolId)` - Soft delete (set enabled=0)
   - `count(db, options)` - Count tools

2. **Validation**:
   - Tool name must be lowercase with hyphens, starting with letter
   - Name must not conflict with built-in tools
   - Parameters schema must be valid JSON Schema
   - Type-specific fields required (code for 'code', mcp_server for 'mcp', etc.)

3. **Tool Types**:
   - `code`: JavaScript executed in isolated context
   - `mcp`: Model Context Protocol tool from external server
   - `http`: HTTP endpoint call

4. **Built-in Tool Names** (reserved):
   - read, write, edit, bash, glob, grep, task, web_search, web_fetch

### Interface

```typescript
interface Tool {
  id: string;
  name: string;
  description: string;
  type: "code" | "mcp" | "http";
  code: string | null;
  mcpServer: string | null;
  mcpTool: string | null;
  httpUrl: string | null;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | null;
  parametersSchema: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

---

## Task 2: TodoService

Create `src/services/todos.ts` implementing task tracking for agent sessions.

### Schema (from database)

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,        -- Task description: "Fix the bug"
  active_form TEXT NOT NULL,    -- Present tense: "Fixing the bug"
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Requirements

1. **CRUD Operations**:
   - `create(db, sessionId, input)` - Create todo
   - `getById(db, todoId)` - Get todo by ID
   - `listBySession(db, sessionId, options)` - List todos for session
   - `update(db, todoId, input)` - Update todo
   - `delete(db, todoId)` - Hard delete
   - `count(db, sessionId, status?)` - Count todos

2. **Batch Operations**:
   - `replaceBatch(db, sessionId, todos[])` - Replace all todos for session (for TodoWrite tool)
   - `clearCompleted(db, sessionId)` - Remove completed todos

3. **Status Transitions**:
   - pending -> in_progress -> completed
   - Only one todo should be `in_progress` at a time per session

4. **Position Management**:
   - Auto-increment position on create
   - Support reordering via update

### Interface

```typescript
interface Todo {
  id: string;
  sessionId: string;
  content: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed";
  position: number;
  createdAt: number;
  updatedAt: number;
}

interface TodoCreateInput {
  content: string;
  activeForm: string;
  status?: "pending" | "in_progress";
}

interface TodoBatchInput {
  content: string;
  activeForm: string;
  status: "pending" | "in_progress" | "completed";
}
```

---

## Task 3: REST API Routes

### Tools API (`src/server/routes/tools.ts`)

```
GET    /api/tools                    - List tools
POST   /api/tools                    - Create tool
GET    /api/tools/:id                - Get tool by ID
PUT    /api/tools/:id                - Update tool
DELETE /api/tools/:id                - Delete tool
```

Query parameters for list:
- `projectId` (required)
- `type` (optional): code, mcp, http
- `enabled` (optional): true/false
- `limit`, `offset` for pagination

### Todos API (`src/server/routes/todos.ts`)

```
GET    /api/sessions/:sessionId/todos     - List todos for session
POST   /api/sessions/:sessionId/todos     - Create todo
PUT    /api/sessions/:sessionId/todos     - Replace all todos (batch)
GET    /api/todos/:id                      - Get todo by ID
PUT    /api/todos/:id                      - Update todo
DELETE /api/todos/:id                      - Delete todo
```

---

## Task 4: Integration with Orchestrator

### Update TodoWrite Tool

The existing `TodoWrite` tool in `src/tools/todo-write.ts` should use the new TodoService:

```typescript
// Current: stores in-memory
// Update to: use TodoService.replaceBatch(db, sessionId, todos)
```

### Custom Tool Execution

Create `src/tools/custom-tool-executor.ts` for executing custom tools:

1. **Code Tools**: Execute JavaScript in isolated context
2. **HTTP Tools**: Make HTTP request with parameter substitution
3. **MCP Tools**: Forward to MCP server

The orchestrator should check custom tools alongside built-in tools.

---

## Task 5: Tests

### Unit Tests

```
tests/unit/services/
├── tools.test.ts           # 30+ tests
└── todos.test.ts           # 25+ tests

tests/unit/server/routes/
├── tools.test.ts           # 20+ tests
└── todos.test.ts           # 20+ tests
```

### Test Coverage Requirements

For `ToolService`:
- CRUD operations (create, read, update, delete)
- Name validation (reserved names, format)
- Type-specific validation (code has code field, etc.)
- JSON Schema validation for parameters
- Listing with filters

For `TodoService`:
- CRUD operations
- Batch replacement
- Position management
- Status transitions
- Session isolation

### Integration Tests

```
tests/integration/
├── custom-tools.test.ts    # Tool creation and execution flow
└── todo-tracking.test.ts   # Todo lifecycle in session
```

---

## Patterns to Follow

### Service Pattern

```typescript
export class ToolService {
  static create(db: Database, input: ToolCreateInput): Tool {
    const validated = ToolCreateSchema.parse(input);
    // ... implementation
  }

  static getByIdOrThrow(db: Database, toolId: string): Tool {
    const tool = this.getById(db, toolId);
    if (!tool) throw new NotFoundError("Tool", toolId);
    return tool;
  }
}
```

### Route Pattern

```typescript
const tools = new Hono();

tools.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) throw new ValidationError("projectId required");

  const db = DatabaseManager.getProjectDb(projectId);
  const items = ToolService.list(db, { /* options */ });
  const total = ToolService.count(db);

  return c.json({
    data: items,
    meta: { total, limit, offset, hasMore }
  });
});
```

### ID Generation

Use descending IDs for tools and todos (newest first in listings):

```typescript
const id = generateId(IdPrefixes.tool, { descending: true });
```

---

## Validation Criteria

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `bun test` passes all 800+ tests
- [ ] Tools can be created via REST API
- [ ] Todos can be tracked per session
- [ ] TodoWrite tool uses TodoService
- [ ] Custom code tools can be executed
- [ ] No regressions in existing functionality

---

## Files to Create

1. `src/services/tools.ts`
2. `src/services/todos.ts`
3. `src/server/routes/tools.ts`
4. `src/server/routes/todos.ts`
5. `src/tools/custom-tool-executor.ts`
6. `tests/unit/services/tools.test.ts`
7. `tests/unit/services/todos.test.ts`
8. `tests/unit/server/routes/tools.test.ts`
9. `tests/unit/server/routes/todos.test.ts`
10. `tests/integration/custom-tools.test.ts`
11. `tests/integration/todo-tracking.test.ts`

## Files to Update

1. `src/server/routes/index.ts` - Export new routes
2. `src/server/app.ts` - Register new routes
3. `src/tools/todo-write.ts` - Use TodoService
4. `src/services/index.ts` - Export new services
5. `docs/knowledge-base/02-data-model.md` - Update implementation status
6. `docs/knowledge-base/03-api-reference.md` - Add API documentation

---

## Reference Files

Study these for patterns:
- `src/services/files.ts` - Service pattern with versioning
- `src/services/projects.ts` - Full CRUD service
- `src/server/routes/projects.ts` - Route pattern
- `tests/unit/services/files.test.ts` - Test patterns
