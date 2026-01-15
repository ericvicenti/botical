/**
 * Agent Orchestrator
 *
 * Coordinates the full agent execution flow including:
 * - Message creation and storage
 * - Tool execution context setup
 * - LLM streaming and response processing
 * - Session and message statistics tracking
 *
 * See: docs/knowledge-base/04-patterns.md
 */

import type { Database } from "bun:sqlite";
import type { ModelMessage } from "ai";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { SessionService } from "@/services/sessions.ts";
import { ToolRegistry } from "@/tools/registry.ts";
import type { ToolExecutionContext, ToolMetadataUpdate } from "@/tools/types.ts";
import { LLM } from "./llm.ts";
import { StreamProcessor, type ProcessedEvent } from "./stream-processor.ts";
import type { ProviderId, AgentRunResult } from "./types.ts";

/**
 * Options for running an agent
 */
export interface OrchestratorRunOptions {
  /** Database connection for the project */
  db: Database;
  /** Project ID */
  projectId: string;
  /** Project filesystem path */
  projectPath: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Whether user has code execution permission */
  canExecuteCode: boolean;
  /** User message content */
  content: string;
  /** API key for the AI provider */
  apiKey: string;
  /** Provider ID */
  providerId: ProviderId;
  /** Model ID (uses provider default if not specified) */
  modelId?: string | null;
  /** Agent-specific system prompt */
  agentPrompt?: string;
  /** Maximum tool execution steps */
  maxSteps?: number;
  /** Temperature for the model */
  temperature?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Callback for processed events */
  onEvent?: (event: ProcessedEvent) => void | Promise<void>;
}

/**
 * Agent Orchestrator for running AI agents
 */
export class AgentOrchestrator {
  /**
   * Run an agent conversation turn
   */
  static async run(options: OrchestratorRunOptions): Promise<AgentRunResult> {
    const {
      db,
      projectId,
      projectPath,
      sessionId,
      userId,
      canExecuteCode,
      content,
      apiKey,
      providerId,
      modelId,
      agentPrompt,
      maxSteps = 10,
      temperature,
      abortSignal,
      onEvent,
    } = options;

    // Verify session exists
    const session = SessionService.getByIdOrThrow(db, sessionId);

    // Use model from options, session, or provider default
    const effectiveModelId = modelId ?? session.modelId ?? null;

    // Create user message
    const userMessage = MessageService.create(db, {
      sessionId,
      role: "user",
    });

    // Create user message text part
    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId,
      type: "text",
      content: { text: content },
    });

    // Update session message count
    SessionService.updateStats(db, sessionId, { messageCount: 1 });

    // Create assistant message
    const assistantMessage = MessageService.create(db, {
      sessionId,
      role: "assistant",
      parentId: userMessage.id,
      providerId,
      modelId: effectiveModelId,
    });

    // Build conversation history
    const messages = this.buildMessages(db, sessionId, content);

    // Create tool execution context
    const toolContext = this.createToolContext({
      projectId,
      projectPath,
      sessionId,
      messageId: assistantMessage.id,
      userId,
      abortSignal,
    });

    // Get tools
    const tools = ToolRegistry.toAITools(toolContext, {
      canExecuteCode,
    });

    // Build system prompt
    const systemPrompt = LLM.buildSystemPrompt({
      agentPrompt,
    });

    // Create stream processor
    const processor = new StreamProcessor({
      db,
      sessionId,
      messageId: assistantMessage.id,
      providerId,
      modelId: effectiveModelId ?? "unknown",
      onEvent,
    });

    try {
      // Run the LLM
      const result = await LLM.streamCompletion({
        providerId,
        modelId: effectiveModelId,
        apiKey,
        system: systemPrompt,
        messages,
        tools,
        temperature,
        abortSignal,
        onStreamEvent: async (event) => {
          await processor.process(event);
        },
      });

      return {
        messageId: assistantMessage.id,
        finishReason: this.mapFinishReason(result.finishReason),
        usage: result.usage,
        cost: this.calculateCost(providerId, effectiveModelId, result.usage),
      };
    } catch (error) {
      // Mark message as errored
      MessageService.setError(db, assistantMessage.id, {
        type: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Build messages array from session history
   */
  private static buildMessages(
    db: Database,
    sessionId: string,
    newUserContent: string
  ): ModelMessage[] {
    const messages: ModelMessage[] = [];

    // Get existing messages from session
    const existingMessages = MessageService.listBySession(db, sessionId);

    for (const msg of existingMessages) {
      // Skip the message we just created (it's in the DB but shouldn't be in history yet)
      if (msg.role === "user") {
        const parts = MessagePartService.listByMessage(db, msg.id);
        const textParts = parts.filter((p) => p.type === "text");
        if (textParts.length > 0) {
          const text = textParts
            .map((p) => (p.content as { text: string }).text)
            .join("\n");
          messages.push({
            role: "user",
            content: text,
          });
        }
      } else if (msg.role === "assistant") {
        const parts = MessagePartService.listByMessage(db, msg.id);
        const textParts = parts.filter((p) => p.type === "text");
        if (textParts.length > 0) {
          const text = textParts
            .map((p) => (p.content as { text: string }).text)
            .join("");
          if (text) {
            messages.push({
              role: "assistant",
              content: text,
            });
          }
        }
      }
    }

    // Add the new user message (not from DB, as we want fresh content)
    // Note: The DB already has the user message, but we use the raw content
    // to avoid any processing artifacts
    messages.push({
      role: "user",
      content: newUserContent,
    });

    return messages;
  }

  /**
   * Create tool execution context
   */
  private static createToolContext(options: {
    projectId: string;
    projectPath: string;
    sessionId: string;
    messageId: string;
    userId: string;
    abortSignal?: AbortSignal;
  }): ToolExecutionContext {
    const metadataCallbacks: Map<string, ToolMetadataUpdate> = new Map();

    return {
      projectId: options.projectId,
      projectPath: options.projectPath,
      sessionId: options.sessionId,
      messageId: options.messageId,
      userId: options.userId,
      abortSignal: options.abortSignal ?? new AbortController().signal,
      updateMetadata: (metadata: ToolMetadataUpdate) => {
        // Store metadata for potential UI updates
        // In a full implementation, this would broadcast to connected clients
        metadataCallbacks.set(options.messageId, metadata);
      },
    };
  }

  /**
   * Map finish reason string to typed enum
   */
  private static mapFinishReason(
    reason: string
  ): "stop" | "tool-calls" | "length" | "error" {
    switch (reason) {
      case "stop":
        return "stop";
      case "tool-calls":
        return "tool-calls";
      case "length":
        return "length";
      default:
        return "stop";
    }
  }

  /**
   * Calculate cost for usage
   */
  private static calculateCost(
    providerId: ProviderId,
    modelId: string | null,
    usage: { inputTokens: number; outputTokens: number }
  ): number {
    if (!modelId) return 0;

    // Import dynamically to avoid circular dependency
    const { ProviderRegistry } = require("./providers.ts");
    return ProviderRegistry.calculateCost(
      providerId,
      modelId,
      usage.inputTokens,
      usage.outputTokens
    );
  }
}
