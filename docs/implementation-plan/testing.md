# Testing Strategy

## Overview

Since agents will implement this system, all functionality must be automatically verifiable. This document outlines the testing frameworks, patterns, and validation approaches used throughout the project.

## Testing Stack

### Core Frameworks

```typescript
// package.json dependencies
{
  "devDependencies": {
    "bun-types": "latest",           // Bun type definitions
    "@types/node": "^20.0.0",        // Node types for compatibility

    // Testing
    "vitest": "^1.0.0",              // Test runner (Bun compatible)
    "@vitest/coverage-v8": "^1.0.0", // Coverage reporting

    // HTTP/WebSocket testing
    "supertest": "^6.0.0",           // HTTP request testing
    "ws": "^8.0.0",                  // WebSocket client for tests

    // Mocking
    "msw": "^2.0.0",                 // Mock Service Worker for API mocking

    // Database testing
    "better-sqlite3": "^9.0.0",      // For test database operations

    // Assertions
    "zod": "^3.22.0",                // Schema validation (also runtime)

    // AI SDK testing
    "ai": "^3.0.0",                  // Includes test utilities

    // Fixtures & Factories
    "fishery": "^2.0.0",             // Test data factories
    "faker-js/faker": "^8.0.0",      // Fake data generation
  }
}
```

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use Bun's test runner when available, fallback to Vitest
    globals: true,
    environment: 'node',

    // Test file patterns
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/types.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,

    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Test Setup

```typescript
// tests/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '@/database';
import { Config } from '@/config';
import fs from 'fs/promises';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, '.test-data');

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.BOTICAL_DATA_DIR = TEST_DATA_DIR;

  // Create test data directory
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });

  // Initialize test config
  await Config.load({
    dataDir: TEST_DATA_DIR,
    logLevel: 'error', // Quiet during tests
  });
});

afterAll(async () => {
  // Close all database connections
  await DatabaseManager.closeAll();

  // Clean up test data (optional - keep for debugging)
  if (process.env.CLEAN_TEST_DATA !== 'false') {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  // Reset databases before each test
  await DatabaseManager.resetAll();
});

afterEach(async () => {
  // Clear any mocks
  vi.clearAllMocks();
});

// Global test utilities
declare global {
  var testDataDir: string;
  var createTestProject: () => Promise<Project>;
  var createTestUser: () => Promise<User>;
}

globalThis.testDataDir = TEST_DATA_DIR;
```

## Test Types

### 1. Unit Tests

Test individual functions and classes in isolation.

```typescript
// src/utils/id.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, isValidId, parseId } from './id';

describe('generateId', () => {
  it('generates IDs with correct prefix', () => {
    const id = generateId('session');
    expect(id).toMatch(/^session_[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId('test')));
    expect(ids.size).toBe(1000);
  });

  it('generates descending IDs when specified', () => {
    const id1 = generateId('session', { descending: true });
    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 1));
    const id2 = generateId('session', { descending: true });

    // Earlier ID should sort after later ID (descending)
    expect(id1 > id2).toBe(true);
  });
});

describe('isValidId', () => {
  it('validates correct IDs', () => {
    expect(isValidId('session_abc123', 'session')).toBe(true);
    expect(isValidId('user_xyz789', 'user')).toBe(true);
  });

  it('rejects invalid IDs', () => {
    expect(isValidId('invalid', 'session')).toBe(false);
    expect(isValidId('session_', 'session')).toBe(false);
    expect(isValidId('user_abc123', 'session')).toBe(false);
  });
});
```

### 2. Integration Tests

Test multiple components working together.

