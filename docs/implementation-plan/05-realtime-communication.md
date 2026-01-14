# Real-time Communication

## Overview

WebSocket is the primary communication channel for Iris, enabling:
- Efficient bidirectional communication
- Real-time streaming of agent responses
- Live updates across multiple clients
- Collaborative editing notifications

## Protocol Design

### Message Format

All WebSocket messages follow a consistent JSON format:

```typescript
// src/websocket/protocol.ts
import { z } from 'zod';

// Base message structure
export const WSMessage = z.object({
  id: z.string(),           // Unique message ID for request/response matching
  type: z.string(),         // Message type
  payload: z.unknown(),     // Type-specific payload
});

// Request message (client -> server)
export const WSRequest = WSMessage.extend({
  type: z.enum([
    // Session operations
    'session.create',
    'session.list',
    'session.get',
    'session.delete',

    // Messaging
    'message.send',
    'message.cancel',
    'message.retry',

    // Agent operations
    'agent.list',
    'agent.create',
    'agent.update',

    // Tool operations
    'tool.list',
    'tool.create',
    'tool.approve',
    'tool.reject',

    // File operations
    'file.list',
    'file.read',
    'file.write',
    'file.delete',

    // Project operations
    'project.get',
    'project.update',

    // Subscriptions
    'subscribe',
    'unsubscribe',

    // Ping/pong
    'ping',
  ]),
});

// Response message (server -> client)
export const WSResponse = z.object({
  id: z.string(),           // Matches request ID
  type: z.literal('response'),
  success: z.boolean(),
  payload: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
});

// Event message (server -> client, unprompted)
export const WSEvent = z.object({
  type: z.string(),
  payload: z.unknown(),
});

export type WSMessage = z.infer<typeof WSMessage>;
export type WSRequest = z.infer<typeof WSRequest>;
export type WSResponse = z.infer<typeof WSResponse>;
export type WSEvent = z.infer<typeof WSEvent>;
```

### Event Types

```typescript
// src/websocket/events.ts
import { z } from 'zod';

// Session events
export const SessionEvents = {
  'session.created': z.object({
    session: SessionSchema,
  }),
  'session.updated': z.object({
    session: SessionSchema,
  }),
  'session.deleted': z.object({
    sessionId: z.string(),
  }),
};

// Message events (streaming)
export const MessageEvents = {
  'message.created': z.object({
    sessionId: z.string(),
    message: MessageSchema,
  }),
  'message.text.delta': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    delta: z.string(),
  }),
  'message.text.complete': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    text: z.string(),
  }),
  'message.reasoning.delta': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    delta: z.string(),
  }),
  'message.tool.call': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    toolName: z.string(),
    toolCallId: z.string(),
    input: z.unknown(),
  }),
  'message.tool.result': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    toolCallId: z.string(),
    output: z.string(),
    metadata: z.unknown().optional(),
  }),
  'message.tool.error': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    toolCallId: z.string(),
    error: z.string(),
  }),
  'message.complete': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    finishReason: z.string(),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cost: z.number(),
    }),
  }),
  'message.error': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
};

// Tool approval events
export const ToolEvents = {
  'tool.approval.required': z.object({
    sessionId: z.string(),
    messageId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    message: z.string(),
  }),
  'tool.approval.resolved': z.object({
    sessionId: z.string(),
    toolCallId: z.string(),
    approved: z.boolean(),
  }),
};

// File events
export const FileEvents = {
  'file.created': z.object({
    path: z.string(),
    type: z.string(),
  }),
  'file.updated': z.object({
    path: z.string(),
    sessionId: z.string().optional(),
  }),
  'file.deleted': z.object({
    path: z.string(),
  }),
};

// Presence events (for collaboration)
export const PresenceEvents = {
  'presence.joined': z.object({
    userId: z.string(),
    username: z.string(),
    avatar: z.string().optional(),
  }),
  'presence.left': z.object({
    userId: z.string(),
  }),
  'presence.cursor': z.object({
    userId: z.string(),
    sessionId: z.string(),
    position: z.number().optional(),
  }),
};
```

