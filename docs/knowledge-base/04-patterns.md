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

## REST Route Pattern

REST routes use Hono with Zod validation and consistent response formats.

### Route Structure

```typescript
// src/server/routes/sessions.ts
import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { SessionService, SessionCreateSchema } from "@/services/sessions.ts";
import { ValidationError } from "@/utils/errors.ts";

const sessions = new Hono();

// Query validation schema
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// List endpoint with pagination
sessions.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { projectId, status, limit, offset } = result.data;
  const db = DatabaseManager.getProjectDb(projectId);

  const items = SessionService.list(db, { status, limit, offset });
  const total = SessionService.count(db, status);

  return c.json({
    data: items,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  });
});

// Create endpoint
sessions.post("/", async (c) => {
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const result = SessionCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0]?.message || "Invalid input");
  }

  const session = SessionService.create(db, result.data);
  return c.json({ data: session }, 201);
});

// Get by ID endpoint
sessions.get("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const session = SessionService.getByIdOrThrow(db, sessionId);
  return c.json({ data: session });
});

export { sessions };
```

### Route Registration

```typescript
// src/server/routes/index.ts
export { sessions } from "./sessions.ts";
export { messages } from "./messages.ts";
export { agents } from "./agents.ts";

// src/server/app.ts
import { sessions, messages, agents } from "./routes/index.ts";

app.route("/api/sessions", sessions);
app.route("/api/messages", messages);
app.route("/api/agents", agents);
```

---

## Service Pattern

Services encapsulate business logic and database operations for a domain.
Services are static classes that receive the database connection as a parameter.

### Service Structure

