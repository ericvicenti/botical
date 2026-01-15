# Data Model

This document describes the entities in Iris, their relationships, and the Zod schemas used to validate them.

---

## Entity Relationship Diagram

```
ROOT DATABASE
═════════════════════════════════════════════════════════════════

┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│   users     │──────<│ project_members  │>──────│  projects   │
│             │       │                  │       │             │
│ id          │       │ project_id       │       │ id          │
│ email       │       │ user_id          │       │ name        │
│ username    │       │ role             │       │ owner_id ───┼───┐
│ is_admin    │       │ permissions      │       │ type        │   │
│ can_execute │       │ joined_at        │       │ path        │   │
│   _code     │       └──────────────────┘       │ settings    │   │
│ preferences │                                  └─────────────┘   │
└─────┬───────┘                                                    │
      │                                                            │
      │ 1:N                                               owns 1:N │
      ├────────────────────────────┐                               │
      │                            │                               │
      ▼                            ▼                               │
┌─────────────┐       ┌──────────────────┐                        │
│  api_keys   │       │provider_creds    │<───────────────────────┘
│             │       │                  │
│ id          │       │ id               │
│ user_id     │       │ user_id          │
│ key_hash    │       │ provider         │
│ project_id? │       │ api_key_encrypted│
│ permissions │       └──────────────────┘
└─────────────┘

┌──────────────────┐       ┌──────────────────┐
│email_verification│       │  auth_sessions   │
│     _tokens      │       │                  │
│                  │       │ id               │
│ id               │       │ user_id          │
│ email            │       │ token_hash       │
│ token_hash       │       │ expires_at       │
│ user_id?         │       │ last_activity_at │
│ expires_at       │       │ revoked_at       │
│ used_at          │       └──────────────────┘
└──────────────────┘


PROJECT DATABASE (one per project)
═════════════════════════════════════════════════════════════════

┌─────────────┐                    ┌─────────────┐
│  sessions   │───────────────────<│  messages   │
│             │      1:N           │             │
│ id          │                    │ id          │
│ slug        │                    │ session_id  │
│ parent_id ──┼──┐                 │ role        │
│ title       │  │                 │ parent_id ──┼──┐
│ agent       │  │ self-reference  │ agent       │  │ self-reference
│ status      │  │ (sub-agents)    │ finish_     │  │ (reply chain)
└─────────────┘  │                 │   reason    │  │
      ▲          │                 └─────────────┘  │
      └──────────┘                       │ 1:N      │
                                         │          └───────────────┐
                                         ▼                          │
                                  ┌─────────────┐                   │
                                  │message_parts│                   │
                                  │             │                   │
                                  │ id          │                   │
                                  │ message_id  │                   │
                                  │ type        │                   │
                                  │ content     │                   │
                                  │ tool_name   │                   │
                                  │ tool_status │                   │
                                  └─────────────┘                   │
                                                                    │
┌─────────────┐       ┌─────────────┐       ┌─────────────┐        │
│   agents    │       │    tools    │       │    todos    │<───────┘
│             │       │             │       │             │ via session
│ id          │       │ id          │       │ id          │
│ name        │       │ name        │       │ session_id  │
│ prompt      │       │ type        │       │ content     │
│ permissions │       │ code        │       │ status      │
│ model_id    │       │ params_     │       │ position    │
└─────────────┘       │   schema    │       └─────────────┘
                      └─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    files    │──────<│file_versions│       │ snapshots   │
│             │ 1:N   │             │       │             │
│ id          │       │ id          │       │ id          │
│ path        │       │ file_id     │       │ session_id  │
│ type        │       │ version     │       │ message_id  │
│ hash        │       │ patch       │       │ hash        │
│ size        │       │ session_id  │       │ file_count  │
└─────────────┘       │ message_id  │       └─────────────┘
                      └─────────────┘

┌─────────────┐
│ permissions │
│             │
│ id          │
│ session_id  │
│ permission  │
│ pattern     │
│ action      │
└─────────────┘
```