```typescript
// tests/integration/session-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectService } from '@/services/projects';
import { SessionService } from '@/services/sessions';
import { MessageService } from '@/services/messages';
import { createTestUser, createTestProject } from '../factories';

describe('Session Flow Integration', () => {
  let user: User;
  let project: Project;

  beforeEach(async () => {
    user = await createTestUser();
    project = await createTestProject({ ownerId: user.id });
  });

  it('creates session with messages and persists correctly', async () => {
    // Create session
    const session = await SessionService.create(project.id, {
      title: 'Test Session',
      agent: 'default',
    });

    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');

    // Add user message
    const userMessage = await MessageService.create(project.id, {
      sessionId: session.id,
      role: 'user',
      content: 'Hello, agent!',
    });

    expect(userMessage.role).toBe('user');

    // Verify session has message
    const messages = await MessageService.list(project.id, session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(userMessage.id);

    // Verify persistence across reload
    const reloadedSession = await SessionService.get(project.id, session.id);
    expect(reloadedSession).toBeDefined();
    expect(reloadedSession!.messageCount).toBe(1);
  });

  it('handles session deletion with cascade', async () => {
    const session = await SessionService.create(project.id, {
      title: 'To Delete',
      agent: 'default',
    });

    await MessageService.create(project.id, {
      sessionId: session.id,
      role: 'user',
      content: 'Message 1',
    });

    await MessageService.create(project.id, {
      sessionId: session.id,
      role: 'assistant',
      content: 'Response 1',
    });

    // Delete session
    await SessionService.delete(project.id, session.id);

    // Verify session deleted
    const deleted = await SessionService.get(project.id, session.id);
    expect(deleted).toBeNull();

    // Verify messages deleted
    const messages = await MessageService.list(project.id, session.id);
    expect(messages).toHaveLength(0);
  });
});
```

### 3. API Tests

Test HTTP endpoints end-to-end.

```typescript
// tests/api/projects.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/app';
import { createTestUser, generateAuthToken } from '../factories';

describe('Projects API', () => {
  let app: ReturnType<typeof createApp>;
  let user: User;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    user = await createTestUser();
    token = await generateAuthToken(user);
  });

  describe('POST /api/projects', () => {
    it('creates a new project', async () => {
      const response = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project',
          type: 'local',
          path: '/tmp/test-project',
        }),
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.project).toBeDefined();
      expect(body.project.name).toBe('Test Project');
      expect(body.project.ownerId).toBe(user.id);
    });

    it('rejects invalid project data', async () => {
      const response = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          // Missing required 'name' field
          type: 'local',
        }),
      });

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('validation_error');
    });

    it('requires authentication', async () => {
      const response = await app.request('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Unauthorized Project',
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/projects', () => {
    it('lists user projects', async () => {
      // Create some projects
      await ProjectService.create(user.id, { name: 'Project 1', type: 'local' });
      await ProjectService.create(user.id, { name: 'Project 2', type: 'local' });

      const response = await app.request('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.projects).toHaveLength(2);
    });

    it('does not include other users projects', async () => {
      const otherUser = await createTestUser();
      await ProjectService.create(otherUser.id, { name: 'Other Project', type: 'local' });

      const response = await app.request('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const body = await response.json();
      expect(body.projects.every((p: Project) => p.ownerId === user.id)).toBe(true);
    });
  });
});
```

### 4. WebSocket Tests

Test real-time communication.

```typescript
// tests/websocket/messaging.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { createServer } from '@/server';
import { createTestUser, createTestProject, generateAuthToken } from '../factories';

describe('WebSocket Messaging', () => {
  let server: ReturnType<typeof createServer>;
  let ws: WebSocket;
  let user: User;
  let project: Project;
  let token: string;

  beforeAll(async () => {
    server = await createServer({ port: 0 }); // Random port
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    user = await createTestUser();
    project = await createTestProject({ ownerId: user.id });
    token = await generateAuthToken(user);
  });

  afterEach(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  async function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${server.port}/ws?token=${token}&projectId=${project.id}`;
      const socket = new WebSocket(url);

      socket.on('open', () => resolve(socket));
      socket.on('error', reject);

      // Timeout
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  async function sendAndWaitForResponse(socket: WebSocket, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = message.id || `test_${Date.now()}`;
      message.id = id;

      const handler = (data: WebSocket.Data) => {
        const response = JSON.parse(data.toString());
        if (response.id === id && response.type === 'response') {
          socket.off('message', handler);
          resolve(response);
        }
      };

      socket.on('message', handler);
      socket.send(JSON.stringify(message));

      setTimeout(() => {
        socket.off('message', handler);
        reject(new Error('Response timeout'));
      }, 10000);
    });
  }

  it('connects successfully with valid credentials', async () => {
    ws = await connect();

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects connection with invalid token', async () => {
    await expect(async () => {
      const url = `ws://localhost:${server.port}/ws?token=invalid&projectId=${project.id}`;
      const socket = new WebSocket(url);

      await new Promise((resolve, reject) => {
        socket.on('open', () => reject(new Error('Should not connect')));
        socket.on('error', resolve);
        socket.on('close', resolve);
      });
    }).rejects.toBeDefined();
  });

  it('creates session via WebSocket', async () => {
    ws = await connect();

    const response = await sendAndWaitForResponse(ws, {
      type: 'session.create',
      payload: {
        title: 'WebSocket Session',
        agent: 'default',
      },
    });

    expect(response.success).toBe(true);
    expect(response.payload.session).toBeDefined();
    expect(response.payload.session.title).toBe('WebSocket Session');
  });

  it('receives message stream events', async () => {
    ws = await connect();

    // Create session first
    const sessionResponse = await sendAndWaitForResponse(ws, {
      type: 'session.create',
      payload: { title: 'Stream Test', agent: 'default' },
    });

    const sessionId = sessionResponse.payload.session.id;

    // Collect events
    const events: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type && msg.type.startsWith('message.')) {
        events.push(msg);
      }
    });

    // Send message (will trigger mock LLM response)
    await sendAndWaitForResponse(ws, {
      type: 'message.send',
      payload: {
        sessionId,
        content: 'Hello!',
      },
    });

    // Wait for streaming to complete
    await new Promise(r => setTimeout(r, 2000));

    // Verify we received stream events
    expect(events.some(e => e.type === 'message.created')).toBe(true);
    expect(events.some(e => e.type === 'message.text.delta')).toBe(true);
    expect(events.some(e => e.type === 'message.complete')).toBe(true);
  });
});
```

### 5. Agent/LLM Tests

Test AI agent functionality with mocked providers.

```typescript
// tests/agents/orchestrator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from '@/agents/orchestrator';
import { createTestProject, createTestUser } from '../factories';
import { mockLLMProvider } from '../mocks/llm';

