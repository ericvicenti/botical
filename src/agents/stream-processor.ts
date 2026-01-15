/**
 * Stream Processor
 *
 * Processes streaming events from the LLM and persists them to the database.
 * Handles text deltas, tool calls, and other events.
 * See: docs/knowledge-base/04-patterns.md#stream-processing-pattern
 */

import type { Database } from "bun:sqlite";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { SessionService } from "@/services/sessions.ts";
import { ProviderRegistry } from "./providers.ts";
import type { StreamEvent } from "./llm.ts";
import type { ProviderId, FinishReason } from "./types.ts";

/**
 * Options for the stream processor
 */
export interface StreamProcessorOptions {
  /** Database connection */
  db: Database;
  /** Session ID */
  sessionId: string;
  /** Message ID being processed */
  messageId: string;
  /** Provider ID for cost calculation */
  providerId: ProviderId;
  /** Model ID for cost calculation */
  modelId: string;
  /** Callback for stream events (for client broadcasting) */
  onEvent?: (event: ProcessedEvent) => void | Promise<void>;
}

/**
 * Processed event for client broadcast
 */
export type ProcessedEvent =
  | { type: "text-delta"; partId: string; text: string }
  | { type: "tool-call-start"; partId: string; toolCallId: string; toolName: string }
  | { type: "tool-call"; partId: string; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; partId: string; toolCallId: string; result: unknown }
  | { type: "step-start"; stepNumber: number }
  | { type: "step-finish"; stepNumber: number; finishReason: string }
  | { type: "finish"; finishReason: FinishReason; cost: number; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; error: string };

/**
 * Stream Processor class for handling and persisting LLM stream events
 */
export class StreamProcessor {
  private db: Database;
  private sessionId: string;
  private messageId: string;
  private providerId: ProviderId;
  private modelId: string;
  private onEvent?: (event: ProcessedEvent) => void | Promise<void>;

  // State for tracking current parts
  private currentTextPart: { id: string; text: string } | null = null;
  private toolCallParts: Map<string, string> = new Map(); // toolCallId -> partId

  constructor(options: StreamProcessorOptions) {
    this.db = options.db;
    this.sessionId = options.sessionId;
    this.messageId = options.messageId;
    this.providerId = options.providerId;
    this.modelId = options.modelId;
    this.onEvent = options.onEvent;
  }

  /**
   * Process a stream event
   */
  async process(event: StreamEvent): Promise<void> {
    switch (event.type) {
      case "text-delta":
        await this.handleTextDelta(event.text);
        break;

      case "tool-call":
        await this.handleToolCall(event.toolCallId, event.toolName, event.args);
        break;

      case "tool-result":
        await this.handleToolResult(event.toolCallId, event.result);
        break;

      case "step-start":
        await this.handleStepStart(event.stepNumber);
        break;

      case "step-finish":
        await this.handleStepFinish(event.stepNumber, event.finishReason);
        break;

      case "finish":
        await this.handleFinish(event.finishReason, event.usage);
        break;

      case "error":
        await this.handleError(event.error);
        break;
    }
  }

  /**
   * Handle text delta events
   */
  private async handleTextDelta(text: string): Promise<void> {
    // Create text part if it doesn't exist
    if (!this.currentTextPart) {
      const part = MessagePartService.create(this.db, {
        messageId: this.messageId,
        sessionId: this.sessionId,
        type: "text",
        content: { text: "" },
      });
      this.currentTextPart = { id: part.id, text: "" };
    }

    // Append text
    this.currentTextPart.text += text;
    MessagePartService.updateContent(this.db, this.currentTextPart.id, {
      text: this.currentTextPart.text,
    });

    // Emit event
    await this.onEvent?.({
      type: "text-delta",
      partId: this.currentTextPart.id,
      text,
    });
  }

  /**
   * Handle tool call events
   */
  private async handleToolCall(
    toolCallId: string,
    toolName: string,
    args: unknown
  ): Promise<void> {
    // Finalize any open text part
    this.currentTextPart = null;

    // Create tool call part
    const part = MessagePartService.create(this.db, {
      messageId: this.messageId,
      sessionId: this.sessionId,
      type: "tool-call",
      content: { args },
      toolName,
      toolCallId,
      toolStatus: "running",
    });

    this.toolCallParts.set(toolCallId, part.id);

    await this.onEvent?.({
      type: "tool-call",
      partId: part.id,
      toolCallId,
      toolName,
      args,
    });
  }

  /**
   * Handle tool result events
   */
  private async handleToolResult(
    toolCallId: string,
    result: unknown
  ): Promise<void> {
    // Create tool result part
    const part = MessagePartService.create(this.db, {
      messageId: this.messageId,
      sessionId: this.sessionId,
      type: "tool-result",
      content: { result },
      toolCallId,
      toolStatus: "completed",
    });

    // Update the tool call part status
    const toolCallPartId = this.toolCallParts.get(toolCallId);
    if (toolCallPartId) {
      MessagePartService.updateToolStatus(this.db, toolCallPartId, "completed");
    }

    await this.onEvent?.({
      type: "tool-result",
      partId: part.id,
      toolCallId,
      result,
    });
  }

  /**
   * Handle step start events
   */
  private async handleStepStart(stepNumber: number): Promise<void> {
    // Create step-start part
    MessagePartService.create(this.db, {
      messageId: this.messageId,
      sessionId: this.sessionId,
      type: "step-start",
      content: { stepNumber },
    });

    await this.onEvent?.({
      type: "step-start",
      stepNumber,
    });
  }

  /**
   * Handle step finish events
   */
  private async handleStepFinish(
    stepNumber: number,
    finishReason: string
  ): Promise<void> {
    // Reset text part for next step
    this.currentTextPart = null;

    // Create step-finish part
    MessagePartService.create(this.db, {
      messageId: this.messageId,
      sessionId: this.sessionId,
      type: "step-finish",
      content: { stepNumber, finishReason },
    });

    await this.onEvent?.({
      type: "step-finish",
      stepNumber,
      finishReason,
    });
  }

  /**
   * Handle finish events
   */
  private async handleFinish(
    finishReason: string,
    usage: { inputTokens: number; outputTokens: number }
  ): Promise<void> {
    // Calculate cost
    const cost = ProviderRegistry.calculateCost(
      this.providerId,
      this.modelId,
      usage.inputTokens,
      usage.outputTokens
    );

    // Update message with final stats
    MessageService.complete(this.db, this.messageId, {
      finishReason: this.mapFinishReason(finishReason),
      cost,
      tokensInput: usage.inputTokens,
      tokensOutput: usage.outputTokens,
    });

    // Update session stats
    SessionService.updateStats(this.db, this.sessionId, {
      messageCount: 1,
      cost,
      tokensInput: usage.inputTokens,
      tokensOutput: usage.outputTokens,
    });

    await this.onEvent?.({
      type: "finish",
      finishReason: this.mapFinishReason(finishReason),
      cost,
      usage,
    });
  }

  /**
   * Handle error events
   */
  private async handleError(error: Error): Promise<void> {
    // Mark any pending tool calls as errored
    for (const [, partId] of this.toolCallParts) {
      try {
        MessagePartService.updateToolStatus(this.db, partId, "error");
      } catch {
        // Ignore if already deleted/updated
      }
    }

    // Update message with error
    MessageService.setError(this.db, this.messageId, {
      type: error.name || "Error",
      message: error.message,
    });

    await this.onEvent?.({
      type: "error",
      error: error.message,
    });
  }

  /**
   * Map AI SDK finish reason to our enum
   */
  private mapFinishReason(reason: string): FinishReason {
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
}