---

## Core Entities

### User

Represents an authenticated user of the system.

**Schema:**
```typescript
const User = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable(),
  isAdmin: z.boolean().default(false),
  canExecuteCode: z.boolean().default(false),
  preferences: z.record(z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastLoginAt: z.number().nullable(),
});
```

**Trust Levels:**
| Level | isAdmin | canExecuteCode | Capabilities |
|-------|---------|----------------|--------------|
| Admin | true | true | Full access, code execution, manage users |
| Trusted | false | true | Code execution, full project access |
| Regular | false | false | Read/write projects, no code execution |

The **first registered user** automatically becomes an admin.

**Relationships:**
- Owns many Projects (1:N)
- Member of many Projects via ProjectMember (N:M)
- Has many ApiKeys (1:N)
- Has many ProviderCredentials (1:N)
- Has many AuthSessions (1:N)
- Has many EmailVerificationTokens (1:N)

---

### Email Verification Token

Used for magic link authentication.

**Schema:**
```typescript
const EmailVerificationToken = z.object({
  id: z.string(),
  email: z.string().email(),
  tokenHash: z.string(),
  tokenType: z.enum(['magic_link', 'email_change']).default('magic_link'),
  userId: z.string().nullable(),  // null for new user registration
  createdAt: z.number(),
  expiresAt: z.number(),
  usedAt: z.number().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});
```

**Behavior:**
- Tokens expire after 15 minutes
- Token hash is SHA-256 of the raw token
- Once used, `usedAt` is set to prevent reuse

---

### Auth Session

Database-backed authentication session for immediate revocation.

**Schema:**
```typescript
const AuthSession = z.object({
  id: z.string(),
  userId: z.string(),
  tokenHash: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  lastActivityAt: z.number(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  revokedAt: z.number().nullable(),
});
```

**Behavior:**
- Sessions expire after 7 days
- `lastActivityAt` updated on each validated request
- Can be immediately revoked by setting `revokedAt`

---

### Project

The top-level organizational unit containing sessions, files, and configurations.

**Schema:**
```typescript
const Project = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  ownerId: z.string().uuid(),
  type: z.enum(['local', 'git', 'remote']),
  path: z.string().nullable(),
  gitRemote: z.string().url().nullable(),
  iconUrl: z.string().url().nullable(),
  color: z.string().nullable(),
  settings: z.record(z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  archivedAt: z.number().nullable(),
});
```

**Project Types:**
- `local`: Tied to a local filesystem directory
- `git`: Associated with a git repository
- `remote`: Files stored only in database (no filesystem)

**Relationships:**
- Belongs to one User (owner)
- Has many ProjectMembers (1:N)
- Contains its own database with all project-scoped entities

---

### Project Member

Associates users with projects and defines their access level.

**Schema:**
```typescript
const ProjectMember = z.object({
  projectId: z.string(),
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  permissions: z.array(Permission).nullable(),
  joinedAt: z.number(),
  invitedBy: z.string().uuid().nullable(),
});
```

**Roles:**
| Role | Capabilities |
|------|--------------|
| owner | Full control, delete project |
| admin | Manage members, settings |
| member | Create sessions, write files |
| viewer | Read-only access |

---

### Session

A conversation thread with an agent.

**Schema:**
```typescript
const Session = z.object({
  id: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  status: z.enum(['active', 'archived', 'deleted']),
  agent: z.string().default('default'),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  messageCount: z.number().default(0),
  totalCost: z.number().default(0),
  totalTokensInput: z.number().default(0),
  totalTokensOutput: z.number().default(0),
  shareUrl: z.string().nullable(),
  shareSecret: z.string().nullable(),
  permissions: z.array(Permission).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  archivedAt: z.number().nullable(),
});
```

**Relationships:**
- May have parent Session (self-reference for sub-agents)
- Has many Messages (1:N)
- Has many Todos (1:N)
- Has many Permissions (1:N)

