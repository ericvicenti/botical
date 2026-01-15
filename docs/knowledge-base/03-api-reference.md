# API Reference

This document describes the WebSocket and REST APIs for interacting with Iris.

---

## Connection

### WebSocket Endpoint

```
ws://HOST/ws?projectId={projectId}&token={authToken}
```

**Query Parameters:**
- `projectId` (required): Project to connect to
- `token` (required): JWT authentication token

**On Connect:**
Server sends:
```json
{
  "type": "connected",
  "payload": {
    "connectionId": "conn_abc123",
    "projectId": "project_xyz",
    "userId": "user_456"
  }
}
```

---

## Message Protocol

### Request (Client → Server)

```typescript
{
  id: string;       // Unique request ID for response matching
  type: string;     // Request type (see Operations below)
  payload: unknown; // Type-specific data
}
```

### Response (Server → Client)

```typescript
{
  id: string;        // Matches request ID
  type: "response";
  success: boolean;
  payload?: unknown; // Result data (if success)
  error?: {          // Error info (if !success)
    code: string;
    message: string;
    details?: unknown;
  }
}
```

### Event (Server → Client)

```typescript
{
  type: string;      // Event type
  payload: unknown;  // Event data
}
```

---

## Operations

### Session Operations

#### `session.create`

Create a new conversation session.

**Request Payload:**
```typescript
{
  title?: string;          // Optional title (auto-generated if omitted)
  agent?: string;          // Agent ID to use (default: "default")
}
```

**Response Payload:**
```typescript
{
  session: {
    id: string;
    slug: string;
    title: string;
    agent: string;
    status: "active";
    createdAt: number;
    updatedAt: number;
  }
}
```

---

#### `session.list`

List sessions in the project.

**Request Payload:**
```typescript
{
  status?: "active" | "archived" | "deleted";
  limit?: number;          // Default: 50
  cursor?: string;         // For pagination
}
```

**Response Payload:**
```typescript
{
  sessions: Session[];
  nextCursor?: string;
}
```

---

#### `session.get`

Get session details with recent messages.

**Request Payload:**
```typescript
{
  sessionId: string;
  includeMessages?: boolean;  // Default: true
  messageLimit?: number;      // Default: 50
}
```

**Response Payload:**
```typescript
{
  session: Session;
  messages?: Message[];
}
```

---

#### `session.delete`

Delete (archive) a session.

**Request Payload:**
```typescript
{
  sessionId: string;
  permanent?: boolean;  // Hard delete, default: false
}
```

**Response Payload:**
```typescript
{
  deleted: true
}
```

---

### Message Operations

#### `message.send`

Send a message to the agent.

**Request Payload:**
```typescript
{
  sessionId: string;
  content: string;        // User message text
  attachments?: {         // Optional file attachments
    path: string;
    inline?: boolean;
  }[];
}
```

**Response Payload:**
```typescript
{
  messageId: string;      // The assistant's response message ID
  status: "completed" | "error";
}
```

**Streaming Events:**
While processing, server sends events (see Events section).

---

#### `message.cancel`

Cancel an in-progress message generation.

**Request Payload:**
```typescript
{
  sessionId: string;
}
```

**Response Payload:**
```typescript
{
  cancelled: true
}
```

---

#### `message.retry`

Retry from a specific message.

**Request Payload:**
```typescript
{
  sessionId: string;
  messageId: string;  // User message to retry from
}
```

**Response Payload:**
Same as `message.send`.

---

### Agent Operations

#### `agent.list`

List available agents.

**Request Payload:**
```typescript
{
  mode?: "primary" | "subagent" | "all";
  includeHidden?: boolean;  // Default: false
}
```

**Response Payload:**
```typescript
{
  agents: Agent[]
}
```

---

#### `agent.create`

Create a custom agent.

**Request Payload:**
```typescript
{
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
  prompt?: string;         // System prompt
  providerId?: string;     // LLM provider
  modelId?: string;        // Model ID
  temperature?: number;
  maxSteps?: number;
  permissions?: Permission[];
}
```

**Response Payload:**
```typescript
{
  agent: Agent
}
```

---

#### `agent.update`

Update an agent configuration.

**Request Payload:**
```typescript
{
  agentId: string;
  updates: Partial<AgentConfig>;
}
```

**Response Payload:**
```typescript
{
  agent: Agent
}
```

---

### Tool Operations

#### `tool.list`

List available tools.

**Request Payload:**
```typescript
{
  includeDisabled?: boolean;  // Default: false
}
```

**Response Payload:**
```typescript
{
  tools: Tool[]
}
```

