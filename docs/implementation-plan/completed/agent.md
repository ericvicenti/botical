# Agent System

## Overview

The agent system is the core of Botical, providing:
- Integration with Vercel AI SDK for LLM interactions
- Tool execution loop with streaming
- Custom agent configurations
- Sub-agent spawning for parallel tasks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  Session Manager                        │ │
│  │  • Creates/manages conversation sessions               │ │
│  │  • Tracks messages and parts                           │ │
│  │  • Handles session hierarchy (parent/child)            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   LLM Integration                       │ │
│  │  • AI SDK streamText() wrapper                         │ │
│  │  • Provider/model selection                            │ │
│  │  • System prompt construction                          │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   Tool Registry                         │ │
│  │  • Built-in tools (file, bash, web, etc.)              │ │
│  │  • Custom code tools                                   │ │
│  │  • MCP server tools                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Stream Processor                        │ │
│  │  • Handles AI SDK stream events                        │ │
│  │  • Persists message parts                              │ │
│  │  • Broadcasts to WebSocket clients                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Agent Configuration

```typescript
// src/agents/types.ts
import { z } from 'zod';

export const AgentConfig = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Mode determines where agent can be used
  mode: z.enum(['primary', 'subagent', 'all']).default('all'),

  // Model override (uses default if not specified)
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }).optional(),

  // Generation parameters
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxSteps: z.number().positive().optional(),

  // System prompt (extends base prompt)
  prompt: z.string().optional(),

  // Tool permissions
  permissions: z.array(z.object({
    tool: z.string(),       // Tool name or '*'
    pattern: z.string(),    // Pattern to match
    action: z.enum(['allow', 'deny', 'ask']),
  })).default([]),

  // Additional options passed to AI SDK
  options: z.record(z.unknown()).default({}),

  // UI settings
  color: z.string().optional(),
  hidden: z.boolean().default(false),
});

export type AgentConfig = z.infer<typeof AgentConfig>;
```

## Built-in Agents

```typescript
// src/agents/builtin.ts
import { AgentConfig } from './types';

export const BUILTIN_AGENTS: AgentConfig[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'General-purpose coding assistant',
    mode: 'primary',
    permissions: [
      { tool: '*', pattern: '*', action: 'allow' },
      { tool: 'bash', pattern: 'dangerous:*', action: 'ask' },
    ],
  },
  {
    id: 'explore',
    name: 'Explorer',
    description: 'Fast agent for exploring codebases. Use for finding files, searching code, and understanding structure.',
    mode: 'subagent',
    prompt: EXPLORE_PROMPT,
    permissions: [
      { tool: 'read', pattern: '*', action: 'allow' },
      { tool: 'glob', pattern: '*', action: 'allow' },
      { tool: 'grep', pattern: '*', action: 'allow' },
      { tool: 'bash', pattern: 'ls:*', action: 'allow' },
      { tool: '*', pattern: '*', action: 'deny' },
    ],
  },
  {
    id: 'plan',
    name: 'Planner',
    description: 'Agent for designing implementation plans. Read-only access to codebase.',
    mode: 'subagent',
    prompt: PLAN_PROMPT,
    permissions: [
      { tool: 'read', pattern: '*', action: 'allow' },
      { tool: 'glob', pattern: '*', action: 'allow' },
      { tool: 'grep', pattern: '*', action: 'allow' },
      { tool: 'write', pattern: '.botical/plans/*.md', action: 'allow' },
      { tool: '*', pattern: '*', action: 'deny' },
    ],
  },
];
```

## Agent Registry

