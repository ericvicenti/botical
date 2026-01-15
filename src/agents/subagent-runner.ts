/**
 * Sub-Agent Runner
 *
 * Handles the execution of sub-agents spawned by the task tool.
 * Creates child sessions and manages the sub-agent lifecycle.
 */

import type { Database } from "bun:sqlite";
import type { AgentConfig, AgentRunResult, ProviderId } from "./types.ts";
import { AgentRegistry } from "./registry.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { ToolRegistry } from "@/tools/registry.ts";
import type { ToolExecutionContext, ToolMetadataUpdate } from "@/tools/types.ts";
import { LLM } from "./llm.ts";
import { StreamProcessor, type ProcessedEvent } from "./stream-processor.ts";
import {
  normalizeTaskParams,
  type TaskParams,
  type TaskResult,
} from "@/tools/task.ts";

/**
 * Options for running a sub-agent
 */
export interface SubAgentRunOptions {
  /** Database connection */
  db: Database;
  /** Project ID */
  projectId: string;
  /** Project filesystem path */
  projectPath: string;
  /** Parent session ID */
  parentSessionId: string;
  /** User ID */
  userId: string;
  /** Whether user has code execution permission */
  canExecuteCode: boolean;
  /** Task parameters from the task tool */
  taskParams: TaskParams;
  /** API key for the AI provider */
  apiKey: string;
  /** Parent's provider ID (used as fallback) */
  parentProviderId: ProviderId;
  /** Parent's model ID (used as fallback) */
  parentModelId?: string | null;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Callback for processed events */
  onEvent?: (event: ProcessedEvent) => void | Promise<void>;
}

/**
 * Background task tracking
 */
interface BackgroundTask {
  sessionId: string;
  promise: Promise<TaskResult>;
  abortController: AbortController;
}

const backgroundTasks = new Map<string, BackgroundTask>();

/**
 * Sub-Agent Runner
 */
export class SubAgentRunner {
  /**
   * Run a sub-agent task
   */
  static async run(options: SubAgentRunOptions): Promise<TaskResult> {
    const {
      db,
      projectId,
      projectPath,
      parentSessionId,
      userId,
      canExecuteCode,
      taskParams,
      apiKey,
      parentProviderId,
      parentModelId,
      abortSignal,
      onEvent,
    } = options;

    // Normalize task parameters
    const params = normalizeTaskParams(taskParams);

    // Check for resume
    if (params.resume) {
      const existing = backgroundTasks.get(params.resume);
      if (existing) {
        // Wait for the existing task to complete
        return existing.promise;
      }
      // If task not found, we'll start a new one
    }

    // Resolve the agent configuration
    const agentConfig = AgentRegistry.get(db, params.subagentType);
    if (!agentConfig) {
      return {
        sessionId: "",
        response: `Unknown sub-agent type: ${params.subagentType}`,
        success: false,
        error: `Agent "${params.subagentType}" not found`,
      };
    }

    // Create child session
    const childSession = SessionService.create(db, {
      title: params.description,
      agent: params.subagentType,
      parentId: parentSessionId,
      providerId: params.model?.providerId ?? parentProviderId,
      modelId: params.model?.modelId ?? parentModelId,
    });

    // Determine provider/model
    const providerId = (params.model?.providerId ??
      agentConfig.providerId ??
      parentProviderId) as ProviderId;
    const modelId =
      params.model?.modelId ?? agentConfig.modelId ?? parentModelId ?? null;

    // Handle background execution
    if (params.runInBackground) {
      const abortController = new AbortController();
      const promise = this.executeSubAgent({
        db,
        projectId,
        projectPath,
        childSessionId: childSession.id,
        userId,
        canExecuteCode,
        prompt: params.prompt,
        agentConfig,
        maxSteps: params.maxTurns,
        apiKey,
        providerId,
        modelId,
        abortSignal: abortController.signal,
        onEvent,
      });

      backgroundTasks.set(childSession.id, {
        sessionId: childSession.id,
        promise,
        abortController,
      });

      // Clean up when done
      promise.finally(() => {
        backgroundTasks.delete(childSession.id);
      });

      return {
        sessionId: childSession.id,
        response: `Task started in background. Session ID: ${childSession.id}`,
        success: true,
      };
    }

    // Execute synchronously
    return this.executeSubAgent({
      db,
      projectId,
      projectPath,
      childSessionId: childSession.id,
      userId,
      canExecuteCode,
      prompt: params.prompt,
      agentConfig,
      maxSteps: params.maxTurns,
      apiKey,
      providerId,
      modelId,
      abortSignal,
      onEvent,
    });
  }

