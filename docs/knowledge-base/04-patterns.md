# Code Patterns

This document describes the common patterns used throughout the Iris codebase.

---

## Project Instance Pattern

The Project Instance pattern provides isolated context for each project using async local storage. This ensures project-scoped state is always accessible without passing it through every function.

### Usage

```typescript
// Run code within project context
await ProjectInstance.run(projectId, async () => {
  // Inside this block:
  // - ProjectInstance.projectId is available
  // - ProjectInstance.project is available
  // - ProjectInstance.db is available

  const sessions = await SessionService.list();
  // ^ automatically uses the current project's database
});
```

### Implementation

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface ProjectContext {
  projectId: string;
  project: Project;
  db: Database;
}

const storage = new AsyncLocalStorage<ProjectContext>();

export const ProjectInstance = {
  async run<T>(projectId: string, fn: () => T | Promise<T>): Promise<T> {
    const context = await this.getOrCreateContext(projectId);
    return storage.run(context, fn);
  },

  get projectId(): string {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('Not in project context');
    return ctx.projectId;
  },

  get db(): Database {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('Not in project context');
    return ctx.db;
  },
};
```

### Benefits
- No explicit `projectId` parameter needed in service methods
- Automatic resource cleanup on context disposal
- Thread-safe isolation between concurrent requests

---

## Event Bus Pattern

The Event Bus provides decoupled communication between components. Services publish events when state changes, and any component can subscribe to receive them.

### Publishing Events

```typescript
// In a service
EventBus.publish(projectId, {
  type: 'session.created',
  payload: { session },
});

// Global events (cross-project)
EventBus.publishGlobal({
  type: 'project.created',
  payload: { project },
});
```

### Subscribing to Events

```typescript
// Subscribe to specific event type
EventBus.subscribe('session.created', (event) => {
  console.log('Session created:', event.payload.session);
});

// Subscribe with pattern matching
EventBus.subscribe('message.*', (event) => {
  // Matches message.created, message.text.delta, etc.
});

// Project-scoped subscription
EventBus.subscribeProject(projectId, 'file.*', (event) => {
  // Only receives events for specific project
});
```

### WebSocket Bridge

Events automatically bridge to WebSocket clients:

```typescript
// In bus-bridge.ts
EventBus.subscribe('message.*', (event) => {
  const { projectId, sessionId } = event.metadata;

  // Broadcast to all clients subscribed to this session
  RoomManager.broadcast(`session:${sessionId}`, {
    type: event.type,
    payload: event.payload,
  });
});
```

---

## Tool Definition Pattern

Tools are defined using a standard interface that integrates with the Vercel AI SDK.

### Basic Tool

```typescript
import { defineTool } from '../types';
import { z } from 'zod';

export const myTool = defineTool('my_tool', {
  description: 'What this tool does',

  parameters: z.object({
    path: z.string().describe('The file path'),
    content: z.string().describe('Content to write'),
  }),

  async execute(args, ctx) {
    // ctx provides:
    // - ctx.projectId
    // - ctx.sessionId
    // - ctx.messageId
    // - ctx.userId
    // - ctx.abort (AbortSignal)
    // - ctx.metadata() - update tool display
    // - ctx.askPermission() - request user approval

    return {
      title: 'Result Title',
      output: 'Output text shown to user',
      metadata: { /* structured data */ },
    };
  },
});
```

### Tool with Permission Check

```typescript
export const writeTool = defineTool('write', {
  description: 'Write content to a file',

  parameters: z.object({
    path: z.string(),
    content: z.string(),
  }),

  async execute({ path, content }, ctx) {
    // Request permission before destructive action
    await ctx.askPermission({
      tool: 'write',
      action: path,
      message: `Write to ${path}`,
    });

    // Permission granted, proceed
    await FileService.write(ctx.projectId, path, content);

    return {
      title: `Wrote ${path}`,
      output: `Successfully wrote ${content.length} characters`,
    };
  },
});
```

### Tool with Progress Updates

```typescript
export const longTaskTool = defineTool('long_task', {
  description: 'A task that takes time',

  parameters: z.object({
    items: z.array(z.string()),
  }),

  async execute({ items }, ctx) {
    for (let i = 0; i < items.length; i++) {
      // Update UI with progress
      ctx.metadata({
        title: `Processing ${i + 1}/${items.length}`,
        data: { progress: (i + 1) / items.length },
      });

      await processItem(items[i]);
    }

    return {
      title: 'Processing complete',
      output: `Processed ${items.length} items`,
    };
  },
});
```

---

## Service Pattern

Services encapsulate business logic and database operations for a domain.

### Service Structure

```typescript
// src/services/sessions.ts
import { z } from 'zod';
import { ProjectInstance } from '../project/instance';
import { EventBus } from '../bus';

