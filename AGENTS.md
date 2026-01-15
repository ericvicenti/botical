# Iris - AI Agent Instructions

This file provides essential context for AI agents working on the Iris codebase.

## Quick Start

**What is Iris?** A headless backend server for AI agent workspaces. It provides:
- WebSocket-first API for real-time agent communication
- Per-project SQLite databases for isolation
- Vercel AI SDK integration for LLM interactions
- Multi-user collaboration support

**Tech Stack:** Bun, TypeScript, Hono, SQLite (bun:sqlite), Vercel AI SDK, Zod

## Documentation Index

### Implementation Plan
Detailed implementation specifications:
- [`docs/implementation-plan/00-overview.md`](docs/implementation-plan/00-overview.md) - Architecture overview
- [`docs/implementation-plan/01-database-schema.md`](docs/implementation-plan/01-database-schema.md) - SQLite schemas
- [`docs/implementation-plan/02-server-architecture.md`](docs/implementation-plan/02-server-architecture.md) - Hono server setup
- [`docs/implementation-plan/03-agent-system.md`](docs/implementation-plan/03-agent-system.md) - AI SDK integration
- [`docs/implementation-plan/04-project-workspace.md`](docs/implementation-plan/04-project-workspace.md) - Project management
- [`docs/implementation-plan/05-realtime-communication.md`](docs/implementation-plan/05-realtime-communication.md) - WebSocket protocol
- [`docs/implementation-plan/06-multi-user-collaboration.md`](docs/implementation-plan/06-multi-user-collaboration.md) - Auth & collaboration
- [`docs/implementation-plan/07-file-management.md`](docs/implementation-plan/07-file-management.md) - File operations
- [`docs/implementation-plan/08-implementation-phases.md`](docs/implementation-plan/08-implementation-phases.md) - Phased roadmap with tests
- [`docs/implementation-plan/09-testing-strategy.md`](docs/implementation-plan/09-testing-strategy.md) - Testing framework

### Knowledge Base
Core concepts and definitions:
- [`docs/knowledge-base/00-glossary.md`](docs/knowledge-base/00-glossary.md) - Term definitions
- [`docs/knowledge-base/01-architecture.md`](docs/knowledge-base/01-architecture.md) - System architecture
- [`docs/knowledge-base/02-data-model.md`](docs/knowledge-base/02-data-model.md) - Entity relationships
- [`docs/knowledge-base/03-api-reference.md`](docs/knowledge-base/03-api-reference.md) - API documentation
- [`docs/knowledge-base/04-patterns.md`](docs/knowledge-base/04-patterns.md) - Code patterns
- [`docs/knowledge-base/05-conventions.md`](docs/knowledge-base/05-conventions.md) - Coding conventions

## Key Concepts

### Project Instance Pattern
Projects use async local storage for context isolation:
```typescript
// Always run code within project context
await ProjectInstance.run(projectId, async () => {
  // ProjectInstance.db - project's SQLite database
  // ProjectInstance.project - project metadata
  // State is isolated per-project
});
```

### Event-Driven Architecture
All state changes emit typed events:
```typescript
// Publishing events
EventBus.publish(projectId, {
  type: 'session.created',
  payload: { session },
});

// Events automatically bridge to WebSocket clients
```

### Tool Definition
Tools follow a standard interface:
```typescript
export const myTool = defineTool('my_tool', {
  description: 'What this tool does',
  parameters: z.object({ /* Zod schema */ }),
  async execute(args, ctx) {
    // ctx.projectId, ctx.sessionId, ctx.userId available
    return { title: 'Result', output: 'Output text', metadata: {} };
  },
});
```

### Database Access
Two database types exist:
```typescript
// Root DB: users, projects (global)
const rootDb = DatabaseManager.getRootDb();

// Project DB: sessions, messages, files (per-project)
const projectDb = DatabaseManager.getProjectDb(projectId);
```

## Testing Requirements

**Every change must include tests.** Run before committing:
```bash
bun test              # All tests
bun test:unit         # Unit tests only
bun test:integration  # Integration tests
bun test:coverage     # With coverage report
```

Coverage minimums: 85% overall, 90% for critical paths (auth, permissions, tools).

## Commit Frequently

**Commit early and often.** Don't wait until a large task is complete:
- Commit after each logical change or milestone
- Commit after adding comments or documentation updates
- Commit before starting a risky refactor (so you can revert)
- Small, focused commits are better than large omnibus commits

## Update AGENTS.md with User Instructions

**CRITICAL: When the user gives generic instructions or workflow guidance, ALWAYS update this file.**

This ensures future agents follow the same patterns. Examples of what to capture:
- Workflow preferences (commit frequency, validation steps)
- Code style preferences
- Documentation requirements
- Testing requirements
- Any "always do X" or "never do Y" instructions

**The user's instructions should ALWAYS be remembered by future agents.**

## Human in the Loop

**CRITICAL: After completing ANY task, output validation steps for the user.**

The user must be able to verify your work. Always end your completion with:
1. **What was done** - Brief summary of changes made
2. **How to validate** - Specific commands or steps to verify the work
3. **What to look for** - Expected output or behavior

Example:
```
## What was done
- Added user authentication middleware
- Created login/logout endpoints

## How to validate
curl -X POST http://localhost:3000/auth/login -d '{"email":"test@example.com"}'
bun test tests/unit/auth/

## What to look for
- Login should return a JWT token
- All 15 auth tests should pass
```

## Completion Workflow

**CRITICAL: A task is NOT complete until changes are committed.**