```typescript
// src/agents/registry.ts
import { AgentConfig } from './types';
import { BUILTIN_AGENTS } from './builtin';
import { DatabaseManager } from '../database';

export class AgentRegistry {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async list(): Promise<AgentConfig[]> {
    const db = DatabaseManager.getProjectDb(this.projectId);
    const customAgents = db.prepare('SELECT * FROM agents').all()
      .map(row => AgentConfig.parse(JSON.parse(row.config)));

    // Merge built-in with custom (custom overrides built-in)
    const agentMap = new Map<string, AgentConfig>();

    for (const agent of BUILTIN_AGENTS) {
      agentMap.set(agent.id, { ...agent, isBuiltin: true });
    }

    for (const agent of customAgents) {
      agentMap.set(agent.id, agent);
    }

    return Array.from(agentMap.values())
      .filter(a => !a.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(agentId: string): Promise<AgentConfig | null> {
    // Check custom agents first
    const db = DatabaseManager.getProjectDb(this.projectId);
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

    if (row) {
      return AgentConfig.parse(JSON.parse(row.config));
    }

    // Fall back to built-in
    return BUILTIN_AGENTS.find(a => a.id === agentId) || null;
  }

  async create(config: AgentConfig): Promise<AgentConfig> {
    const db = DatabaseManager.getProjectDb(this.projectId);
    db.prepare(`
      INSERT INTO agents (id, name, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(config.id, config.name, JSON.stringify(config), Date.now(), Date.now());

    return config;
  }

  async update(agentId: string, updates: Partial<AgentConfig>): Promise<AgentConfig> {
    const existing = await this.get(agentId);
    if (!existing) throw new Error('Agent not found');

    const updated = { ...existing, ...updates, id: agentId };
    const db = DatabaseManager.getProjectDb(this.projectId);

    db.prepare(`
      UPDATE agents SET name = ?, config = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, JSON.stringify(updated), Date.now(), agentId);

    return updated;
  }
}
```

## Tool System

### Tool Definition Interface

```typescript
// src/tools/types.ts
import { z } from 'zod';

export interface ToolContext {
  sessionId: string;
  messageId: string;
  agentId: string;
  projectId: string;
  userId: string;
  abort: AbortSignal;
  // Update tool execution metadata
  metadata(input: { title?: string; data?: unknown }): void;
  // Request permission for an action
  askPermission(request: PermissionRequest): Promise<void>;
}

export interface ToolResult {
  title: string;
  output: string;
  metadata?: Record<string, unknown>;
  attachments?: FileAttachment[];
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  id: string;
  description: string;
  parameters: T;
  execute(args: z.infer<T>, ctx: ToolContext): Promise<ToolResult>;
}

export function defineTool<T extends z.ZodType>(
  id: string,
  config: Omit<ToolDefinition<T>, 'id'>
): ToolDefinition<T> {
  return { id, ...config };
}
```

### Built-in Tools

```typescript
// src/tools/builtin/read.ts
import { defineTool } from '../types';
import { z } from 'zod';
import { FileService } from '../../services/files';

export const readTool = defineTool('read', {
  description: 'Read the contents of a file',
  parameters: z.object({
    path: z.string().describe('Path to the file to read'),
    offset: z.number().optional().describe('Line number to start from'),
    limit: z.number().optional().describe('Number of lines to read'),
  }),
  async execute({ path, offset, limit }, ctx) {
    const content = await FileService.read(ctx.projectId, path, { offset, limit });

    if (!content) {
      return {
        title: `File not found: ${path}`,
        output: `Error: File "${path}" does not exist`,
      };
    }

    return {
      title: path,
      output: content.text,
      metadata: {
        path,
        lines: content.lineCount,
        truncated: content.truncated,
      },
    };
  },
});

// src/tools/builtin/write.ts
export const writeTool = defineTool('write', {
  description: 'Write content to a file',
  parameters: z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write'),
  }),
  async execute({ path, content }, ctx) {
    await ctx.askPermission({
      tool: 'write',
      action: path,
      message: `Write to ${path}`,
    });

    await FileService.write(ctx.projectId, path, content, {
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
    });

    return {
      title: `Wrote ${path}`,
      output: `Successfully wrote ${content.length} characters to ${path}`,
      metadata: { path, size: content.length },
    };
  },
});

// src/tools/builtin/bash.ts
export const bashTool = defineTool('bash', {
  description: 'Execute a bash command',
  parameters: z.object({
    command: z.string().describe('The command to execute'),
    cwd: z.string().optional().describe('Working directory'),
    timeout: z.number().optional().describe('Timeout in milliseconds'),
  }),
  async execute({ command, cwd, timeout }, ctx) {
    await ctx.askPermission({
      tool: 'bash',
      action: command,
      message: `Execute: ${command}`,
    });

    const projectPath = await ProjectService.getPath(ctx.projectId);
    const workingDir = cwd ? path.resolve(projectPath, cwd) : projectPath;

    const result = await $`bash -c ${command}`
      .cwd(workingDir)
      .timeout(timeout || 120000)
      .quiet()
      .nothrow();

    return {
      title: command.slice(0, 50),
      output: result.stdout.toString() + result.stderr.toString(),
      metadata: {
        exitCode: result.exitCode,
        command,
        cwd: workingDir,
      },
    };
  },
});

// src/tools/builtin/task.ts
export const taskTool = defineTool('task', {
  description: 'Spawn a sub-agent to handle a complex task',
  parameters: z.object({
    description: z.string().describe('Short description of the task'),
    prompt: z.string().describe('Detailed instructions for the sub-agent'),
    agentId: z.string().describe('ID of the agent to use'),
  }),
  async execute({ description, prompt, agentId }, ctx) {
    const agent = await AgentRegistry.get(ctx.projectId, agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);

    // Create child session
    const childSession = await SessionService.create(ctx.projectId, {
      parentId: ctx.sessionId,
      title: description,
      agent: agentId,
    });

    ctx.metadata({
      title: description,
      data: { sessionId: childSession.id },
    });

    // Run the sub-agent
    const result = await AgentOrchestrator.prompt(ctx.projectId, {
      sessionId: childSession.id,
      content: prompt,
      userId: ctx.userId,
    });

    return {
      title: description,
      output: result.text + `\n\n<task_metadata>\nsession_id: ${childSession.id}\n</task_metadata>`,
      metadata: {
        sessionId: childSession.id,
        toolCalls: result.toolCalls.length,
      },
    };
  },
});
```

### Tool Registry

```typescript
// src/tools/registry.ts
import { ToolDefinition } from './types';
import * as builtinTools from './builtin';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    // Register built-in tools
    for (const tool of Object.values(builtinTools)) {
      this.register(tool);
    }
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  // Convert to AI SDK tool format
  toAISDKTools(filter?: (tool: ToolDefinition) => boolean): Record<string, Tool> {
    const result: Record<string, Tool> = {};

    for (const [id, tool] of this.tools) {
      if (filter && !filter(tool)) continue;

      result[id] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
          // This will be wrapped with context by the orchestrator
          throw new Error('Direct execution not supported');
        },
      };
    }

    return result;
  }
}
```

## Custom Code Tools

```typescript
// src/tools/custom.ts
import { z } from 'zod';
import { ToolDefinition, ToolContext, ToolResult } from './types';

export const CustomToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.object({
    type: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
  })),
  code: z.string(), // TypeScript code
});

export type CustomToolConfig = z.infer<typeof CustomToolSchema>;

export async function loadCustomTool(config: CustomToolConfig): Promise<ToolDefinition> {
  // Convert parameters to Zod schema
  const schemaFields: Record<string, z.ZodType> = {};
  for (const [name, param] of Object.entries(config.parameters)) {
    let field: z.ZodType;
    switch (param.type) {
      case 'string': field = z.string(); break;
      case 'number': field = z.number(); break;
      case 'boolean': field = z.boolean(); break;
      case 'array': field = z.array(z.unknown()); break;
      default: field = z.unknown();
    }
    if (param.description) field = field.describe(param.description);
    if (!param.required) field = field.optional();
    schemaFields[name] = field;
  }

  const parameters = z.object(schemaFields);

  // Create sandboxed execution function
  const execute = async (args: z.infer<typeof parameters>, ctx: ToolContext): Promise<ToolResult> => {
    // Create a sandboxed environment for the tool
    const sandbox = createToolSandbox(ctx);

    // Execute the code
    const fn = new Function('args', 'ctx', 'sandbox', `
      const { fs, fetch, exec } = sandbox;
      ${config.code}
    `);

    const result = await fn(args, ctx, sandbox);

    return {
      title: config.name,
      output: typeof result === 'string' ? result : JSON.stringify(result),
      metadata: { customTool: config.id },
    };
  };

  return {
    id: config.id,
    description: config.description,
    parameters,
    execute,
  };
}

function createToolSandbox(ctx: ToolContext) {
  return {
    // Sandboxed filesystem operations (scoped to project)
    fs: {
      read: (path: string) => FileService.read(ctx.projectId, path),
      write: (path: string, content: string) => FileService.write(ctx.projectId, path, content),
      exists: (path: string) => FileService.exists(ctx.projectId, path),
      list: (path: string) => FileService.list(ctx.projectId, path),
    },
    // Sandboxed fetch (with rate limiting)
    fetch: createRateLimitedFetch(),
    // Sandboxed exec (with restrictions)
    exec: createRestrictedExec(ctx.projectId),
  };
}
```

## LLM Integration

```typescript
// src/agents/llm.ts
import { streamText, wrapLanguageModel, type Tool, type ModelMessage } from 'ai';
import { ProviderRegistry } from '../providers';
import { AgentConfig } from './types';
import { ToolRegistry } from '../tools/registry';

export interface StreamInput {
  sessionId: string;
  messages: ModelMessage[];
  agent: AgentConfig;
  model: { providerId: string; modelId: string };
  tools: Record<string, Tool>;
  system: string[];
  abort: AbortSignal;
}

export async function createStream(input: StreamInput) {
  const provider = ProviderRegistry.get(input.model.providerId);
  const language = await provider.getLanguageModel(input.model.modelId);

  return streamText({
    model: wrapLanguageModel({
      model: language,
      middleware: [
        // Add any custom middleware here
      ],
    }),
    messages: [
      // System messages
      ...input.system.map(content => ({
        role: 'system' as const,
        content,
      })),
      // Conversation messages
      ...input.messages,
    ],
    tools: input.tools,
    abortSignal: input.abort,
    maxSteps: input.agent.maxSteps || 50,
    temperature: input.agent.temperature,
    topP: input.agent.topP,
    onError: (error) => {
      console.error('Stream error:', error);
    },
    // Repair malformed tool calls
    experimental_repairToolCall: async (failed) => {
      const lower = failed.toolCall.toolName.toLowerCase();
      if (lower !== failed.toolCall.toolName && input.tools[lower]) {
        return { ...failed.toolCall, toolName: lower };
      }
      return {
        ...failed.toolCall,
        toolName: 'invalid',
        input: JSON.stringify({
          error: failed.error.message,
          originalTool: failed.toolCall.toolName,
        }),
      };
    },
  });
}
```

## Stream Processor

```typescript
// src/agents/processor.ts
import { EventBus } from '../bus';
import { SessionService } from '../services/sessions';
import { MessageService } from '../services/messages';

export class StreamProcessor {
  private sessionId: string;
  private messageId: string;
  private projectId: string;
  private toolParts: Map<string, MessagePart> = new Map();

  constructor(input: {
    sessionId: string;
    messageId: string;
    projectId: string;
  }) {
    this.sessionId = input.sessionId;
    this.messageId = input.messageId;
    this.projectId = input.projectId;
  }

  async process(stream: AsyncIterable<StreamEvent>): Promise<ProcessResult> {
    for await (const event of stream) {
      switch (event.type) {
        case 'text-start':
          await this.handleTextStart();
          break;

        case 'text-delta':
          await this.handleTextDelta(event.text);
          break;

        case 'text-end':
          await this.handleTextEnd();
          break;

        case 'tool-call':
          await this.handleToolCall(event);
          break;

        case 'tool-result':
          await this.handleToolResult(event);
          break;

        case 'tool-error':
          await this.handleToolError(event);
          break;

        case 'finish-step':
          await this.handleStepFinish(event);
          break;

        case 'error':
          throw event.error;
      }
    }

    return this.getResult();
  }

  private async handleTextDelta(text: string) {
    // Persist to database
    await MessageService.appendText(this.messageId, text);

    // Broadcast to connected clients
    EventBus.publish(this.projectId, {
      type: 'message.text.delta',
      payload: {
        sessionId: this.sessionId,
        messageId: this.messageId,
        text,
      },
    });
  }

  private async handleToolCall(event: ToolCallEvent) {
    const part = await MessageService.createToolPart(this.messageId, {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      input: event.input,
      status: 'running',
    });

    this.toolParts.set(event.toolCallId, part);

    EventBus.publish(this.projectId, {
      type: 'message.tool.call',
      payload: {
        sessionId: this.sessionId,
        messageId: this.messageId,
        partId: part.id,
        toolName: event.toolName,
        input: event.input,
      },
    });
  }

  private async handleToolResult(event: ToolResultEvent) {
    const part = this.toolParts.get(event.toolCallId);
    if (!part) return;

    await MessageService.updateToolPart(part.id, {
      output: event.output,
      status: 'completed',
    });

    EventBus.publish(this.projectId, {
      type: 'message.tool.result',
      payload: {
        sessionId: this.sessionId,
        messageId: this.messageId,
        partId: part.id,
        output: event.output,
      },
    });
  }
}
```

## Agent Orchestrator

```typescript
// src/agents/orchestrator.ts
import { AgentRegistry } from './registry';
import { ToolRegistry } from '../tools/registry';
import { SessionService } from '../services/sessions';
import { MessageService } from '../services/messages';
import { createStream } from './llm';
import { StreamProcessor } from './processor';
import { PermissionService } from '../services/permissions';

export class AgentOrchestrator {
  private projectId: string;
  private agents: AgentRegistry;
  private tools: ToolRegistry;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.agents = new AgentRegistry(projectId);
    this.tools = new ToolRegistry();
  }

  async prompt(input: {
    sessionId: string;
    content: string;
    userId: string;
    attachments?: Attachment[];
  }): Promise<PromptResult> {
    const session = await SessionService.get(this.projectId, input.sessionId);
    const agent = await this.agents.get(session.agent);

    // Create user message
    const userMessage = await MessageService.create(this.projectId, {
      sessionId: input.sessionId,
      role: 'user',
      content: input.content,
      attachments: input.attachments,
    });

    // Create assistant message (will be populated during streaming)
    const assistantMessage = await MessageService.create(this.projectId, {
      sessionId: input.sessionId,
      role: 'assistant',
      parentId: userMessage.id,
      agent: agent.id,
      providerId: agent.model?.providerId || 'anthropic',
      modelId: agent.model?.modelId || 'claude-sonnet-4-20250514',
    });

    // Build message history
    const history = await MessageService.getHistory(input.sessionId);

    // Build tools with context
    const tools = this.buildTools(agent, {
      sessionId: input.sessionId,
      messageId: assistantMessage.id,
      userId: input.userId,
    });

    // Create abort controller
    const abort = new AbortController();

    // Start streaming
    const stream = await createStream({
      sessionId: input.sessionId,
      messages: history,
      agent,
      model: agent.model || { providerId: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
      tools,
      system: this.buildSystemPrompt(agent),
      abort: abort.signal,
    });

    // Process stream
    const processor = new StreamProcessor({
      sessionId: input.sessionId,
      messageId: assistantMessage.id,
      projectId: this.projectId,
    });

    return processor.process(stream.fullStream);
  }

  private buildTools(
    agent: AgentConfig,
    ctx: { sessionId: string; messageId: string; userId: string }
  ): Record<string, Tool> {
    const allTools = this.tools.list();
    const enabledTools: Record<string, Tool> = {};

    for (const tool of allTools) {
      // Check if tool is allowed for this agent
      if (!PermissionService.isToolAllowed(agent, tool.id)) {
        continue;
      }

      enabledTools[tool.id] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
          const toolCtx: ToolContext = {
            ...ctx,
            projectId: this.projectId,
            agentId: agent.id,
            abort: new AbortController().signal,
            metadata: (data) => {
              // Update tool metadata
              MessageService.updateToolMetadata(ctx.messageId, tool.id, data);
            },
            askPermission: async (request) => {
              await PermissionService.check(this.projectId, ctx.sessionId, request);
            },
          };

          return tool.execute(args, toolCtx);
        },
      };
    }

    return enabledTools;
  }

  private buildSystemPrompt(agent: AgentConfig): string[] {
    const parts: string[] = [];

    // Base system prompt
    parts.push(BASE_SYSTEM_PROMPT);

    // Agent-specific prompt
    if (agent.prompt) {
      parts.push(agent.prompt);
    }

    // Tool descriptions
    const toolDocs = this.tools.list()
      .filter(t => PermissionService.isToolAllowed(agent, t.id))
      .map(t => `- ${t.id}: ${t.description}`)
      .join('\n');
    parts.push(`Available tools:\n${toolDocs}`);

    return parts;
  }
}
```