---

#### `tool.create`

Create a custom tool.

**Request Payload:**
```typescript
{
  name: string;
  description: string;
  type: "code" | "mcp" | "http";
  parametersSchema: JSONSchema;
  // For type: "code"
  code?: string;
  // For type: "mcp"
  mcpServer?: string;
  mcpTool?: string;
  // For type: "http"
  httpUrl?: string;
  httpMethod?: "GET" | "POST" | "PUT" | "DELETE";
}
```

**Response Payload:**
```typescript
{
  tool: Tool
}
```

---

#### `tool.approve`

Approve a pending tool execution.

**Request Payload:**
```typescript
{
  toolCallId: string;
  sessionId: string;
  remember?: boolean;  // Save permission for future
  scope?: "session" | "project";
}
```

**Response Payload:**
```typescript
{
  approved: true
}
```

---

#### `tool.reject`

Reject a pending tool execution.

**Request Payload:**
```typescript
{
  toolCallId: string;
  sessionId: string;
  reason?: string;
}
```

**Response Payload:**
```typescript
{
  rejected: true
}
```

---

### File Operations

#### `file.list`

List files in a directory.

**Request Payload:**
```typescript
{
  path?: string;        // Default: "/" (project root)
  recursive?: boolean;  // Default: false
  pattern?: string;     // Glob pattern filter
}
```

**Response Payload:**
```typescript
{
  files: {
    path: string;
    type: "file" | "directory";
    size?: number;
    mimeType?: string;
    updatedAt: number;
  }[]
}
```

---

#### `file.read`

Read file contents.

**Request Payload:**
```typescript
{
  path: string;
  encoding?: "utf-8" | "base64";  // Default: "utf-8"
}
```

**Response Payload:**
```typescript
{
  path: string;
  content: string;
  mimeType?: string;
  size: number;
}
```

---

#### `file.write`

Write file contents.

**Request Payload:**
```typescript
{
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
  createDirectories?: boolean;  // Default: true
}
```

**Response Payload:**
```typescript
{
  path: string;
  size: number;
  version: number;
}
```

---

#### `file.delete`

Delete a file or directory.

**Request Payload:**
```typescript
{
  path: string;
  recursive?: boolean;  // For directories, default: false
}
```

**Response Payload:**
```typescript
{
  deleted: true
}
```

---

### Subscription Operations

#### `subscribe`

Subscribe to a channel for events.

**Request Payload:**
```typescript
{
  channel: string;  // "session:{id}" or "project:{id}"
}
```

**Response Payload:**
```typescript
{
  subscribed: true;
  channel: string;
}
```

---

#### `unsubscribe`

Unsubscribe from a channel.

**Request Payload:**
```typescript
{
  channel: string;
}
```

**Response Payload:**
```typescript
{
  unsubscribed: true;
}
```

---

#### `ping`

Health check / keep-alive.

**Request Payload:** (none)

**Response Payload:**
```typescript
{
  pong: number;  // Server timestamp
}
```

---

## Events

Events are pushed from server to client without a request.

### Session Events

#### `session.created`
```typescript
{
  session: Session
}
```

#### `session.updated`
```typescript
{
  session: Session
}
```

#### `session.deleted`
```typescript
{
  sessionId: string
}
```

---

### Message Streaming Events

These events are sent during message generation:

#### `message.created`
New message started.
```typescript
{
  sessionId: string;
  message: Message;
}
```

#### `message.text.delta`
Incremental text output.
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  delta: string;
}
```

#### `message.text.complete`
Text part finished.
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  text: string;
}
```

#### `message.reasoning.delta`
Chain-of-thought text (if enabled).
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  delta: string;
}
```

#### `message.tool.call`
Agent is calling a tool.
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
}
```

