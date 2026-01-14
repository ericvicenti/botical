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

Some operations use REST instead of WebSocket:

### Authentication

#### `POST /auth/register`
Create a new user account.

#### `POST /auth/login`
Login with email/password.

#### `POST /auth/logout`
Logout current session.

#### `GET /auth/me`
Get current user info.

#### `GET /auth/oauth/{provider}`
Start OAuth flow.

#### `GET /auth/oauth/{provider}/callback`
OAuth callback handler.

---

### File Uploads

#### `POST /projects/{projectId}/files/upload`
Upload file via multipart form.

---

### Health

#### `GET /health`
Server health check.

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
