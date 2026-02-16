/**
 * Task Tool
 *
 * Enables agents to spawn sub-agents to handle complex, multi-step tasks.
 * Sub-agents run in their own sessions (linked via parentId) and can have
 * different configurations, tools, and permissions than the parent.
 *
 * Use cases:
 * - Delegate exploration to a read-only agent
 * - Run parallel research tasks
 * - Isolate risky operations in sandboxed sub-agents
 */

import { z } from "zod";
import { defineTool } from "./types.ts";

/**
 * Task tool parameters schema
 */
export const TaskParamsSchema = z.object({
  /**
   * A short description of what this task will accomplish (3-5 words)
   */
  description: z.string().min(1).max(100),

  /**
   * The prompt/instructions for the sub-agent to execute
   */
  prompt: z.string().min(1).max(50000),

  /**
   * The type of sub-agent to use for this task.
   * - "default": Full-featured agent with all tools
   * - "explore": Read-only agent for codebase exploration
   * - "plan": Planning agent for designing implementations
   * - Custom agent names are also supported
   */
  subagent_type: z.string().default("default"),

  /**
   * Maximum number of turns (LLM calls) the sub-agent can make.
   * Default varies by agent type.
   */
  max_turns: z.number().int().positive().max(50).optional(),

  /**
   * Optional model to use for this sub-agent.
   * If not specified, uses the agent's default or inherits from parent.
   */
  model: z.enum(["sonnet", "opus", "haiku"]).optional(),

  /**
   * Whether to run this task in the background.
   * If true, returns immediately with a task ID that can be checked later.
   */
  run_in_background: z.boolean().default(false),

  /**
   * Optional task ID to resume. If provided, continues from previous execution.
   */
  resume: z.string().optional(),
});

export type TaskParams = z.infer<typeof TaskParamsSchema>;

/**
 * Task result returned to the parent agent
 */
export interface TaskResult {
  /** The sub-agent session ID */
  sessionId: string;
  /** Final response from the sub-agent */
  response: string;
  /** Whether the task completed successfully */
  success: boolean;
  /** Error message if the task failed */
  error?: string;
  /** Usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Cost incurred by this task */
  cost?: number;
}

/**
 * Map model aliases to actual model IDs
 */
const MODEL_ALIASES: Record<string, { providerId: string; modelId: string }> = {
  sonnet: { providerId: "anthropic", modelId: "claude-sonnet-4-20250514" },
  opus: { providerId: "anthropic", modelId: "claude-opus-4-20250514" },
  haiku: { providerId: "anthropic", modelId: "claude-3-5-haiku-20241022" },
};

/**
 * Default max turns by agent type
 */
const DEFAULT_MAX_TURNS: Record<string, number> = {
  default: 25,
  explore: 15,
  plan: 20,
};

/**
 * Task tool definition
 *
 * Note: The actual execution is handled by the orchestrator which has access
 * to the database and can create child sessions. This tool definition provides
 * the schema and basic validation.
 */
export const taskTool = defineTool("task", {
  description: `Launch a sub-agent to handle complex, multi-step tasks autonomously.

Use this tool when:
- A task requires multiple exploration or research steps
- You want to delegate work to a specialized agent (explore, plan)
- The task would benefit from parallel execution
- You need to isolate risky operations

Available sub-agent types:
- "default": Full-featured agent with all tools (read, write, edit, bash, glob, grep)
- "explore": Read-only agent for codebase exploration (read, glob, grep only)
- "plan": Planning agent for designing implementations before coding

The sub-agent runs in its own session and returns results when complete.`,

  parameters: TaskParamsSchema,

  execute: async (args, context) => {
    // This is a placeholder implementation
    // The actual execution happens in the orchestrator which:
    // 1. Creates a child session
    // 2. Resolves the agent configuration
    // 3. Runs the sub-agent
    // 4. Returns the result

    // The orchestrator intercepts task tool calls and handles them specially
    // This execute function should never actually be called directly

    return {
      title: `Task: ${args.description}`,
      output: JSON.stringify({
        error: "Task tool must be executed by the orchestrator",
        description: args.description,
        subagent_type: args.subagent_type,
      }),
      success: false,
    };
  },
});

/**
 * Resolve model configuration from alias or explicit IDs
 */
export function resolveTaskModel(
  modelAlias?: string,
  parentProviderId?: string | null,
  parentModelId?: string | null
): { providerId: string; modelId: string } | null {
  // If alias provided, use it
  if (modelAlias && MODEL_ALIASES[modelAlias]) {
    return MODEL_ALIASES[modelAlias];
  }

  // Otherwise inherit from parent
  if (parentProviderId && parentModelId) {
    return { providerId: parentProviderId, modelId: parentModelId };
  }

  return null;
}

/**
 * Get the default max turns for an agent type
 */
export function getDefaultMaxTurns(agentType: string): number {
  return DEFAULT_MAX_TURNS[agentType] ?? DEFAULT_MAX_TURNS["default"] ?? 25;
}

/**
 * Validate task parameters and return normalized values
 */
export function normalizeTaskParams(params: TaskParams): {
  description: string;
  prompt: string;
  subagentType: string;
  maxTurns: number;
  model?: { providerId: string; modelId: string };
  runInBackground: boolean;
  resume?: string;
} {
  const validated = TaskParamsSchema.parse(params);

  return {
    description: validated.description,
    prompt: validated.prompt,
    subagentType: validated.subagent_type,
    maxTurns: validated.max_turns ?? getDefaultMaxTurns(validated.subagent_type),
    model: validated.model ? MODEL_ALIASES[validated.model] : undefined,
    runInBackground: validated.run_in_background,
    resume: validated.resume,
  };
}