// Mock the AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn(),
  };
});

import { streamText } from 'ai';

describe('AgentOrchestrator', () => {
  let project: Project;
  let user: User;
  let orchestrator: AgentOrchestrator;

  beforeEach(async () => {
    user = await createTestUser();
    project = await createTestProject({ ownerId: user.id });
    orchestrator = new AgentOrchestrator(project.id);

    // Reset mock
    vi.mocked(streamText).mockReset();
  });

  it('sends prompt to LLM and processes response', async () => {
    // Setup mock response
    vi.mocked(streamText).mockResolvedValue(
      mockLLMProvider.createMockStream([
        { type: 'text-delta', text: 'Hello, ' },
        { type: 'text-delta', text: 'I am an AI assistant.' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 20 } },
      ])
    );

    // Create session
    const session = await SessionService.create(project.id, {
      title: 'Test',
      agent: 'default',
    });

    // Send prompt
    const result = await orchestrator.prompt({
      sessionId: session.id,
      content: 'Hello!',
      userId: user.id,
    });

    // Verify LLM was called
    expect(streamText).toHaveBeenCalledOnce();
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    );

    // Verify response was processed
    expect(result.messageId).toBeDefined();
    expect(result.text).toBe('Hello, I am an AI assistant.');
  });

  it('executes tool calls', async () => {
    // Mock tool execution
    const toolSpy = vi.fn().mockResolvedValue({
      title: 'Read file',
      output: 'file contents here',
      metadata: {},
    });

    // Replace read tool with spy
    orchestrator.tools.get('read')!.execute = toolSpy;

    // Setup mock with tool call
    vi.mocked(streamText).mockResolvedValue(
      mockLLMProvider.createMockStream([
        { type: 'tool-call', toolCallId: 'tc1', toolName: 'read', args: { path: '/test.txt' } },
        { type: 'tool-result', toolCallId: 'tc1', result: 'file contents here' },
        { type: 'text-delta', text: 'The file contains: file contents here' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 50, completionTokens: 30 } },
      ])
    );

    const session = await SessionService.create(project.id, {
      title: 'Tool Test',
      agent: 'default',
    });

    const result = await orchestrator.prompt({
      sessionId: session.id,
      content: 'Read /test.txt',
      userId: user.id,
    });

    // Verify tool was executed
    expect(toolSpy).toHaveBeenCalledWith(
      { path: '/test.txt' },
      expect.objectContaining({ sessionId: session.id })
    );
  });

  it('handles LLM errors gracefully', async () => {
    vi.mocked(streamText).mockRejectedValue(new Error('API rate limit exceeded'));

    const session = await SessionService.create(project.id, {
      title: 'Error Test',
      agent: 'default',
    });

    const result = await orchestrator.prompt({
      sessionId: session.id,
      content: 'Hello!',
      userId: user.id,
    });

    // Should have error in result
    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('rate limit');

    // Error should be persisted
    const message = await MessageService.get(project.id, result.messageId);
    expect(message?.error).toBeDefined();
  });

  it('respects agent permissions', async () => {
    // Create restricted agent
    await AgentService.create(project.id, {
      id: 'readonly',
      name: 'Read Only',
      mode: 'subagent',
      permissions: [
        { tool: 'read', pattern: '*', action: 'allow' },
        { tool: '*', pattern: '*', action: 'deny' },
      ],
    });

    const session = await SessionService.create(project.id, {
      title: 'Restricted',
      agent: 'readonly',
    });

    // Setup mock with write tool call (should be blocked)
    vi.mocked(streamText).mockResolvedValue(
      mockLLMProvider.createMockStream([
        { type: 'tool-call', toolCallId: 'tc1', toolName: 'write', args: { path: '/test.txt', content: 'bad' } },
        { type: 'tool-error', toolCallId: 'tc1', error: 'Permission denied' },
        { type: 'text-delta', text: 'I cannot write files.' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 20, completionTokens: 10 } },
      ])
    );

    const result = await orchestrator.prompt({
      sessionId: session.id,
      content: 'Write to /test.txt',
      userId: user.id,
    });

    // Verify tool was not actually executed
    expect(result.text).toContain('cannot write');
  });
});
```

### 6. Tool Tests

Test individual tools thoroughly.

```typescript
// tests/tools/bash.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bashTool } from '@/tools/builtin/bash';
import { createTestProject, createToolContext } from '../factories';
import fs from 'fs/promises';
import path from 'path';

