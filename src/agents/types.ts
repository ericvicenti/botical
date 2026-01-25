/**
 * Agent System Types
 *
 * Core type definitions for the AI agent system.
 * See: docs/knowledge-base/02-data-model.md#agent
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";

/**
 * Supported AI providers
 */
export const ProviderIds = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
} as const;

export type ProviderId = (typeof ProviderIds)[keyof typeof ProviderIds];

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  defaultModel: string;
  models: ModelConfig[];
}

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  costPer1kInput: number; // USD
  costPer1kOutput: number; // USD
}

/**
 * Tool execution context provided to all tool execute functions
 */
export interface ToolContext {
  /** The project ID for project-scoped operations */
  projectId: string;
  /** The session ID */
  sessionId: string;
  /** The message ID being processed */
  messageId: string;
  /** The user ID making the request */
  userId: string;
  /** The project's root path for file operations */
  projectPath: string;
  /** Abort signal for cancellation */
  abortSignal: AbortSignal;
  /** Update tool metadata/progress displayed to user */
  updateMetadata: (metadata: ToolMetadata) => void;
}

/**
 * Metadata for tool progress/status updates
 */
export interface ToolMetadata {
  title?: string;
  description?: string;
  progress?: number; // 0-1
  data?: Record<string, unknown>;
}

/**
 * Result returned by tool execution
 */
export interface ToolResult {
  /** Title shown in UI */
  title: string;
  /** Text output for the LLM */
  output: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Tool definition schema for validation
 */
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.instanceof(z.ZodType as unknown as new () => z.ZodType),
});

/**
 * Agent configuration schema
 */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mode: z.enum(["primary", "subagent", "all"]),
  hidden: z.boolean().default(false),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  temperature: z.number().min(0).max(2).nullable(),
  topP: z.number().min(0).max(1).nullable(),
  maxSteps: z.number().positive().nullable(),
  prompt: z.string().nullable(),
  tools: z.array(z.string()).default([]),
  isBuiltin: z.boolean().default(false),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Session status
 */
export const SessionStatusSchema = z.enum(["active", "archived", "deleted"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Message role
 */
export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * Message finish reason
 */
export const FinishReasonSchema = z.enum([
  "stop",
  "tool-calls",
  "length",
  "error",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

/**
 * Message part types
 */
export const PartTypeSchema = z.enum([
  "text",
  "reasoning",
  "tool-call",
  "tool-result",
  "file",
  "step-start",
  "step-finish",
]);
export type PartType = z.infer<typeof PartTypeSchema>;

/**
 * Tool status for tool parts
 */
export const ToolStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "error",
]);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

/**
 * Stream event types from AI SDK
 */
export type StreamEventType =
  | "text-delta"
  | "tool-call"
  | "tool-call-streaming-start"
  | "tool-call-delta"
  | "tool-result"
  | "step-start"
  | "step-finish"
  | "finish"
  | "error";

/**
 * Options for running an agent
 */
export interface AgentRunOptions {
  /** The project ID */
  projectId: string;
  /** The session ID */
  sessionId: string;
  /** The user message content */
  content: string;
  /** The user ID */
  userId: string;
  /** Optional specific agent to use */
  agent?: string;
  /** Optional provider override */
  providerId?: ProviderId;
  /** Optional model override */
  modelId?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Result of an agent run
 */
export interface AgentRunResult {
  /** The assistant message ID */
  messageId: string;
  /** The finish reason */
  finishReason: FinishReason;
  /** Total tokens used */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Estimated cost in USD */
  cost: number;
}