## WebSocket Handler

```typescript
// src/websocket/handler.ts
import { WSContext } from 'hono/ws';
import { WSRequest, WSResponse, WSEvent } from './protocol';
import { ConnectionManager } from './connections';
import { RoomManager } from './rooms';
import { AuthService } from '../services/auth';

interface WSData {
  userId: string;
  projectId: string;
  connectionId: string;
}

export function createWebSocketHandler() {
  return async (c: Context) => {
    // Authenticate before upgrade
    const token = c.req.query('token');
    const projectId = c.req.query('projectId');

    if (!token || !projectId) {
      return c.json({ error: 'Missing token or projectId' }, 401);
    }

    const auth = await AuthService.verifyToken(token);
    if (!auth) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Check project access
    const hasAccess = await ProjectMemberService.hasPermission(
      projectId,
      auth.userId,
      'session.read'
    );
    if (!hasAccess) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const connectionId = generateId('conn');

    return {
      onOpen: async (event, ws) => {
        ws.data = { userId: auth.userId, projectId, connectionId };

        // Register connection
        ConnectionManager.add(connectionId, {
          ws,
          userId: auth.userId,
          projectId,
          connectedAt: Date.now(),
        });

        // Join project room
        RoomManager.join(`project:${projectId}`, connectionId);

        // Notify others
        RoomManager.broadcast(`project:${projectId}`, {
          type: 'presence.joined',
          payload: {
            userId: auth.userId,
            username: auth.username,
            avatar: auth.avatar,
          },
        }, [connectionId]);

        // Send welcome message
        ws.send(JSON.stringify({
          type: 'connected',
          payload: {
            connectionId,
            projectId,
            userId: auth.userId,
          },
        }));
      },

      onMessage: async (event, ws) => {
        try {
          const data = JSON.parse(event.data.toString());
          const request = WSRequest.parse(data);

          const response = await handleRequest(request, ws.data);

          ws.send(JSON.stringify({
            id: request.id,
            type: 'response',
            success: true,
            payload: response,
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            id: data?.id,
            type: 'response',
            success: false,
            error: {
              code: error.code || 'INTERNAL_ERROR',
              message: error.message,
            },
          }));
        }
      },

      onClose: async (event, ws) => {
        const { userId, projectId, connectionId } = ws.data;

        // Leave rooms
        RoomManager.leave(`project:${projectId}`, connectionId);

        // Remove connection
        ConnectionManager.remove(connectionId);

        // Notify others
        RoomManager.broadcast(`project:${projectId}`, {
          type: 'presence.left',
          payload: { userId },
        });
      },

      onError: async (event, ws) => {
        console.error('WebSocket error:', event);
      },
    };
  };
}
```

## Request Handlers

