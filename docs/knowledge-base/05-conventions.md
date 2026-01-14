# Coding Conventions

This document defines the coding standards and conventions for the Iris codebase.

---

## TypeScript

### Strict Mode

Always use strict TypeScript settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### No `any` Types

Never use `any`. Use `unknown` with proper validation:

```typescript
// Bad
function process(data: any) {
  return data.value;
}

// Good
function process(data: unknown): string {
  const parsed = DataSchema.parse(data);
  return parsed.value;
}
```

### Type Inference

Let TypeScript infer types when obvious:

```typescript
// Bad - redundant type annotation
const name: string = 'hello';
const items: string[] = ['a', 'b', 'c'];

// Good - inferred
const name = 'hello';
const items = ['a', 'b', 'c'];

// Good - explicit when complex or exported
export function getUser(id: string): Promise<User | null> {
  // ...
}
```

---

## Zod Schemas

### External Data Validation

Always validate external data with Zod:

```typescript
// API input
const CreateSessionInput = z.object({
  title: z.string().min(1).max(200).optional(),
  agent: z.string().default('default'),
});

// Database row
const SessionRow = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.number(),
});

// Usage
const input = CreateSessionInput.parse(requestBody);
const session = SessionRow.parse(dbRow);
```

### Schema Naming

- Input schemas: `{Entity}Create`, `{Entity}Update`
- Output schemas: `{Entity}Info`, `{Entity}Row`
- Full schemas: `{Entity}Schema`

```typescript
const SessionCreate = z.object({ ... });
const SessionUpdate = z.object({ ... });
const SessionInfo = z.object({ ... });
```

### Describe Parameters

Add descriptions for LLM tool parameters:

```typescript
const parameters = z.object({
  path: z.string().describe('Path to the file to read'),
  offset: z.number().optional().describe('Line number to start from (1-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read'),
});
```

---

## Async/Await

### Prefer Async/Await

Always use async/await over raw promises:

```typescript
// Bad
function getData() {
  return fetch('/api/data')
    .then(res => res.json())
    .then(data => process(data));
}

// Good
async function getData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  return process(data);
}
```

### Parallel Operations

Use `Promise.all` for independent operations:

```typescript
// Bad - sequential
const user = await getUser(id);
const projects = await getProjects(id);
const settings = await getSettings(id);

// Good - parallel
const [user, projects, settings] = await Promise.all([
  getUser(id),
  getProjects(id),
  getSettings(id),
]);
```

### Error Handling

Use try/catch at appropriate boundaries:

```typescript
// Service method - let errors propagate
async function createSession(input: SessionCreate): Promise<Session> {
  const validated = SessionCreate.parse(input); // May throw
  return db.insert(validated); // May throw
}

// Handler - catch and respond
async function handleCreateSession(c: Context) {
  try {
    const session = await createSession(c.req.body);
    return c.json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input' }, 400);
    }
    throw error; // Let middleware handle
  }
}
```

---

## Naming Conventions

### Files

- `kebab-case.ts` for all files
- `{entity}.ts` for main module
- `{entity}.test.ts` for tests
- `{entity}/index.ts` for directories with multiple files

```
src/
  services/
    sessions.ts
    messages.ts
  tools/
    builtin/
      read.ts
      write.ts
      bash.ts
      index.ts
```

### Variables and Functions

- `camelCase` for variables and functions
- Descriptive names that explain purpose

```typescript
// Bad
const d = new Date();
function p(x) { ... }

// Good
const createdAt = new Date();
function parseMessageContent(raw: string) { ... }
```

### Classes and Types

- `PascalCase` for classes, interfaces, types, and enums
- Suffix interfaces with purpose when needed

```typescript
class SessionService { ... }
interface ToolContext { ... }
type SessionStatus = 'active' | 'archived' | 'deleted';
enum MessageRole { User, Assistant, System }
```

### Constants

- `SCREAMING_SNAKE_CASE` for true constants
- `camelCase` for configuration objects

```typescript
const MAX_MESSAGE_LENGTH = 100000;
const DEFAULT_TIMEOUT_MS = 120000;

const defaultSettings = {
  temperature: 0.7,
  maxTokens: 4096,
};
```

---

## Functions

### Keep Functions Small

Each function should do one thing well:

```typescript
// Bad - too much in one function
async function handleMessage(sessionId: string, content: string) {
  const session = await db.get(sessionId);
  if (!session) throw new Error('Not found');
  const message = await db.insert({ sessionId, content });
  await eventBus.publish('message.created', message);
  const agent = await getAgent(session.agent);
  const response = await llm.generate(agent, content);
  await db.insert({ sessionId, content: response });
  await eventBus.publish('message.created', response);
  return response;
}

// Good - separated concerns
async function createUserMessage(sessionId: string, content: string) {
  const message = await MessageService.create({ sessionId, role: 'user', content });
  return message;
}

async function generateResponse(sessionId: string, userMessageId: string) {
  const orchestrator = new AgentOrchestrator(projectId);
  return orchestrator.prompt({ sessionId, messageId: userMessageId });
}
```