#### `message.tool.result`
Tool execution completed.
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  toolCallId: string;
  output: string;
  metadata?: unknown;
}
```

#### `message.tool.error`
Tool execution failed.
```typescript
{
  sessionId: string;
  messageId: string;
  partId: string;
  toolCallId: string;
  error: string;
}
```

#### `message.complete`
Message generation finished.
```typescript
{
  sessionId: string;
  messageId: string;
  finishReason: "stop" | "tool-calls" | "length" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }
}
```

#### `message.error`
Message generation failed.
```typescript
{
  sessionId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  }
}
```

---

### Tool Approval Events

#### `tool.approval.required`
Agent needs permission to run a tool.
```typescript
{
  sessionId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  message: string;  // Human-readable description
}
```

#### `tool.approval.resolved`
Tool approval was handled.
```typescript
{
  sessionId: string;
  toolCallId: string;
  approved: boolean;
}
```

---

### File Events

#### `file.created`
```typescript
{
  path: string;
  type: "file" | "directory";
}
```

#### `file.updated`
```typescript
{
  path: string;
  sessionId?: string;  // If changed by agent
}
```

#### `file.deleted`
```typescript
{
  path: string;
}
```

---

### Presence Events

#### `presence.joined`
User connected to project.
```typescript
{
  userId: string;
  username: string;
  avatar?: string;
}
```

#### `presence.left`
User disconnected.
```typescript
{
  userId: string;
}
```

#### `presence.cursor`
User cursor position (for collaborative features).
```typescript
{
  userId: string;
  sessionId: string;
  position?: number;
}
```

---

## REST Endpoints

REST API provides CRUD operations for sessions, messages, and agents.

### Response Format

All REST endpoints return consistent JSON responses:

```typescript
// Success response
{
  data: T;              // The requested resource(s)
  meta?: {              // Pagination/metadata (for lists)
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }
}

