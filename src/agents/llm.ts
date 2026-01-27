/**
 * LLM Wrapper
 *
 * Provides a unified interface for interacting with language models
 * using the Vercel AI SDK. Handles streaming and tool execution.
 * See: docs/knowledge-base/04-patterns.md#stream-processing-pattern
 */

import { streamText, generateText, stepCountIs, type ModelMessage, type Tool, type ToolSet } from "ai";
import { ProviderRegistry } from "./providers.ts";
import type { ProviderId } from "./types.ts";

/**
 * Options for LLM calls
 */
export interface LLMCallOptions {
  /** Provider ID */
  providerId: ProviderId;
  /** Model ID (uses provider default if not specified) */
  modelId?: string | null;
  /** API key for the provider */
  apiKey: string;
  /** System prompt */
  system?: string;
  /** Messages to send */
  messages: ModelMessage[];
  /** Tools available for the model */
  tools?: ToolSet;
  /** Maximum number of tool execution steps */
  maxSteps?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Top P (0-1) */
  topP?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Callback for each streaming event */
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>;
}

/**
 * Stream event types
 */
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string }
  | { type: "tool-call-delta"; toolCallId: string; argsText: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; result: unknown }
  | { type: "step-start"; stepNumber: number }
  | { type: "step-finish"; stepNumber: number; finishReason: string }
  | {
      type: "finish";
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { type: "error"; error: Error };

/**
 * Result from an LLM call
 */
export interface LLMCallResult {
  /** Final text response (concatenated from all steps) */
  text: string;
  /** Finish reason */
  finishReason: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Tool calls made during the response */
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: unknown;
  }>;
  /** Number of steps taken */
  steps: number;
}

/**
 * LLM class for interacting with language models
 */