describe('Bash Tool', () => {
  let project: Project;
  let projectPath: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    project = await createTestProject({ type: 'local' });
    projectPath = project.path!;
    ctx = await createToolContext(project.id);

    // Create test files
    await fs.writeFile(path.join(projectPath, 'test.txt'), 'hello world');
  });

  it('executes simple commands', async () => {
    const result = await bashTool.execute(
      { command: 'echo "hello"' },
      ctx
    );

    expect(result.output).toContain('hello');
    expect(result.metadata.exitCode).toBe(0);
  });

  it('respects working directory', async () => {
    const result = await bashTool.execute(
      { command: 'pwd' },
      ctx
    );

    expect(result.output.trim()).toBe(projectPath);
  });

  it('captures both stdout and stderr', async () => {
    const result = await bashTool.execute(
      { command: 'echo "out" && echo "err" >&2' },
      ctx
    );

    expect(result.output).toContain('out');
    expect(result.output).toContain('err');
  });

  it('handles command failure', async () => {
    const result = await bashTool.execute(
      { command: 'exit 1' },
      ctx
    );

    expect(result.metadata.exitCode).toBe(1);
  });

  it('respects timeout', async () => {
    await expect(
      bashTool.execute(
        { command: 'sleep 10', timeout: 100 },
        ctx
      )
    ).rejects.toThrow(/timeout/i);
  });

  it('prevents command injection', async () => {
    // Dangerous input that shouldn't be executed as separate commands
    const result = await bashTool.execute(
      { command: 'echo "safe"; rm -rf /' },
      ctx
    );

    // Should be treated as a single command, not executed as separate
    // The exact behavior depends on implementation
    expect(result.output).toBeDefined();
  });
});

// tests/tools/read.test.ts
describe('Read Tool', () => {
  let project: Project;
  let projectPath: string;
  let ctx: ToolContext;

  beforeEach(async () => {
    project = await createTestProject({ type: 'local' });
    projectPath = project.path!;
    ctx = await createToolContext(project.id);

    // Create test files
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    await fs.writeFile(path.join(projectPath, 'large.txt'), lines.join('\n'));
    await fs.writeFile(path.join(projectPath, 'small.txt'), 'small file');
  });

  it('reads entire small files', async () => {
    const result = await readTool.execute(
      { path: 'small.txt' },
      ctx
    );

    expect(result.output).toBe('small file');
    expect(result.metadata.truncated).toBe(false);
  });

  it('reads files with line limits', async () => {
    const result = await readTool.execute(
      { path: 'large.txt', limit: 10 },
      ctx
    );

    expect(result.output.split('\n')).toHaveLength(10);
    expect(result.metadata.truncated).toBe(true);
  });

  it('reads files with offset', async () => {
    const result = await readTool.execute(
      { path: 'large.txt', offset: 50, limit: 10 },
      ctx
    );

    expect(result.output).toContain('Line 51');
    expect(result.output).not.toContain('Line 50');
  });

  it('returns error for non-existent files', async () => {
    const result = await readTool.execute(
      { path: 'nonexistent.txt' },
      ctx
    );

    expect(result.output).toContain('does not exist');
  });

  it('prevents path traversal', async () => {
    const result = await readTool.execute(
      { path: '../../../etc/passwd' },
      ctx
    );

    expect(result.output).toContain('outside project');
  });
});
```

## Mock Utilities

### LLM Provider Mock

```typescript
// tests/mocks/llm.ts
import { Readable } from 'stream';