---

### Message

A single exchange in a session.

**Schema:**
```typescript
const Message = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parentId: z.string().nullable(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  agent: z.string().nullable(),
  finishReason: z.enum(['stop', 'tool-calls', 'length', 'error']).nullable(),
  cost: z.number().default(0),
  tokensInput: z.number().default(0),
  tokensOutput: z.number().default(0),
  tokensReasoning: z.number().default(0),
  tokensCacheRead: z.number().default(0),
  tokensCacheWrite: z.number().default(0),
  errorType: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
});
```

**Relationships:**
- Belongs to one Session
- May have parent Message (reply chain)
- Has many MessageParts (1:N)

---

### Message Part

A component of a message (text, tool call, file, etc.).

**Schema:**
```typescript
const MessagePart = z.object({
  id: z.string(),
  messageId: z.string(),
  sessionId: z.string(),
  type: z.enum([
    'text',
    'reasoning',
    'tool',
    'file',
    'step-start',
    'step-finish',
    'patch',
  ]),
  content: z.unknown(), // Type-specific JSON
  toolName: z.string().nullable(),
  toolCallId: z.string().nullable(),
  toolStatus: z.enum(['pending', 'running', 'completed', 'error']).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
```

**Part Types:**

| Type | Description | Content Schema |
|------|-------------|----------------|
| text | Generated text | `{ text: string }` |
| reasoning | Chain-of-thought | `{ text: string }` |
| tool | Tool call + result | `{ call: {...}, result: {...} }` |
| file | Attached file | `{ fileId: string, path: string }` |
| step-start | Processing started | `{ stepId: string }` |
| step-finish | Processing ended | `{ stepId: string }` |
| patch | File modification | `{ fileId: string, patch: string }` |

---

### Agent

Custom agent configuration.

**Schema:**
```typescript
const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mode: z.enum(['primary', 'subagent', 'all']),
  hidden: z.boolean().default(false),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  temperature: z.number().min(0).max(2).nullable(),
  topP: z.number().min(0).max(1).nullable(),
  maxSteps: z.number().positive().nullable(),
  prompt: z.string().nullable(),
  permissions: z.array(Permission).nullable(),
  options: z.record(z.unknown()).default({}),
  color: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  isBuiltin: z.boolean().default(false),
});
```

**Modes:**
- `primary`: Main agent for user interaction
- `subagent`: Only spawnable by other agents
- `all`: Can be used as either

---

### Tool

Custom tool definition.

**Schema:**
```typescript
const Tool = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['code', 'mcp', 'http']),
  code: z.string().nullable(),
  mcpServer: z.string().nullable(),
  mcpTool: z.string().nullable(),
  httpUrl: z.string().url().nullable(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).nullable(),
  parametersSchema: z.unknown(), // JSON Schema
  enabled: z.boolean().default(true),
  createdAt: z.number(),
  updatedAt: z.number(),
});
```

**Tool Types:**
- `code`: JavaScript function executed in sandbox
- `mcp`: Model Context Protocol tool from external server
- `http`: HTTP endpoint call

---

### File

Tracked file within a project.

**Schema:**
```typescript
const File = z.object({
  id: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  hash: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});
```

**Relationships:**
- Has many FileVersions (1:N)

---

### File Version

A snapshot of file content for history/undo.

**Schema:**
```typescript
const FileVersion = z.object({
  id: z.string(),
  fileId: z.string(),
  version: z.number(),
  hash: z.string(),
  sessionId: z.string().nullable(),
  messageId: z.string().nullable(),
  patch: z.string().nullable(), // Diff from previous
  createdAt: z.number(),
});
```

**Behavior:**
- First version stores full content
- Subsequent versions store patches (diffs)
- Can reconstruct any version by applying patches

---

### Snapshot

Point-in-time capture of project state.

**Schema:**
```typescript
const Snapshot = z.object({
  id: z.string(),
  sessionId: z.string().nullable(),
  messageId: z.string().nullable(),
  hash: z.string(),
  fileCount: z.number(),
  createdAt: z.number(),
});
```

