# Server Architecture

## Overview

The server is built on Hono with Bun, providing:
- WebSocket as the primary communication channel
- HTTP endpoints for health, uploads, and OAuth callbacks
- SSE fallback for environments without WebSocket support

## Server Structure

```
src/
├── server/
│   ├── index.ts              # Server entry point
│   ├── app.ts                # Hono app factory
│   ├── middleware/
│   │   ├── auth.ts           # Authentication middleware
│   │   ├── cors.ts           # CORS configuration
│   │   ├── logging.ts        # Request logging
│   │   ├── project.ts        # Project context injection
│   │   └── error.ts          # Error handling
│   ├── routes/
│   │   ├── health.ts         # Health check endpoints
│   │   ├── auth.ts           # Authentication endpoints
│   │   ├── projects.ts       # Project CRUD (REST)
│   │   ├── files.ts          # File upload/download (REST)
│   │   └── ws.ts             # WebSocket upgrade handler
│   └── websocket/
│       ├── handler.ts        # WebSocket message handler
│       ├── protocol.ts       # Message protocol definitions
│       ├── rooms.ts          # Room/channel management
│       └── broadcast.ts      # Broadcast utilities
```

## Hono Application Setup

```typescript
// src/server/app.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { upgradeWebSocket } from 'hono/bun';

import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { projectRoutes } from './routes/projects';
import { fileRoutes } from './routes/files';
import { createWebSocketHandler } from './websocket/handler';

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', logger());
  app.use('*', cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (origin.startsWith('http://localhost:')) return origin;
      if (origin.startsWith('http://127.0.0.1:')) return origin;
      // Add production domains here
      return undefined;
    },
    credentials: true,
  }));
  app.onError(errorHandler);

  // Health check (no auth required)
  app.route('/health', healthRoutes);

  // Auth endpoints
  app.route('/auth', authRoutes);

  // Protected routes
  app.use('/api/*', authMiddleware);

  // REST API routes
  app.route('/api/projects', projectRoutes);
  app.route('/api/files', fileRoutes);

  // WebSocket endpoint
  app.get('/ws', upgradeWebSocket(createWebSocketHandler()));

  // SSE fallback
  app.get('/api/events/:projectId', sseHandler);

  return app;
}
```

## Server Entry Point

```typescript
// src/server/index.ts
import { createApp } from './app';
import { DatabaseManager } from '../database';
import { EventBus } from '../bus';
import { Config } from '../config';

const config = await Config.load();
const db = new DatabaseManager(config.dataDir);
const bus = new EventBus();

const app = createApp();

const server = Bun.serve({
  port: config.port || 4096,
  hostname: config.host || '0.0.0.0',
  fetch: app.fetch,
  websocket: {
    message: (ws, message) => ws.data.handler.onMessage(message),
    open: (ws) => ws.data.handler.onOpen(),
    close: (ws, code, reason) => ws.data.handler.onClose(code, reason),
    drain: (ws) => ws.data.handler.onDrain(),
  },
});

console.log(`Iris server running at http://${server.hostname}:${server.port}`);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await db.closeAll();
  server.stop();
  process.exit(0);
});
```

## Authentication Middleware

```typescript
// src/server/middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { verify } from '../auth/jwt';
import { ApiKeyService } from '../services/api-keys';

export interface AuthContext {
  userId: string;
  sessionId?: string;
  apiKeyId?: string;
  permissions?: string[];
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header('Authorization');

  if (!authorization) {
    throw new HTTPException(401, { message: 'Missing authorization' });
  }

  // API Key authentication
  if (authorization.startsWith('Bearer iris_')) {
    const apiKey = authorization.slice(7);
    const keyData = await ApiKeyService.validate(apiKey);

    if (!keyData) {
      throw new HTTPException(401, { message: 'Invalid API key' });
    }

    c.set('auth', {
      userId: keyData.userId,
      apiKeyId: keyData.id,
      permissions: keyData.permissions,
    });
    return next();
  }

  // JWT authentication
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    const payload = await verify(token);

    if (!payload) {
      throw new HTTPException(401, { message: 'Invalid token' });
    }

    c.set('auth', {
      userId: payload.sub,
      sessionId: payload.sessionId,
    });
    return next();
  }

  throw new HTTPException(401, { message: 'Invalid authorization format' });
});
```

## Project Context Middleware

```typescript
// src/server/middleware/project.ts
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { ProjectService } from '../services/projects';

declare module 'hono' {
  interface ContextVariableMap {
    project: {
      id: string;
      role: string;
      db: Database;
    };
  }
}

export const projectMiddleware = createMiddleware(async (c, next) => {
  const projectId = c.req.param('projectId');
  if (!projectId) return next();

  const auth = c.get('auth');
  const project = await ProjectService.getWithAccess(projectId, auth.userId);

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  c.set('project', {
    id: project.id,
    role: project.role,
    db: await DatabaseManager.getProjectDb(project.id),
  });

  return next();
});
```

## Error Handling

```typescript
// src/server/middleware/error.ts
import { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { NamedError } from '../errors';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Request error:', err);

  // HTTPException (already formatted)
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return c.json({
      error: 'validation_error',
      message: 'Invalid request data',
      details: err.errors,
    }, 400);
  }

  // Named application errors
  if (err instanceof NamedError) {
    const status = getStatusForError(err);
    return c.json(err.toJSON(), status);
  }

  // Unknown errors
  return c.json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
  }, 500);
};

function getStatusForError(err: NamedError): number {
  switch (err.name) {
    case 'NotFoundError': return 404;
    case 'ForbiddenError': return 403;
    case 'ConflictError': return 409;
    case 'ValidationError': return 400;
    default: return 500;
  }
}
```

## Health Routes

```typescript
// src/server/routes/health.ts
import { Hono } from 'hono';
import { VERSION } from '../version';