  /**
   * Execute the sub-agent
   */
  private static async executeSubAgent(options: {
    db: Database;
    projectId: string;
    projectPath: string;
    childSessionId: string;
    userId: string;
    canExecuteCode: boolean;
    prompt: string;
    agentConfig: AgentConfig;
    maxSteps: number;
    apiKey: string;
    providerId: ProviderId;
    modelId: string | null;
    abortSignal?: AbortSignal;
    onEvent?: (event: ProcessedEvent) => void | Promise<void>;
  }): Promise<TaskResult> {
    const {
      db,
      projectId,
      projectPath,
      childSessionId,
      userId,
      canExecuteCode,
      prompt,
      agentConfig,
      maxSteps,
      apiKey,
      providerId,
      modelId,
      abortSignal,
      onEvent,
    } = options;

    try {
      // Create user message for the sub-agent
      const userMessage = MessageService.create(db, {
        sessionId: childSessionId,
        role: "user",
      });

      MessagePartService.create(db, {
        messageId: userMessage.id,
        sessionId: childSessionId,
        type: "text",
        content: { text: prompt },
      });

      SessionService.updateStats(db, childSessionId, { messageCount: 1 });

      // Create assistant message
      const assistantMessage = MessageService.create(db, {
        sessionId: childSessionId,
        role: "assistant",
        parentId: userMessage.id,
        providerId,
        modelId,
        agent: agentConfig.name,
      });

      // Create tool execution context
      const toolContext = this.createToolContext({
        projectId,
        projectPath,
        sessionId: childSessionId,
        messageId: assistantMessage.id,
        userId,
        abortSignal,
      });

      // Resolve tools for this agent
      const availableToolNames = AgentRegistry.resolveTools(
        agentConfig,
        ToolRegistry.getNames()
      );

      // Filter out the task tool to prevent infinite recursion
      const filteredTools = availableToolNames.filter((t) => t !== "task");

      // Get tools
      const tools = ToolRegistry.toAITools(toolContext, {
        toolNames: filteredTools,
        canExecuteCode:
          canExecuteCode &&
          agentConfig.tools.some((t) => ["bash"].includes(t)),
      });

      // Build system prompt
      const systemPrompt = LLM.buildSystemPrompt({
        agentPrompt: agentConfig.prompt ?? undefined,
      });

      // Create stream processor
      const processor = new StreamProcessor({
        db,
        sessionId: childSessionId,
        messageId: assistantMessage.id,
        providerId,
        modelId: modelId ?? "unknown",
        onEvent,
      });

      // Run the LLM
      const result = await LLM.streamCompletion({
        providerId,
        modelId,
        apiKey,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        tools,
        temperature: agentConfig.temperature ?? undefined,
        topP: agentConfig.topP ?? undefined,
        abortSignal,
        onStreamEvent: async (event) => {
          await processor.process(event);
        },
      });

      // Get the final response text
      const responseParts = MessagePartService.listByMessage(
        db,
        assistantMessage.id
      );
      const textParts = responseParts.filter((p) => p.type === "text");
      const responseText = textParts
        .map((p) => (p.content as { text: string }).text)
        .join("");

      // Note: Session stats are updated by StreamProcessor on finish event
      // so we don't need to call updateStats here

      return {
        sessionId: childSessionId,
        response: responseText || "Task completed with no output",
        success: true,
        usage: result.usage,
        cost: this.calculateCost(providerId, modelId, result.usage),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        sessionId: childSessionId,
        response: `Task failed: ${errorMessage}`,
        success: false,
        error: errorMessage,
      };
    }
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
    return {
      projectId: options.projectId,
      projectPath: options.projectPath,
      sessionId: options.sessionId,
      messageId: options.messageId,
      userId: options.userId,
      abortSignal: options.abortSignal ?? new AbortController().signal,
      updateMetadata: (_metadata: ToolMetadataUpdate) => {
        // Sub-agents don't propagate metadata updates
      },
    };
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

    try {
      const { ProviderRegistry } = require("./providers.ts");
      return ProviderRegistry.calculateCost(
        providerId,
        modelId,
        usage.inputTokens,
        usage.outputTokens
      );
    } catch {
      return 0;
    }
  }

  /**
   * Get a background task by session ID
   */
  static getBackgroundTask(sessionId: string): BackgroundTask | undefined {
    return backgroundTasks.get(sessionId);
  }

  /**
   * Cancel a background task
   */
  static cancelBackgroundTask(sessionId: string): boolean {
    const task = backgroundTasks.get(sessionId);
    if (task) {
      task.abortController.abort();
      backgroundTasks.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Get all background task session IDs
   */
  static getBackgroundTaskIds(): string[] {
    return Array.from(backgroundTasks.keys());
  }
}