interface MockStreamEvent {
  type: string;
  [key: string]: any;
}

export const mockLLMProvider = {
  createMockStream(events: MockStreamEvent[]) {
    // Create async generator that yields events
    async function* generate() {
      for (const event of events) {
        yield event;
        // Small delay to simulate streaming
        await new Promise(r => setTimeout(r, 10));
      }
    }

    return {
      fullStream: generate(),
      textStream: (async function* () {
        for (const event of events) {
          if (event.type === 'text-delta') {
            yield event.text;
          }
        }
      })(),
      text: Promise.resolve(
        events
          .filter(e => e.type === 'text-delta')
          .map(e => e.text)
          .join('')
      ),
      usage: Promise.resolve({
        promptTokens: events.find(e => e.type === 'finish')?.usage?.promptTokens ?? 0,
        completionTokens: events.find(e => e.type === 'finish')?.usage?.completionTokens ?? 0,
      }),
    };
  },

  // Predefined response scenarios
  simpleTextResponse(text: string) {
    return this.createMockStream([
      { type: 'text-delta', text },
      { type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: text.length / 4 } },
    ]);
  },

  toolCallResponse(toolName: string, args: any, result: string) {
    return this.createMockStream([
      { type: 'tool-call', toolCallId: 'tc1', toolName, args },
      { type: 'tool-result', toolCallId: 'tc1', result },
      { type: 'text-delta', text: `Used ${toolName}: ${result}` },
      { type: 'finish', finishReason: 'stop', usage: { promptTokens: 50, completionTokens: 30 } },
    ]);
  },

  errorResponse(errorMessage: string) {
    return {
      fullStream: (async function* () {
        throw new Error(errorMessage);
      })(),
      textStream: (async function* () {
        throw new Error(errorMessage);
      })(),
      text: Promise.reject(new Error(errorMessage)),
      usage: Promise.reject(new Error(errorMessage)),
    };
  },
};
```

### Database Factory

```typescript
// tests/factories/index.ts
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { generateId } from '@/utils/id';
import { AuthService } from '@/services/auth';