**After completing any implementation task, follow this workflow:**

1. **Run all validations**
   ```bash
   bun run typecheck     # TypeScript validation
   bun run test          # All tests
   ```

2. **Review for issues** - Look for:
   - Type errors or warnings
   - Failing tests
   - Unused imports or variables
   - Console.log statements left in code
   - TODO comments that should be resolved

3. **Refactor and simplify** - Keep the codebase clean:
   - Remove any unused code, files, or dependencies
   - Simplify complex logic where possible
   - Ensure consistent naming and patterns
   - Delete dead code paths
   - Be careful to avoid regressions when refactoring

4. **Update documentation** - Keep docs in sync with code:
   - Update relevant knowledge base files in `docs/knowledge-base/`
   - Update AGENTS.md if new patterns or workflows were introduced
   - Ensure code comments reference the knowledge base (see Code Comments below)

5. **Validate again** - After any cleanup:
   ```bash
   bun run typecheck && bun run test
   ```

6. **ALWAYS Commit changes** - This step is MANDATORY:
   ```bash
   git add -A
   git commit -m "descriptive message"
   ```
   **Never consider a task "done" without committing. Uncommitted work is lost work.**

**Important:** Always run validations after refactoring to catch regressions. Never commit code that fails typecheck or tests.

## Code Comments

**Comments should explain WHY, not WHAT.** The code shows what happens; comments explain the reasoning.

### Comment Guidelines

1. **Reference the knowledge base** - Link to relevant docs:
   ```typescript
   // Session IDs use descending order for newest-first queries.
   // See: docs/knowledge-base/04-patterns.md#id-generation
   const sessionId = generateId('sess', { descending: true });
   ```

2. **Explain non-obvious decisions**:
   ```typescript
   // WAL mode enables concurrent reads during writes, critical for
   // real-time updates. See: docs/knowledge-base/01-architecture.md#database
   db.exec("PRAGMA journal_mode = WAL");
   ```

3. **Document architectural boundaries**:
   ```typescript
   // Root DB stores global data; project DBs are isolated per-project.
   // This separation enables project portability and parallel access.
   // See: docs/knowledge-base/01-architecture.md#multi-database
   ```

4. **When reading code with KB references** - Always go read the referenced documentation to understand the full context before making changes.

### What NOT to comment
- Obvious code (`const count = items.length; // get length`)
- Implementation details that are clear from types
- Temporary notes (use TODO with issue links instead)

## Common Tasks

### Adding a New Tool
1. Create `src/tools/builtin/my-tool.ts`
2. Add to `src/tools/registry.ts`
3. Create `tests/unit/tools/my-tool.test.ts` with 5+ test cases
4. Document in knowledge base if user-facing

### Adding a WebSocket Handler
1. Define message type in `src/websocket/protocol.ts`
2. Add handler in `src/websocket/handlers/`
3. Create `tests/websocket/my-handler.test.ts`
4. Update API reference

### Adding a Database Table
1. Create migration in `src/database/migrations/`
2. Add Zod schema in `src/schemas/`
3. Create service in `src/services/`
4. Update `docs/knowledge-base/02-data-model.md`

## Code Style

- Use Zod for all external data validation
- Prefer async/await over promises
- Use descriptive variable names
- Keep functions small and focused
- Add JSDoc for public APIs

## Type Safety Requirements

**CRITICAL: Aggressive type safety is required for building robust software.**

### Rules
1. **NEVER use `any`** - This is non-negotiable. Use `unknown` with proper validation instead.
2. **NEVER use `@ts-ignore` or `@ts-expect-error`** - Fix the underlying type issue instead.
3. **Use precise types** - Avoid loose types like `object` or `{}`. Be specific.
4. **Use generics appropriately** - When code can work with multiple types, use generics.
5. **Runtime validation** - Validate all external data (API inputs, database results) with Zod.
6. **Type comments** - Add comments alongside complex type definitions explaining why.

### Examples

```typescript
// BAD: Using any
function process(data: any) { ... }

// GOOD: Using unknown with validation
function process(data: unknown) {
  const validated = MySchema.parse(data);
  // Now TypeScript knows the exact type
}

// BAD: Loose generic
function getItem<T>(id: string): T { ... }

// GOOD: Constrained generic with runtime check
function getItem<T extends BaseEntity>(
  id: string,
  schema: z.ZodType<T>
): T {
  const data = db.get(id);
  return schema.parse(data);
}

// BAD: Skipping type check
// @ts-ignore - figure this out later
const result = complexOperation();

// GOOD: Fix the type issue properly
const result: ExpectedType = complexOperation() as ExpectedType;
// With comment explaining why the cast is safe
```

### Type comments
```typescript
// This generic ensures T extends SessionEvent, allowing us to
// narrow the payload type based on the event type discriminator.
type EventHandler<T extends SessionEvent> = (event: T) => void;
```

## Reference Implementation

The OpenCode repository (`research/opencode/`) contains reference patterns:
- `packages/opencode/src/session/` - Session management
- `packages/opencode/src/tool/` - Tool implementation
- `packages/opencode/src/server/server.ts` - Server setup
- `packages/opencode/src/bus/` - Event bus pattern

## Questions?

If unclear about:
- **Architecture decisions**: See `docs/implementation-plan/00-overview.md`
- **Data structures**: See `docs/knowledge-base/02-data-model.md`
- **API format**: See `docs/knowledge-base/03-api-reference.md`
- **Code patterns**: See `docs/knowledge-base/04-patterns.md`