**Usage:**
- Created before agent operations
- Enables rollback to previous state
- Links file changes to messages

---

### Permission

Rule for tool access control.

**Schema:**
```typescript
const Permission = z.object({
  id: z.string(),
  sessionId: z.string(),
  permission: z.string(), // Tool name or '*'
  pattern: z.string(),    // Argument pattern
  action: z.enum(['allow', 'deny', 'ask']),
  scope: z.enum(['session', 'project', 'global']),
  createdAt: z.number(),
});
```

**Evaluation Order:**
1. Most specific rule wins
2. Explicit deny beats allow
3. `ask` prompts user for approval
4. Default is deny

---

### Todo

Task tracking item.

**Schema:**
```typescript
const Todo = z.object({
  id: z.string(),
  sessionId: z.string(),
  content: z.string(),        // What to do
  activeForm: z.string(),     // "Doing X..."
  status: z.enum(['pending', 'in_progress', 'completed']),
  position: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
```

---

## ID Generation Strategies

All IDs use a consistent format with type-safe prefixes:

```typescript
// Format: {prefix}_{timestamp_base36}-{random_8chars}
// Example: "sess_2r1hf9qj3-a1b2c3d4"

const IdPrefixes = {
  user: "usr",
  project: "prj",
  session: "sess",
  message: "msg",
  part: "part",
  agent: "agt",
  tool: "tool",
  file: "file",
  version: "ver",
  snapshot: "snap",
  apiKey: "key",
  permission: "perm",
  todo: "todo",
  emailToken: "emltkn",
  authSession: "authsess",
  providerCredential: "cred",
};
```

### Descending IDs (Newest First)
Used for entities commonly listed in reverse chronological order:
- Sessions (so newest appears first in list)

```typescript
function generateDescendingId(prefix: string): string {
  const timestamp = Number.MAX_SAFE_INTEGER - Date.now();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${timestamp.toString(36)}-${random}`;
}
```

### Ascending IDs (Chronological)
Used for entities listed in creation order:
- Messages
- Message Parts
- File Versions

```typescript
function generateAscendingId(prefix: string): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${timestamp.toString(36)}-${random}`;
}
```

---

## Implementation Status

### Fully Implemented Entities

| Entity | Service | Database | API |
|--------|---------|----------|-----|
| User | ✓ | ✓ | ✓ (auth routes) |
| AuthSession | ✓ | ✓ | ✓ |
| EmailVerificationToken | ✓ | ✓ | ✓ |
| ProviderCredential | ✓ | ✓ | ✓ |
| Session | ✓ | ✓ | ✓ |
| Message | ✓ | ✓ | ✓ |
| MessagePart | ✓ | ✓ | ✓ |
| Agent (custom) | ✓ | ✓ | ✓ |
| Permission | ✓ | ✓ | - |

### Partially Implemented

| Entity | Service | Database | API | Notes |
|--------|---------|----------|-----|-------|
| Project | - | ✓ | - | Schema only |
| ProjectMember | - | ✓ | - | Schema only |
| ApiKey | - | ✓ | - | Schema only |
| File | - | ✓ | - | Schema only |
| FileVersion | - | ✓ | - | Schema only |
| Snapshot | - | ✓ | - | Schema only |
| Todo | - | ✓ | - | Schema only |
| Tool (custom) | - | ✓ | - | Schema only |

### Built-in Agents

Built-in agents are defined in code, not stored in database:

| Name | Mode | Description |
|------|------|-------------|
| default | all | General-purpose assistant |
| explore | subagent | Fast codebase exploration |
| plan | subagent | Implementation planning |

---

## Related Documents

- [Architecture](./01-architecture.md) - System design
- [API Reference](./03-api-reference.md) - How to interact with entities
- [Database Schema](../implementation-plan/01-database-schema.md) - SQL definitions