### Pure Functions When Possible

Prefer pure functions without side effects:

```typescript
// Pure - same input always gives same output
function formatMessagePart(part: MessagePart): string {
  switch (part.type) {
    case 'text': return part.content.text;
    case 'tool': return `[Tool: ${part.toolName}]`;
    default: return '';
  }
}

// Impure - has side effects (database)
async function saveMessage(message: Message): Promise<void> {
  await db.insert(message);
  await eventBus.publish('message.created', message);
}
```

---

## Comments and Documentation

### When to Comment

- Complex algorithms
- Non-obvious business logic
- Workarounds and TODOs
- Public API documentation

```typescript
/**
 * Generates a descending ID for natural newest-first ordering.
 * Uses MAX_SAFE_INTEGER minus timestamp so larger IDs are older.
 */
function generateDescendingId(): string {
  const timestamp = Number.MAX_SAFE_INTEGER - Date.now();
  return `${timestamp.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

// WORKAROUND: AI SDK sometimes lowercases tool names
// Remove when https://github.com/vercel/ai/issues/XXX is fixed
const normalizedName = toolName.toLowerCase();
```

### JSDoc for Public APIs

```typescript
/**
 * Creates a new session in the current project.
 *
 * @param input - Session creation options
 * @param input.title - Optional session title (auto-generated if omitted)
 * @param input.agent - Agent ID to use (defaults to 'default')
 * @returns The created session
 * @throws {ValidationError} If input is invalid
 */
export async function createSession(input: SessionCreate): Promise<Session> {
  // ...
}
```

---

## Error Messages

### Be Specific and Actionable

```typescript
// Bad
throw new Error('Invalid input');
throw new Error('Not found');

// Good
throw new ValidationError(`Session title must be between 1 and 200 characters, got ${title.length}`);
throw new NotFoundError('Session', sessionId);
throw new ForbiddenError(`User ${userId} does not have permission to delete sessions in project ${projectId}`);
```

---

## Database

### Use Prepared Statements

Always use parameterized queries:

```typescript
// Bad - SQL injection risk
db.exec(`SELECT * FROM users WHERE email = '${email}'`);

// Good - parameterized
db.prepare('SELECT * FROM users WHERE email = ?').get(email);
```

### Transaction Safety

Wrap related operations in transactions:

```typescript
const deleteSession = db.transaction((sessionId: string) => {
  db.prepare('DELETE FROM message_parts WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
});

deleteSession(sessionId);
```

### Column Naming

- `snake_case` for database columns
- Transform to `camelCase` in TypeScript

```typescript
// Database
// created_at, updated_at, session_id

// TypeScript
interface Session {
  createdAt: number;
  updatedAt: number;
  sessionId: string;
}
```

---

## Imports

### Order

1. Node.js built-ins
2. External packages
3. Internal absolute imports
4. Internal relative imports

```typescript
// Node.js built-ins
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

// External packages
import { z } from 'zod';
import { Hono } from 'hono';

// Internal absolute
import { DatabaseManager } from '../database';
import { EventBus } from '../bus';

// Internal relative
import { SessionService } from './sessions';
import type { Session } from './types';
```

### Type-Only Imports

Use `import type` for types:

```typescript
import type { Session, Message } from './types';
import { SessionService } from './services';
```

---

## Testing

### Test File Location

Place tests next to source files:

```
src/
  services/
    sessions.ts
    sessions.test.ts
```

Or in a parallel `tests/` directory:

```
src/services/sessions.ts
tests/unit/services/sessions.test.ts
```

### Test Naming

```typescript
describe('SessionService', () => {
  describe('create', () => {
    it('creates a session with default title', async () => {
      // ...
    });

    it('throws ValidationError for empty agent', async () => {
      // ...
    });
  });
});
```

### Arrange-Act-Assert

```typescript
it('creates a session with custom title', async () => {
  // Arrange
  const input = { title: 'My Session', agent: 'default' };

  // Act
  const session = await SessionService.create(input);

  // Assert
  expect(session.title).toBe('My Session');
  expect(session.agent).toBe('default');
  expect(session.status).toBe('active');
});
```

---

## Related Documents

- [Patterns](./04-patterns.md) - Code patterns
- [Testing Strategy](../implementation-plan/09-testing-strategy.md) - Testing details
- [Architecture](./01-architecture.md) - System design
