/**
 * Tool System Types
 *
 * Defines the interface for creating and executing tools.
 * Tools are functions that agents can call to interact with
 * the filesystem, run commands, and perform other actions.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import type { Tool } from "ai";

/**
 * Tool execution context provided to all tool execute functions
 */
export interface ToolExecutionContext {
  /** The project ID for project-scoped operations */
  projectId: string;
  /** The project's root path for file operations */
  projectPath: string;
  /** The session ID */
  sessionId: string;
  /** The message ID being processed */
  messageId: string;
  /** The user ID making the request */
  userId: string;
  /** The agent name (for memory blocks and context) */
  agentName?: string;
  /** Database connection for the project */
  db: any; // Using any to avoid circular dependency with Database type
  /** Abort signal for cancellation */
  abortSignal: AbortSignal;
  /** Update tool metadata/progress displayed to user */
  updateMetadata: (metadata: ToolMetadataUpdate) => void;
}

/**
 * Metadata update for tool progress/status
 */
export interface ToolMetadataUpdate {
  title?: string;
  description?: string;
  progress?: number; // 0-1
  data?: Record<string, unknown>;
}

/**
 * Result returned by tool execution
 */
export interface ToolExecutionResult {
  /** Title shown in UI */
  title: string;
  /** Text output for the LLM (required) */
  output: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
  /** Whether the operation succeeded */
  success?: boolean;
}

/**
 * Tool definition interface for creating tools
 *
 * The generic version is used when defining tools for full type safety.
 * The non-generic AnyToolDefinition is used for storage to avoid variance issues.
 */
export interface ToolDefinition<TParams extends z.ZodType = z.ZodType<unknown>> {
  /** Tool name (used in function calls) */
  name: string;
  /** Description for the LLM to understand what the tool does */
  description: string;
  /** Zod schema for parameter validation */
  parameters: TParams;
  /** Execute function that performs the tool's action */
  execute: (
    args: z.infer<TParams>,
    context: ToolExecutionContext
  ) => Promise<ToolExecutionResult>;
}

/**
 * Loosely typed tool definition for storage in the registry.
 * This avoids TypeScript variance issues with generic Zod types.
 */
export interface AnyToolDefinition {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: z.ZodType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

/**
 * Helper function to define a tool with type inference
 */
export function defineTool<TParams extends z.ZodType>(
  name: string,
  config: {
    description: string;
    parameters: TParams;
    execute: (
      args: z.infer<TParams>,
      context: ToolExecutionContext
    ) => Promise<ToolExecutionResult>;
  }
): ToolDefinition<TParams> {
  return {
    name,
    ...config,
  };
}

/**
 * Convert a ToolDefinition to a Vercel AI SDK Tool
 *
 * Constructs the Tool object directly using the AI SDK's expected format.
 * The inputSchema accepts Zod schemas as a FlexibleSchema type.
 */
export function toAITool(
  toolDef: AnyToolDefinition,
  context: ToolExecutionContext
): Tool {
  return {
    description: toolDef.description,
    inputSchema: toolDef.parameters,
    execute: async (args) => {
      const result = await toolDef.execute(args, context);
      // Return the output string for the LLM
      return result.output;
    },
  };
}

/**
 * Tool category for organization
 */
export type ToolCategory =
  | "filesystem"
  | "execution"
  | "search"
  | "agent"
  | "action"
  | "memory"
  | "other";

/**
 * Registered tool with metadata
 */
export interface RegisteredTool {
  definition: AnyToolDefinition;
  category: ToolCategory;
  requiresCodeExecution: boolean;
}