// Error response
{
  error: {
    code: string;       // Machine-readable error code
    message: string;    // Human-readable message
    details?: unknown;  // Additional context
  }
}
```

---

### Sessions API

Base path: `/api/sessions`

#### `GET /api/sessions`

List sessions with pagination and filters.

**Query Parameters:**
- `projectId` (required): Project ID
- `status`: Filter by status (`active`, `archived`, `deleted`)
- `agent`: Filter by agent name
- `parentId`: Filter by parent session (for sub-agents)
- `limit`: Max results (default: 50, max: 100)
- `offset`: Skip results (default: 0)

**Response:**
```typescript
{
  data: Session[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }
}
```

---

#### `POST /api/sessions`

Create a new session.

**Request Body:**
```typescript
{
  projectId: string;
  title?: string;          // Auto-generated if omitted
  agent?: string;          // Default: "default"
  parentId?: string;       // For sub-agent sessions
  providerId?: string;     // LLM provider
  modelId?: string;        // Model ID
}
```

**Response:** `201 Created`
```typescript
{
  data: Session
}
```

---

#### `GET /api/sessions/:id`

Get session by ID.

**Query Parameters:**
- `projectId` (required): Project ID

**Response:**
```typescript
{
  data: Session
}
```

---

#### `PUT /api/sessions/:id`

Update session.

**Request Body:**
```typescript
{
  projectId: string;
  title?: string;
  status?: "active" | "archived" | "deleted";
  agent?: string;
  providerId?: string;
  modelId?: string;
}
```

**Response:**
```typescript
{
  data: Session
}
```

---

#### `DELETE /api/sessions/:id`

Soft delete a session (sets status to "deleted").

**Query Parameters:**
- `projectId` (required): Project ID

**Response:**
```typescript
{
  data: { deleted: true }
}
```

---

#### `GET /api/sessions/:id/messages`

List messages in a session.

**Query Parameters:**
- `projectId` (required): Project ID
- `role`: Filter by role (`user`, `assistant`, `system`)
- `limit`: Max results (default: 50)
- `offset`: Skip results (default: 0)

**Response:**
```typescript
{
  data: Message[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }
}
```

---

### Messages API

Base path: `/api/messages`

#### `POST /api/messages`

Send a message and trigger agent orchestration.

**Request Body:**
```typescript
{
  projectId: string;
  sessionId: string;
  content: string;           // User message text
  userId: string;            // User ID for permission context
  providerId?: string;       // Default: "anthropic"
  modelId?: string;          // Uses provider default
  agentName?: string;        // Override session's agent
  canExecuteCode?: boolean;  // Default: false
}
```

**Response:** `201 Created`
```typescript
{
  data: {
    message: Message;          // Assistant message
    parts: MessagePart[];      // All message parts
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
    cost: number;              // Estimated cost in USD
    finishReason: "stop" | "tool-calls" | "length" | "error";
  }
}
```

---

#### `GET /api/messages/:id`

Get message with all parts.

**Query Parameters:**
- `projectId` (required): Project ID

**Response:**
```typescript
{
  data: Message & {
    parts: MessagePart[];
  }
}
```

---

#### `GET /api/messages/:id/parts`

List message parts.

**Query Parameters:**
- `projectId` (required): Project ID

**Response:**
```typescript
{
  data: MessagePart[];
  meta: {
    total: number;
  }
}
```

---

### Agents API

Base path: `/api/agents`

#### `GET /api/agents`

List available agents (built-in + custom).

**Query Parameters:**
- `projectId`: Project ID (required for custom agents)
- `mode`: Filter by mode (`primary`, `subagent`)
- `includeHidden`: Include hidden agents (default: false)
- `builtinOnly`: Only built-in agents (default: false)
- `customOnly`: Only custom agents (default: false)

**Response:**
```typescript
{
  data: AgentConfig[];
  meta: {
    total: number;
    builtinCount: number;
    customCount: number;
  }
}
```

---

#### `POST /api/agents`

Create a custom agent.

**Request Body:**
```typescript
{
  projectId: string;
  name: string;              // Lowercase, hyphens, starts with letter
  description?: string;
  mode?: "primary" | "subagent" | "all";  // Default: "subagent"
  hidden?: boolean;          // Default: false
  providerId?: string;
  modelId?: string;
  temperature?: number;      // 0-2
  topP?: number;             // 0-1
  maxSteps?: number;
  prompt?: string;           // System prompt
  tools?: string[];          // Tool names
  color?: string;
}
```

**Response:** `201 Created`
```typescript
{
  data: AgentConfig
}
```

**Errors:**
- `400`: Name is reserved or already exists
- `400`: Invalid name format

---

#### `GET /api/agents/:name`

Get agent config by name.

**Query Parameters:**
- `projectId`: Project ID (for custom agents)

**Response:**
```typescript
{
  data: AgentConfig
}
```

---

#### `PUT /api/agents/:name`

Update custom agent.

**Request Body:**
```typescript
{
  projectId: string;
  name?: string;             // Rename agent
  description?: string;
  mode?: "primary" | "subagent" | "all";
  hidden?: boolean;
  providerId?: string;
  modelId?: string;
  temperature?: number;
  topP?: number;
  maxSteps?: number;
  prompt?: string;
  tools?: string[];
  color?: string;
}
```

**Response:**
```typescript
{
  data: AgentConfig
}
```

**Errors:**
- `403`: Cannot update built-in agents
- `400`: New name is reserved

---

#### `DELETE /api/agents/:name`

Delete custom agent.

**Query Parameters:**
- `projectId` (required): Project ID

**Response:**
```typescript
{
  data: { deleted: true }
}
```

**Errors:**
- `403`: Cannot delete built-in agents

---

### Authentication API

Base path: `/auth`

#### `POST /auth/magic-link`

Request a magic link for passwordless login.

**Request Body:**
```typescript
{
  email: string;
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
}
```

---

#### `GET /auth/verify`

Verify magic link token and create session.

**Query Parameters:**
- `token`: Magic link token

**Response:** Redirects or returns session.

---

#### `POST /auth/logout`

Logout current session.

**Response:**
```typescript
{
  success: true
}
```

---

#### `GET /auth/me`

Get current user info.

**Response:**
```typescript
{
  user: User;
  session: AuthSession;
}
```

---

### Provider Credentials API

Base path: `/credentials`

#### `GET /credentials`

List user's provider credentials.

**Response:**
```typescript
{
  credentials: ProviderCredential[];
}
```

---

#### `POST /credentials`

Store a new provider credential.

**Request Body:**
```typescript
{
  provider: "anthropic" | "openai" | "google";
  apiKey: string;
  name?: string;
  isDefault?: boolean;
}
```

**Response:**
```typescript
{
  credential: ProviderCredential;
}
```

---

#### `DELETE /credentials/:id`

Delete a provider credential.

**Response:**
```typescript
{
  deleted: true
}
```

---

### Health API

Base path: `/health`

#### `GET /health`

Basic health check.

**Response:**
```typescript
{
  status: "ok";
  timestamp: number;
}
```

---

#### `GET /health/ready`

Readiness check (includes database).

**Response:**
```typescript
{
  status: "ok" | "error";
  timestamp: number;
  checks: {
    database: "ok" | "error";
  }
}
```

---

#### `GET /health/live`

Liveness check with uptime.

**Response:**
```typescript
{
  status: "ok";
  uptime: number;
}

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | No authentication token provided |
| `AUTH_INVALID` | Token is invalid or expired |
| `FORBIDDEN` | User lacks permission for operation |
| `NOT_FOUND` | Requested resource doesn't exist |
| `VALIDATION_ERROR` | Invalid request parameters |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `LLM_ERROR` | LLM provider error |
| `TOOL_ERROR` | Tool execution failed |
| `CANCELLED` | Operation was cancelled |

---

## Related Documents

- [Architecture](./01-architecture.md) - System design
- [Data Model](./02-data-model.md) - Entity definitions
- [Realtime Communication](../implementation-plan/05-realtime-communication.md) - Detailed protocol