export class LLM {
  /**
   * Stream a completion with tool execution support
   */
  static async streamCompletion(options: LLMCallOptions): Promise<LLMCallResult> {
    const {
      providerId,
      modelId,
      apiKey,
      system,
      messages,
      tools,
      maxSteps,
      temperature,
      topP,
      abortSignal,
      onStreamEvent,
    } = options;

    // Create the model instance
    const model = ProviderRegistry.createModel(providerId, modelId ?? null, apiKey);

    // Track results across steps
    let fullText = "";
    let finalFinishReason = "stop";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allToolCalls: LLMCallResult["toolCalls"] = [];
    let stepCount = 0;

    try {
      const result = streamText({
        model,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(maxSteps ?? 1),
        temperature,
        topP,
        abortSignal,
      });

      // Process the stream
      for await (const event of result.fullStream) {
        // Debug logging for stream events
        console.log(`[LLM] Stream event type: ${event.type}`,
          event.type === "tool-call" ? { toolName: (event as { toolName?: string }).toolName } :
          event.type === "tool-result" ? { toolCallId: (event as { toolCallId?: string }).toolCallId } :
          event.type === "finish" ? { finishReason: (event as { finishReason?: string }).finishReason } :
          event.type === "start-step" || event.type === "finish-step" ? { step: event } : {}
        );

        switch (event.type) {
          case "text-delta":
            fullText += event.text;
            await onStreamEvent?.({ type: "text-delta", text: event.text });
            break;

          case "reasoning-delta":
            // Handle reasoning/thinking tokens from Claude
            await onStreamEvent?.({ type: "reasoning-delta", text: event.text });
            break;

          case "tool-input-start": {
            // Tool call is starting - emit start event with tool info
            const toolEvent = event as { id: string; toolName: string };
            await onStreamEvent?.({
              type: "tool-call-start",
              toolCallId: toolEvent.id,
              toolName: toolEvent.toolName,
            });
            break;
          }

          case "tool-input-delta": {
            // Tool arguments are streaming - emit delta
            const deltaEvent = event as { id: string; delta: string };
            await onStreamEvent?.({
              type: "tool-call-delta",
              toolCallId: deltaEvent.id,
              argsText: deltaEvent.delta,
            });
            break;
          }

          case "tool-call": {
            // Complete tool call - get args from the tool call
            const toolArgs = (event as { input?: unknown }).input ?? {};
            await onStreamEvent?.({
              type: "tool-call",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: toolArgs,
            });
            break;
          }

          case "tool-result": {
            // Get result and args from the tool result
            const resultArgs = (event as { input?: unknown }).input ?? {};
            const resultOutput = (event as { output?: unknown }).output ?? null;
            allToolCalls.push({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: resultArgs,
              result: resultOutput,
            });
            await onStreamEvent?.({
              type: "tool-result",
              toolCallId: event.toolCallId,
              result: resultOutput,
            });
            break;
          }

          case "start-step":
            stepCount++;
            await onStreamEvent?.({ type: "step-start", stepNumber: stepCount });
            break;

          case "finish-step": {
            const stepEvent = event as { finishReason?: string };
            await onStreamEvent?.({
              type: "step-finish",
              stepNumber: stepCount,
              finishReason: stepEvent.finishReason ?? "unknown",
            });
            break;
          }

          case "finish":
            finalFinishReason = event.finishReason ?? "stop";
            if (event.totalUsage) {
              totalInputTokens = event.totalUsage.inputTokens ?? 0;
              totalOutputTokens = event.totalUsage.outputTokens ?? 0;
            }
            await onStreamEvent?.({
              type: "finish",
              finishReason: finalFinishReason,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
              },
            });
            break;

          case "error":
            await onStreamEvent?.({
              type: "error",
              error: event.error instanceof Error ? event.error : new Error(String(event.error)),
            });
            throw event.error;
        }
      }

      // Wait for the final result to get accurate usage
      const finalResult = await result;
      const usage = await finalResult.usage;
      if (usage) {
        totalInputTokens = usage.inputTokens ?? totalInputTokens;
        totalOutputTokens = usage.outputTokens ?? totalOutputTokens;
      }
      const steps = await finalResult.steps;
      stepCount = steps?.length ?? 1;

      return {
        text: fullText,
        finishReason: finalFinishReason,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
        toolCalls: allToolCalls,
        steps: stepCount,
      };
    } catch (error) {
      // Re-throw but ensure we've notified the stream handler
      if (onStreamEvent && error instanceof Error) {
        await onStreamEvent({ type: "error", error });
      }
      throw error;
    }
  }

  /**
   * Generate a non-streaming completion (for simple cases)
   */
  static async generateCompletion(
    options: Omit<LLMCallOptions, "onStreamEvent">
  ): Promise<LLMCallResult> {
    const {
      providerId,
      modelId,
      apiKey,
      system,
      messages,
      tools,
      temperature,
      topP,
      abortSignal,
    } = options;

    // Create the model instance
    const model = ProviderRegistry.createModel(providerId, modelId ?? null, apiKey);

    const result = await generateText({
      model,
      system,
      messages,
      tools,
      temperature,
      topP,
      abortSignal,
    });

    // Extract tool calls from steps
    const allToolCalls: LLMCallResult["toolCalls"] = [];
    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const call of step.toolCalls) {
            const toolResult = step.toolResults?.find(
              (r) => r.toolCallId === call.toolCallId
            );
            const callArgs = (call as { input?: unknown }).input ?? {};
            const resultOutput = toolResult ? (toolResult as { output?: unknown }).output ?? null : null;
            allToolCalls.push({
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              args: callArgs,
              result: resultOutput,
            });
          }
        }
      }
    }

    return {
      text: result.text,
      finishReason: result.finishReason,
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
      toolCalls: allToolCalls,
      steps: result.steps?.length ?? 1,
    };
  }

  /**
   * Build a system prompt for an agent
   */
  static buildSystemPrompt(options: {
    agentPrompt?: string;
    projectContext?: string;
    additionalInstructions?: string[];
    availableSkills?: Array<{ name: string; description: string }>;
  }): string {
    const parts: string[] = [];

    // Base instructions with clear tool usage guidance
    parts.push(`You are an AI coding assistant with access to tools for reading, writing, and editing files, as well as executing commands.`);
    parts.push(``);
    parts.push(`IMPORTANT: When you need to read files, write code, or execute commands, you MUST use the available tools. Do NOT just describe what you would do - actually call the tools to do it.`);
    parts.push(``);
    parts.push(`For example:`);
    parts.push(`- To read a file, call the "read" tool with the file path`);
    parts.push(`- To list files, call the "glob" tool with a pattern`);
    parts.push(`- To search for code, call the "grep" tool`);
    parts.push(`- To edit a file, call the "edit" tool`);
    parts.push(`- To run a command, call the "bash" tool`);
    parts.push(`- To use a skill, call the "read_skill" tool with the skill name`);
    parts.push(``);
    parts.push(`IMPORTANT: When calling any tool, ALWAYS include a brief "description" parameter that explains what you're doing and why. This helps the user understand your actions in the UI. For example:`);
    parts.push(`- read({ path: "src/config.ts", description: "Checking database configuration" })`);
    parts.push(`- bash({ command: "npm test", description: "Running test suite" })`);
    parts.push(`- grep({ pattern: "TODO", description: "Finding remaining TODO comments" })`);
    parts.push(``);
    parts.push(`Be concise and helpful. Focus on completing the user's request efficiently.`);

    // Project context
    if (options.projectContext) {
      parts.push("");
      parts.push("## Project Context");
      parts.push(options.projectContext);
    }

    // Available skills (if any)
    if (options.availableSkills?.length) {
      parts.push("");
      parts.push("## Available Skills");
      parts.push(
        "IMPORTANT: When asked to use a skill, you MUST call the `read_skill` tool to load the skill's instructions. Do NOT try to read skill files directly with the `read` tool - always use `read_skill` instead."
      );
      parts.push("");
      parts.push("Available skills:");
      for (const skill of options.availableSkills) {
        parts.push(`- **${skill.name}**: ${skill.description}`);
      }
      parts.push("");
      parts.push("Example: To use the skill named 'code-review', call: read_skill({ name: 'code-review' })");
    }

    // Agent-specific prompt
    if (options.agentPrompt) {
      parts.push("");
      parts.push("## Agent Instructions");
      parts.push(options.agentPrompt);
    }

    // Additional instructions
    if (options.additionalInstructions?.length) {
      parts.push("");
      parts.push("## Additional Instructions");
      for (const instruction of options.additionalInstructions) {
        parts.push(`- ${instruction}`);
      }
    }

    return parts.join("\n");
  }
}