```typescript
// src/websocket/handlers/index.ts
import { WSData } from '../handler';
import { SessionHandlers } from './sessions';
import { MessageHandlers } from './messages';
import { AgentHandlers } from './agents';
import { ToolHandlers } from './tools';
import { FileHandlers } from './files';

const handlers: Record<string, (payload: any, ctx: WSData) => Promise<any>> = {
  // Session handlers
  'session.create': SessionHandlers.create,
  'session.list': SessionHandlers.list,
  'session.get': SessionHandlers.get,
  'session.delete': SessionHandlers.delete,

  // Message handlers
  'message.send': MessageHandlers.send,
  'message.cancel': MessageHandlers.cancel,
  'message.retry': MessageHandlers.retry,

  // Agent handlers
  'agent.list': AgentHandlers.list,
  'agent.create': AgentHandlers.create,
  'agent.update': AgentHandlers.update,

  // Tool handlers
  'tool.list': ToolHandlers.list,
  'tool.create': ToolHandlers.create,
  'tool.approve': ToolHandlers.approve,
  'tool.reject': ToolHandlers.reject,

  // File handlers
  'file.list': FileHandlers.list,
  'file.read': FileHandlers.read,
  'file.write': FileHandlers.write,
  'file.delete': FileHandlers.delete,

  // Subscriptions
  'subscribe': subscribeHandler,
  'unsubscribe': unsubscribeHandler,

  // Ping
  'ping': () => Promise.resolve({ pong: Date.now() }),
};

export async function handleRequest(
  request: WSRequest,
  ctx: WSData
): Promise<any> {
  const handler = handlers[request.type];

  if (!handler) {
    throw new Error(`Unknown request type: ${request.type}`);
  }

  return handler(request.payload, ctx);
}

// src/websocket/handlers/messages.ts
export const MessageHandlers = {
  async send(payload: { sessionId: string; content: string }, ctx: WSData) {
    const orchestrator = new AgentOrchestrator(ctx.projectId);

    // This will stream events to all subscribed clients
    const result = await orchestrator.prompt({
      sessionId: payload.sessionId,
      content: payload.content,
      userId: ctx.userId,
    });

    return {
      messageId: result.messageId,
      status: 'completed',
    };
  },

  async cancel(payload: { sessionId: string }, ctx: WSData) {
    await SessionService.cancelActiveStream(ctx.projectId, payload.sessionId);
    return { cancelled: true };
  },

  async retry(payload: { sessionId: string; messageId: string }, ctx: WSData) {
    // Get the original user message
    const message = await MessageService.get(ctx.projectId, payload.messageId);
    if (!message || message.role !== 'user') {
      throw new Error('Invalid message for retry');
    }

    // Delete subsequent assistant messages
    await MessageService.deleteAfter(ctx.projectId, payload.sessionId, payload.messageId);

    // Re-send the message
    return MessageHandlers.send({
      sessionId: payload.sessionId,
      content: message.content,
    }, ctx);
  },
};
```

## Connection & Room Management

```typescript
// src/websocket/connections.ts
interface Connection {
  ws: WebSocket;
  userId: string;
  projectId: string;
  connectedAt: number;
  subscriptions: Set<string>;
}

class ConnectionManagerImpl {
  private connections = new Map<string, Connection>();

  add(id: string, conn: Connection) {
    this.connections.set(id, { ...conn, subscriptions: new Set() });
  }

  remove(id: string) {
    this.connections.delete(id);
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  getByUser(userId: string): Connection[] {
    return Array.from(this.connections.values())
      .filter(c => c.userId === userId);
  }

  getByProject(projectId: string): Connection[] {
    return Array.from(this.connections.values())
      .filter(c => c.projectId === projectId);
  }

  send(id: string, message: WSEvent) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.ws.send(JSON.stringify(message));
    }
  }

  broadcast(projectId: string, message: WSEvent, exclude: string[] = []) {
    for (const [id, conn] of this.connections) {
      if (conn.projectId === projectId && !exclude.includes(id)) {
        conn.ws.send(JSON.stringify(message));
      }
    }
  }
}

export const ConnectionManager = new ConnectionManagerImpl();

// src/websocket/rooms.ts
class RoomManagerImpl {
  private rooms = new Map<string, Set<string>>();

  join(room: string, connectionId: string) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(connectionId);
  }

  leave(room: string, connectionId: string) {
    const members = this.rooms.get(room);
    if (members) {
      members.delete(connectionId);
      if (members.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  broadcast(room: string, message: WSEvent, exclude: string[] = []) {
    const members = this.rooms.get(room);
    if (!members) return;

    for (const connectionId of members) {
      if (!exclude.includes(connectionId)) {
        ConnectionManager.send(connectionId, message);
      }
    }
  }

  getMembers(room: string): string[] {
    return Array.from(this.rooms.get(room) || []);
  }
}

export const RoomManager = new RoomManagerImpl();
```