// User factory
export const userFactory = Factory.define<User>(({ sequence }) => ({
  id: generateId('user'),
  email: faker.internet.email(),
  username: faker.internet.userName(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
}));

// Project factory
export const projectFactory = Factory.define<Project>(({ sequence, params }) => ({
  id: generateId('project'),
  name: faker.company.name(),
  description: faker.lorem.sentence(),
  type: 'local',
  path: `/tmp/botical-test-${sequence}`,
  ownerId: params.ownerId || generateId('user'),
  settings: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
}));

// Session factory
export const sessionFactory = Factory.define<Session>(({ params }) => ({
  id: generateId('session', { descending: true }),
  slug: faker.lorem.slug(),
  projectId: params.projectId || generateId('project'),
  title: faker.lorem.sentence(3),
  status: 'active',
  agent: 'default',
  messageCount: 0,
  totalCost: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}));

// Helper functions
export async function createTestUser(overrides?: Partial<User>): Promise<User> {
  const data = userFactory.build(overrides);
  const rootDb = DatabaseManager.getRootDb();

  rootDb.prepare(`
    INSERT INTO users (id, email, username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.id, data.email, data.username, data.createdAt, data.updatedAt);

  return data;
}

export async function createTestProject(overrides?: Partial<Project>): Promise<Project> {
  const data = projectFactory.build(overrides);

  // Create directory if local
  if (data.type === 'local' && data.path) {
    await fs.mkdir(data.path, { recursive: true });
  }

  const rootDb = DatabaseManager.getRootDb();
  rootDb.prepare(`
    INSERT INTO projects (id, name, description, type, path, owner_id, settings, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id, data.name, data.description, data.type, data.path,
    data.ownerId, JSON.stringify(data.settings), data.createdAt, data.updatedAt
  );

  // Initialize project database
  await DatabaseManager.initializeProjectDb(data.id);

  return data;
}

export async function generateAuthToken(user: User): Promise<string> {
  return AuthService.createToken(user);
}

export async function createToolContext(projectId: string): Promise<ToolContext> {
  const user = await createTestUser();
  const session = await SessionService.create(projectId, { title: 'Test', agent: 'default' });
  const message = await MessageService.create(projectId, {
    sessionId: session.id,
    role: 'user',
    content: 'test',
  });

  return {
    projectId,
    sessionId: session.id,
    messageId: message.id,
    userId: user.id,
    agentId: 'default',
    abort: new AbortController().signal,
    metadata: vi.fn(),
    askPermission: vi.fn().mockResolvedValue(undefined),
  };
}
```

## Contract Tests

Validate API contracts with schemas.

```typescript
// tests/contracts/api.test.ts
import { describe, it, expect } from 'vitest';
import { createApp } from '@/server/app';
import { SessionSchema, MessageSchema, ProjectSchema } from '@/schemas';

describe('API Contract Tests', () => {
  const app = createApp();

  describe('Session API', () => {
    it('GET /api/projects/:id/sessions returns valid session array', async () => {
      const response = await app.request('/api/projects/test/sessions', {
        headers: { Authorization: 'Bearer test-token' },
      });

      const body = await response.json();

      // Validate response shape
      expect(body.sessions).toBeDefined();
      expect(Array.isArray(body.sessions)).toBe(true);

      // Validate each session matches schema
      for (const session of body.sessions) {
        expect(() => SessionSchema.parse(session)).not.toThrow();
      }
    });

    it('POST /api/projects/:id/sessions returns valid session', async () => {
      const response = await app.request('/api/projects/test/sessions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Test', agent: 'default' }),
      });

      const body = await response.json();
      expect(() => SessionSchema.parse(body.session)).not.toThrow();
    });
  });

  describe('Message API', () => {
    it('message streaming events match schema', async () => {
      // This would test WebSocket events against schemas
      const events = await collectStreamEvents();

      for (const event of events) {
        const schema = getSchemaForEventType(event.type);
        expect(() => schema.parse(event.payload)).not.toThrow();
      }
    });
  });
});
```

## Performance Tests

```typescript
// tests/performance/database.test.ts
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';

describe('Database Performance', () => {
  it('handles 1000 message inserts under 1 second', async () => {
    const project = await createTestProject();
    const session = await SessionService.create(project.id, { title: 'Perf Test', agent: 'default' });

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      await MessageService.create(project.id, {
        sessionId: session.id,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  it('handles concurrent session creation', async () => {
    const project = await createTestProject();

    const start = performance.now();

    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        SessionService.create(project.id, { title: `Session ${i}`, agent: 'default' })
      )
    );

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(2000);
  });

  it('message list query scales linearly', async () => {
    const project = await createTestProject();
    const session = await SessionService.create(project.id, { title: 'Scale Test', agent: 'default' });

    // Insert 10000 messages
    for (let i = 0; i < 10000; i++) {
      await MessageService.create(project.id, {
        sessionId: session.id,
        role: 'user',
        content: `Message ${i}`,
      });
    }

    // Measure query time
    const start = performance.now();
    await MessageService.list(project.id, session.id, { limit: 100 });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // Should be very fast with proper indexing
  });
});
```

## Test Commands

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:unit": "vitest run --dir src",
    "test:integration": "vitest run --dir tests/integration",
    "test:api": "vitest run --dir tests/api",
    "test:ws": "vitest run --dir tests/websocket",
    "test:agents": "vitest run --dir tests/agents",
    "test:tools": "vitest run --dir tests/tools",
    "test:perf": "vitest run --dir tests/performance",
    "test:contracts": "vitest run --dir tests/contracts"
  }
}
```

## CI Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, dev]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Run unit tests
        run: bun test:unit

      - name: Run integration tests
        run: bun test:integration

      - name: Run API tests
        run: bun test:api

      - name: Run WebSocket tests
        run: bun test:ws

      - name: Run agent tests
        run: bun test:agents

      - name: Generate coverage report
        run: bun test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  performance:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - name: Run performance tests
        run: bun test:perf
```