// Input schemas
const SessionCreate = z.object({
  title: z.string().optional(),
  agent: z.string().default('default'),
  parentId: z.string().optional(),
});

// Output schemas
const SessionInfo = z.object({
  id: z.string(),
  title: z.string(),
  agent: z.string(),
  status: z.enum(['active', 'archived', 'deleted']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export class SessionService {
  // Create with validation and events
  static async create(input: z.infer<typeof SessionCreate>): Promise<Session> {
    const validated = SessionCreate.parse(input);
    const db = ProjectInstance.db;

    const session = {
      id: generateSessionId(),
      ...validated,
      title: validated.title || await this.generateTitle(),
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    db.prepare(`
      INSERT INTO sessions (id, title, agent, parent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.title,
      session.agent,
      session.parentId,
      session.status,
      session.createdAt,
      session.updatedAt
    );

    // Emit event
    EventBus.publish(ProjectInstance.projectId, {
      type: 'session.created',
      payload: { session },
    });

    return session;
  }

  // Read with validation
  static async get(sessionId: string): Promise<Session | null> {
    const db = ProjectInstance.db;
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    if (!row) return null;
    return SessionInfo.parse(this.rowToSession(row));
  }

  // List with filtering
  static async list(options: { status?: string; limit?: number } = {}): Promise<Session[]> {
    const db = ProjectInstance.db;
    let query = 'SELECT * FROM sessions WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY id DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return db.prepare(query).all(...params).map(this.rowToSession);
  }
}
```

---

## Stream Processing Pattern

Handle streaming LLM responses with proper event emission.

### Stream Processor

```typescript
export class StreamProcessor {
  private currentTextPart: MessagePart | null = null;

  async process(stream: AsyncIterable<StreamEvent>): Promise<ProcessResult> {
    for await (const event of stream) {
      await this.handleEvent(event);
    }
    return this.finalize();
  }

  private async handleEvent(event: StreamEvent) {
    switch (event.type) {
      case 'text-delta':
        await this.handleTextDelta(event.text);
        break;

      case 'tool-call':
        await this.handleToolCall(event);
        break;

      case 'tool-result':
        await this.handleToolResult(event);
        break;

      case 'finish':
        await this.handleFinish(event);
        break;
    }
  }

  private async handleTextDelta(text: string) {
    // Ensure text part exists
    if (!this.currentTextPart) {
      this.currentTextPart = await this.createTextPart();
    }

    // Append to database
    await MessageService.appendText(this.currentTextPart.id, text);

    // Emit event for clients
    EventBus.publish(this.projectId, {
      type: 'message.text.delta',
      payload: {
        sessionId: this.sessionId,
        messageId: this.messageId,
        partId: this.currentTextPart.id,
        delta: text,
      },
    });
  }
}
```

---

## Permission Evaluation Pattern

Evaluate tool permissions using rule-based matching.

### Permission Rules

```typescript
interface PermissionRule {
  tool: string;      // Tool name or '*' for all
  pattern: string;   // Pattern to match against action
  action: 'allow' | 'deny' | 'ask';
}

// Example rules
const rules: PermissionRule[] = [
  { tool: '*', pattern: '*', action: 'allow' },        // Allow all by default
  { tool: 'bash', pattern: 'rm -rf*', action: 'deny' }, // Block dangerous commands
  { tool: 'write', pattern: '*.env', action: 'ask' },   // Ask for sensitive files
];
```

### Evaluation Logic

```typescript
export function evaluatePermission(
  rules: PermissionRule[],
  tool: string,
  action: string
): 'allow' | 'deny' | 'ask' {
  // Sort rules by specificity (more specific first)
  const sorted = [...rules].sort((a, b) => {
    const aSpecific = (a.tool !== '*' ? 2 : 0) + (a.pattern !== '*' ? 1 : 0);
    const bSpecific = (b.tool !== '*' ? 2 : 0) + (b.pattern !== '*' ? 1 : 0);
    return bSpecific - aSpecific;
  });

  // Find first matching rule
  for (const rule of sorted) {
    if (matchesRule(rule, tool, action)) {
      return rule.action;
    }
  }

  // Default deny
  return 'deny';
}

function matchesRule(rule: PermissionRule, tool: string, action: string): boolean {
  // Check tool name
  if (rule.tool !== '*' && rule.tool !== tool) {
    return false;
  }

  // Check action pattern (supports glob-like matching)
  return matchPattern(rule.pattern, action);
}
```

---

## Database Query Pattern

Type-safe database queries with Zod validation.

### Query Builder

```typescript
// Define row schema
const SessionRow = z.object({
  id: z.string(),
  title: z.string(),
  agent: z.string(),
  status: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
});

// Query with validation
function getSession(db: Database, id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

  if (!row) return null;

  // Validate and transform
  const validated = SessionRow.parse(row);
  return {
    id: validated.id,
    title: validated.title,
    agent: validated.agent,
    status: validated.status as SessionStatus,
    createdAt: validated.created_at,
    updatedAt: validated.updated_at,
  };
}
```

### Prepared Statements

```typescript
// Cache prepared statements per database
const stmtCache = new WeakMap<Database, Map<string, Statement>>();

function getStatement(db: Database, sql: string): Statement {
  let cache = stmtCache.get(db);
  if (!cache) {
    cache = new Map();
    stmtCache.set(db, cache);
  }

  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    cache.set(sql, stmt);
  }

  return stmt;
}
```

---

## ID Generation Patterns

### Descending IDs (Newest First)

For entities commonly listed in reverse chronological order:

```typescript
function generateDescendingId(prefix: string): string {
  const timestamp = Number.MAX_SAFE_INTEGER - Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${prefix}_${timestamp.toString(36)}-${random}`;
}

// Usage
const sessionId = generateDescendingId('sess');
// Result: "sess_2r1hf9qj3-a1b2c3d4"
```

### Ascending IDs (Chronological)

For entities listed in creation order:

```typescript
function generateAscendingId(prefix: string): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${prefix}_${timestamp.toString(36)}-${random}`;
}

// Usage
const messageId = generateAscendingId('msg');
// Result: "msg_m1ab2c3d-e5f6g7h8"
```

---

## Error Handling Pattern

Use typed errors for consistent error handling.

### Error Classes

```typescript
export class IrisError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'IrisError';
  }
}

export class NotFoundError extends IrisError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ForbiddenError extends IrisError {
  constructor(message: string) {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ValidationError extends IrisError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}
```

### Error Handler Middleware

```typescript
export function errorHandler(): MiddlewareHandler {
  return async (c, next) => {
    try {
      await next();
    } catch (error) {
      if (error instanceof IrisError) {
        return c.json({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          }
        }, error.statusCode);
      }

      console.error('Unhandled error:', error);
      return c.json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        }
      }, 500);
    }
  };
}
```

---

## Related Documents

- [Architecture](./01-architecture.md) - System design
- [Conventions](./05-conventions.md) - Coding standards
- [Agent System](../implementation-plan/03-agent-system.md) - Detailed specs