## Event Bus Integration

```typescript
// src/websocket/bus-bridge.ts
import { EventBus } from '../bus';
import { ConnectionManager } from './connections';
import { RoomManager } from './rooms';

// Bridge internal events to WebSocket clients
export function setupBusBridge() {
  // Session events -> broadcast to project room
  EventBus.subscribe('session.*', (event) => {
    const { projectId } = event.metadata;
    RoomManager.broadcast(`project:${projectId}`, {
      type: event.type,
      payload: event.payload,
    });
  });

  // Message events -> broadcast to session room
  EventBus.subscribe('message.*', (event) => {
    const { projectId, sessionId } = event.metadata;

    // Broadcast to all project connections subscribed to this session
    RoomManager.broadcast(`session:${sessionId}`, {
      type: event.type,
      payload: event.payload,
    });
  });

  // File events -> broadcast to project room
  EventBus.subscribe('file.*', (event) => {
    const { projectId } = event.metadata;
    RoomManager.broadcast(`project:${projectId}`, {
      type: event.type,
      payload: event.payload,
    });
  });
}
```

## Client SDK Types

For TypeScript clients, we provide type definitions:

```typescript
// src/types/client.ts
export interface IrisClient {
  // Connection
  connect(options: { projectId: string; token: string }): Promise<void>;
  disconnect(): void;
  onDisconnect(callback: () => void): void;

  // Sessions
  createSession(options?: CreateSessionOptions): Promise<Session>;
  listSessions(): Promise<Session[]>;
  getSession(sessionId: string): Promise<Session>;
  deleteSession(sessionId: string): Promise<void>;

  // Messages
  sendMessage(sessionId: string, content: string): Promise<SendMessageResult>;
  cancelMessage(sessionId: string): Promise<void>;
  onMessageStream(callback: (event: MessageStreamEvent) => void): () => void;

  // Agents
  listAgents(): Promise<Agent[]>;
  createAgent(config: CreateAgentConfig): Promise<Agent>;
  updateAgent(agentId: string, updates: UpdateAgentConfig): Promise<Agent>;

  // Tools
  listTools(): Promise<Tool[]>;
  approveToolCall(toolCallId: string): Promise<void>;
  rejectToolCall(toolCallId: string, reason?: string): Promise<void>;

  // Files
  listFiles(path?: string): Promise<FileEntry[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;

  // Subscriptions
  subscribe(channel: string): () => void;

  // Presence
  onPresence(callback: (event: PresenceEvent) => void): () => void;
}

export type MessageStreamEvent =
  | { type: 'text.delta'; delta: string }
  | { type: 'text.complete'; text: string }
  | { type: 'tool.call'; toolName: string; input: unknown }
  | { type: 'tool.result'; toolName: string; output: string }
  | { type: 'complete'; usage: UsageInfo }
  | { type: 'error'; error: ErrorInfo };
```

## Reconnection & State Sync

```typescript
// src/websocket/sync.ts
export class StateSync {
  // Get full state for reconnection
  static async getSessionState(
    projectId: string,
    sessionId: string,
    afterMessageId?: string
  ): Promise<SessionState> {
    const session = await SessionService.get(projectId, sessionId);
    const messages = await MessageService.list(projectId, sessionId, {
      after: afterMessageId,
    });

    // Get any pending tool approvals
    const pendingApprovals = await PermissionService.getPending(sessionId);

    return {
      session,
      messages,
      pendingApprovals,
    };
  }

  // Sync client to current state
  static async syncClient(
    connectionId: string,
    sessionId: string,
    lastKnownMessageId?: string
  ) {
    const conn = ConnectionManager.get(connectionId);
    if (!conn) return;

    const state = await this.getSessionState(
      conn.projectId,
      sessionId,
      lastKnownMessageId
    );

    ConnectionManager.send(connectionId, {
      type: 'session.sync',
      payload: state,
    });
  }
}
```