export const healthRoutes = new Hono()
  .get('/', (c) => {
    return c.json({
      status: 'healthy',
      version: VERSION,
      timestamp: Date.now(),
    });
  })
  .get('/ready', async (c) => {
    // Check database connectivity
    const dbHealthy = await checkDatabaseHealth();

    if (!dbHealthy) {
      return c.json({ status: 'not_ready', reason: 'database' }, 503);
    }

    return c.json({ status: 'ready' });
  });
```

## Project REST Routes

```typescript
// src/server/routes/projects.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Project } from '../schemas/project';
import { ProjectService } from '../services/projects';

export const projectRoutes = new Hono()
  // List projects
  .get('/', async (c) => {
    const auth = c.get('auth');
    const projects = await ProjectService.listForUser(auth.userId);
    return c.json({ projects });
  })

  // Create project
  .post('/', zValidator('json', Project.Create), async (c) => {
    const auth = c.get('auth');
    const input = c.req.valid('json');
    const project = await ProjectService.create(auth.userId, input);
    return c.json({ project }, 201);
  })

  // Get project
  .get('/:projectId', projectMiddleware, async (c) => {
    const project = c.get('project');
    const details = await ProjectService.getDetails(project.id);
    return c.json({ project: details });
  })

  // Update project
  .patch('/:projectId', projectMiddleware, zValidator('json', Project.Update), async (c) => {
    const project = c.get('project');
    const input = c.req.valid('json');
    const updated = await ProjectService.update(project.id, input);
    return c.json({ project: updated });
  })

  // Delete project
  .delete('/:projectId', projectMiddleware, async (c) => {
    const project = c.get('project');
    await ProjectService.archive(project.id);
    return c.json({ success: true });
  });
```

## File Upload Routes

```typescript
// src/server/routes/files.ts
import { Hono } from 'hono';
import { projectMiddleware } from '../middleware/project';
import { FileService } from '../services/files';

export const fileRoutes = new Hono()
  // Upload file
  .post('/:projectId/upload', projectMiddleware, async (c) => {
    const project = c.get('project');
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;

    if (!file || !path) {
      return c.json({ error: 'Missing file or path' }, 400);
    }

    const result = await FileService.upload(project.id, path, file);
    return c.json({ file: result });
  })

  // Download file
  .get('/:projectId/download/*', projectMiddleware, async (c) => {
    const project = c.get('project');
    const path = c.req.path.replace(`/${project.id}/download/`, '');

    const file = await FileService.read(project.id, path);

    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }

    return new Response(file.content, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
    });
  });
```

## SSE Fallback Handler

```typescript
// src/server/routes/events.ts
import { streamSSE } from 'hono/streaming';
import { EventBus } from '../bus';

export const sseHandler = async (c: Context) => {
  const auth = c.get('auth');
  const projectId = c.req.param('projectId');

  return streamSSE(c, async (stream) => {
    // Send initial connection event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ projectId }),
    });

    // Subscribe to project events
    const unsubscribe = EventBus.subscribe(projectId, async (event) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.payload),
      });
    });

    // Keep-alive ping
    const pingInterval = setInterval(async () => {
      await stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }, 30000);

    // Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  });
};
```

## Configuration

```typescript
// src/config/index.ts
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export const ConfigSchema = z.object({
  // Server
  port: z.number().default(4096),
  host: z.string().default('0.0.0.0'),

  // Data storage
  dataDir: z.string().default('~/.iris'),

  // Security
  jwtSecret: z.string().optional(),
  corsOrigins: z.array(z.string()).default([]),

  // Rate limiting
  rateLimit: z.object({
    windowMs: z.number().default(60000),
    max: z.number().default(100),
  }).default({}),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<Config> {
  const configPath = process.env.IRIS_CONFIG || '~/.iris/config.json';
  const expandedPath = configPath.replace('~', process.env.HOME!);

  let fileConfig = {};
  if (fs.existsSync(expandedPath)) {
    fileConfig = JSON.parse(fs.readFileSync(expandedPath, 'utf-8'));
  }

  // Environment overrides
  const envConfig: Partial<Config> = {};
  if (process.env.IRIS_PORT) envConfig.port = parseInt(process.env.IRIS_PORT);
  if (process.env.IRIS_HOST) envConfig.host = process.env.IRIS_HOST;
  if (process.env.IRIS_DATA_DIR) envConfig.dataDir = process.env.IRIS_DATA_DIR;
  if (process.env.IRIS_JWT_SECRET) envConfig.jwtSecret = process.env.IRIS_JWT_SECRET;

  return ConfigSchema.parse({ ...fileConfig, ...envConfig });
}
```

## Graceful Shutdown

```typescript
// src/server/shutdown.ts
import { EventBus } from '../bus';
import { DatabaseManager } from '../database';
import { WebSocketManager } from './websocket/manager';

const shutdownHandlers: Array<() => Promise<void>> = [];

export function registerShutdownHandler(handler: () => Promise<void>) {
  shutdownHandlers.push(handler);
}

export async function gracefulShutdown() {
  console.log('Starting graceful shutdown...');

  // Notify all connected clients
  await WebSocketManager.broadcastAll({
    type: 'server.shutdown',
    payload: { reason: 'Server is restarting' },
  });

  // Close all WebSocket connections
  await WebSocketManager.closeAll();

  // Run registered shutdown handlers
  for (const handler of shutdownHandlers) {
    try {
      await handler();
    } catch (err) {
      console.error('Shutdown handler error:', err);
    }
  }

  // Close all database connections
  await DatabaseManager.closeAll();

  console.log('Shutdown complete');
}

// Register signal handlers
process.on('SIGINT', async () => {
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await gracefulShutdown();
  process.exit(0);
});
```