```typescript
// src/services/sessions.ts
import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

// Input validation schemas
export const SessionCreateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  agent: z.string().default("default"),
  parentId: z.string().nullable().optional(),
});

export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;

// Entity interface (camelCase properties)
export interface Session {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  status: SessionStatus;
  agent: string;
  createdAt: number;
  updatedAt: number;
}

// Database row interface (snake_case columns)
interface SessionRow {
  id: string;
  slug: string;
  parent_id: string | null;
  title: string;
  status: string;
  agent: string;
  created_at: number;
  updated_at: number;
}

// Row converter function
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    slug: row.slug,
    parentId: row.parent_id,
    title: row.title,
    status: row.status as SessionStatus,
    agent: row.agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SessionService {
  // Create with validation
  static create(db: Database, input: SessionCreateInput): Session {
    const validated = SessionCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.session, { descending: true });
    const title = validated.title || "New Session";

    db.prepare(`
      INSERT INTO sessions (id, title, agent, parent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, validated.agent, validated.parentId ?? null, "active", now, now);

    return {
      id,
      slug: generateSlug(title),
      parentId: validated.parentId ?? null,
      title,
      status: "active",
      agent: validated.agent,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Get by ID (returns null if not found)
  static getById(db: Database, sessionId: string): Session | null {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as SessionRow | undefined;

    if (!row) return null;
    return rowToSession(row);
  }

  // Get by ID or throw NotFoundError
  static getByIdOrThrow(db: Database, sessionId: string): Session {
    const session = this.getById(db, sessionId);
    if (!session) {
      throw new NotFoundError("Session", sessionId);
    }
    return session;
  }

  // List with dynamic filtering
  static list(
    db: Database,
    options: {
      status?: SessionStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Session[] {
    let query = "SELECT * FROM sessions WHERE 1=1";
    const params: (string | number | null)[] = [];

    if (options.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    query += " ORDER BY id ASC";  // Descending IDs sort newest first

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  // Count for pagination
  static count(db: Database, status?: SessionStatus): number {
    let query = "SELECT COUNT(*) as count FROM sessions";
    const params: string[] = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }
}
```

### Key Service Patterns

1. **Static methods** - Services are namespaces, not instantiated
2. **Database as parameter** - Enables per-project isolation
3. **Zod validation** - Type-safe input validation
4. **Row converters** - Map snake_case DB columns to camelCase entities
5. **OrThrow variants** - Throw NotFoundError for missing resources
6. **Dynamic query building** - Flexible filtering with prepared statements

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

## File Versioning Pattern

Files are versioned using a patch-based approach that stores diffs rather than full copies, optimizing storage while maintaining complete history.

### Storage Strategy

```typescript
// Version 1: Store full content
if (version === 1) {
  db.prepare(`
    INSERT INTO file_content (id, version_id, content)
    VALUES (?, ?, ?)
  `).run(contentId, versionId, fullContent);
}

// Subsequent versions: Store forward patch from previous version
else {
  const previousContent = getVersionContent(db, fileId, version - 1);
  const patch = createPatch(previousContent, newContent);

  db.prepare(`
    UPDATE file_versions SET patch = ? WHERE id = ?
  `).run(serializePatch(patch), versionId);
}
```

### Content Reconstruction

```typescript
function getVersionContent(db: Database, fileId: string, targetVersion: number): string {
  // Get all versions up to target
  const versions = db.prepare(`
    SELECT v.version, v.patch, c.content
    FROM file_versions v
    LEFT JOIN file_content c ON c.version_id = v.id
    WHERE v.file_id = ? AND v.version <= ?
    ORDER BY v.version ASC
  `).all(fileId, targetVersion);

  // Start with version 1's full content
  let content = versions[0].content;

  // Apply patches to reach target version
  for (let i = 1; i < versions.length; i++) {
    if (versions[i].patch) {
      const patch = deserializePatch(versions[i].patch);
      content = applyPatch(content, patch);
    }
  }

  return content;
}
```

### Diff Algorithm

Uses Longest Common Subsequence (LCS) for accurate line-based diffs:

```typescript
interface PatchOperation {
  type: "keep" | "delete" | "insert";
  lines: string[];
  position?: number;
}

function createPatch(oldContent: string, newContent: string): PatchOperation[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const lcs = computeLCS(oldLines, newLines);

  // Generate operations from LCS
  return generateOperations(oldLines, newLines, lcs);
}
```

### Benefits

- **Storage efficiency**: Only first version stores full content
- **Complete history**: Any version can be reconstructed
- **Accurate diffs**: LCS algorithm handles complex changes
- **Skip unchanged**: Identical writes don't create new versions

---

## Snapshot Pattern

Snapshots capture point-in-time project state for rollback capabilities.

### Creating Snapshots

```typescript
function createSnapshot(db: Database): Snapshot {
  const files = db.prepare(`
    SELECT id, path, hash FROM files WHERE deleted_at IS NULL
  `).all();

  // Generate Merkle-style hash for integrity
  const hashes = files.map(f => `${f.path}:${f.hash}`).sort();
  const combinedHash = createHash("sha256")
    .update(hashes.join("\n"))
    .digest("hex");

  const snapshotId = generateId(IdPrefixes.snapshot);

  // Store snapshot metadata
  db.prepare(`
    INSERT INTO snapshots (id, hash, file_count, created_at)
    VALUES (?, ?, ?, ?)
  `).run(snapshotId, combinedHash, files.length, Date.now());

  // Store file references with their current versions
  for (const file of files) {
    const latestVersion = getLatestVersion(db, file.id);
    db.prepare(`
      INSERT INTO snapshot_files (snapshot_id, file_id, version)
      VALUES (?, ?, ?)
    `).run(snapshotId, file.id, latestVersion);
  }

  return { id: snapshotId, hash: combinedHash, fileCount: files.length };
}
```

### Restoring Snapshots

```typescript
function restoreSnapshot(db: Database, snapshotId: string): RestoreResult {
  const snapshotFiles = getSnapshotFiles(db, snapshotId);
  const currentFiles = getCurrentFiles(db);

  // Restore modified files to snapshot version
  for (const sf of snapshotFiles) {
    const content = getVersionContent(db, sf.fileId, sf.version);
    FileService.write(db, sf.path, content);
  }

  // Delete files that didn't exist in snapshot
  const snapshotPaths = new Set(snapshotFiles.map(f => f.path));
  for (const current of currentFiles) {
    if (!snapshotPaths.has(current.path)) {
      FileService.delete(db, current.path);
    }
  }

  return { restoredCount, deletedCount };
}
```

---

## Related Documents

- [Architecture](./01-architecture.md) - System design
- [Conventions](./05-conventions.md) - Coding standards
- [Agent System](../implementation-plan/03-agent-system.md) - Detailed specs
