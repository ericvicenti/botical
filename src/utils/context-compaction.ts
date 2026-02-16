/**
 * Context Compaction Utility
 *
 * Implements auto-compaction of conversation history to prevent context bloat
 * in long agent sessions. Uses a sliding window approach with compressed history.
 * 
 * Strategy:
 * - Keep last N turns verbatim (recent context is most important)
 * - Compress older turns into structured summaries
 * - Preserve key information while reducing token count
 * 
 * See: PRIORITIES.md - Context Management & Long Chain Efficiency
 */

import type { ModelMessage } from "ai";

/**
 * Configuration for context compaction
 */
export interface CompactionConfig {
  /** Number of recent message pairs to keep verbatim (default: 5) */
  recentTurns: number;
  /** Maximum tokens for compressed history summary (default: 1000) */
  maxSummaryTokens: number;
  /** Whether to enable compaction (default: true) */
  enabled: boolean;
}

/**
 * Default compaction configuration
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  recentTurns: 5,
  maxSummaryTokens: 1000,
  enabled: true,
};

/**
 * Result of context compaction
 */
export interface CompactionResult {
  /** Compacted messages array */
  messages: ModelMessage[];
  /** Whether compaction was applied */
  wasCompacted: boolean;
  /** Number of original messages */
  originalCount: number;
  /** Number of messages after compaction */
  compactedCount: number;
  /** Estimated token reduction */
  estimatedTokenReduction: number;
  /** Summary of compressed content */
  compressionSummary?: string;
}

/**
 * Rough token estimation for text content
 * Uses approximation: 1 token ≈ 4 characters for English text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract text content from a ModelMessage
 */
function extractMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  // Handle array content (multimodal messages)
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ");
  }
  return "";
}

/**
 * Create a compressed summary of older conversation turns
 */
function createCompressedSummary(
  olderMessages: ModelMessage[],
  maxTokens: number
): string {
  if (olderMessages.length === 0) return "";

  // Group messages into conversation turns (user-assistant pairs)
  const turns: { user?: string; assistant?: string }[] = [];
  let currentTurn: { user?: string; assistant?: string } = {};

  for (const message of olderMessages) {
    const text = extractMessageText(message);
    if (!text.trim()) continue;

    if (message.role === "user") {
      // Start new turn if we have a complete previous turn
      if (currentTurn.user || currentTurn.assistant) {
        turns.push(currentTurn);
        currentTurn = {};
      }
      currentTurn.user = text;
    } else if (message.role === "assistant") {
      currentTurn.assistant = text;
    }
  }

  // Add final turn if it has content
  if (currentTurn.user || currentTurn.assistant) {
    turns.push(currentTurn);
  }

  if (turns.length === 0) return "";

  // Create structured summary
  const summaryParts: string[] = [];
  summaryParts.push(`[CONVERSATION SUMMARY - ${turns.length} earlier turns]`);

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const turnSummary: string[] = [];

    if (turn.user) {
      // Truncate long user messages
      const userText = turn.user.length > 200 
        ? turn.user.substring(0, 200) + "..."
        : turn.user;
      turnSummary.push(`User: ${userText}`);
    }

    if (turn.assistant) {
      // Extract key information from assistant responses
      const assistantText = turn.assistant;
      
      // Look for tool usage patterns
      const toolMentions = assistantText.match(/(?:using|calling|executing)\s+(\w+)/gi) || [];
      const fileMentions = assistantText.match(/(?:reading|writing|editing)\s+([^\s]+\.\w+)/gi) || [];
      const errorMentions = assistantText.match(/error|failed|exception/gi) || [];
      
      let assistantSummary = "";
      if (toolMentions.length > 0) {
        assistantSummary += `Used tools: ${toolMentions.slice(0, 3).join(", ")}. `;
      }
      if (fileMentions.length > 0) {
        assistantSummary += `Files: ${fileMentions.slice(0, 3).join(", ")}. `;
      }
      if (errorMentions.length > 0) {
        assistantSummary += "Encountered errors. ";
      }
      
      // If no patterns found, use truncated text
      if (!assistantSummary) {
        assistantSummary = assistantText.length > 150 
          ? assistantText.substring(0, 150) + "..."
          : assistantText;
      }
      
      turnSummary.push(`Assistant: ${assistantSummary}`);
    }

    if (turnSummary.length > 0) {
      summaryParts.push(`Turn ${i + 1}: ${turnSummary.join(" → ")}`);
    }
  }

  let summary = summaryParts.join("\n");
  
  // Truncate if still too long
  const estimatedTokens = estimateTokens(summary);
  if (estimatedTokens > maxTokens) {
    const targetLength = maxTokens * 4; // Convert back to characters
    summary = summary.substring(0, targetLength) + "\n[Summary truncated...]";
  }

  return summary;
}

/**
 * Apply context compaction to a conversation history
 */
export function compactContext(
  messages: ModelMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
): CompactionResult {
  // Return early if compaction is disabled or not needed
  if (!config.enabled || messages.length <= config.recentTurns * 2) {
    return {
      messages,
      wasCompacted: false,
      originalCount: messages.length,
      compactedCount: messages.length,
      estimatedTokenReduction: 0,
    };
  }

  // Calculate split point (keep recent turns verbatim)
  const recentMessageCount = config.recentTurns * 2; // user + assistant pairs
  const splitIndex = Math.max(0, messages.length - recentMessageCount);
  
  if (splitIndex === 0) {
    // Not enough messages to compact
    return {
      messages,
      wasCompacted: false,
      originalCount: messages.length,
      compactedCount: messages.length,
      estimatedTokenReduction: 0,
    };
  }

  // Split messages into older and recent
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Create compressed summary of older messages
  const compressionSummary = createCompressedSummary(
    olderMessages,
    config.maxSummaryTokens
  );

  // Build compacted message array
  const compactedMessages: ModelMessage[] = [];

  // Add compressed summary as a system message if we have content
  if (compressionSummary) {
    compactedMessages.push({
      role: "system",
      content: compressionSummary,
    });
  }

  // Add recent messages verbatim
  compactedMessages.push(...recentMessages);

  // Calculate token reduction estimate
  const originalTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(extractMessageText(msg)),
    0
  );
  const compactedTokens = compactedMessages.reduce(
    (sum, msg) => sum + estimateTokens(extractMessageText(msg)),
    0
  );

  return {
    messages: compactedMessages,
    wasCompacted: true,
    originalCount: messages.length,
    compactedCount: compactedMessages.length,
    estimatedTokenReduction: Math.max(0, originalTokens - compactedTokens),
    compressionSummary,
  };
}

/**
 * Check if context compaction should be triggered based on message count
 */
export function shouldCompact(
  messageCount: number,
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
): boolean {
  return config.enabled && messageCount > config.recentTurns * 2;
}

/**
 * Get compaction statistics for monitoring
 */
export function getCompactionStats(result: CompactionResult): {
  compressionRatio: number;
  tokenSavings: number;
  messageReduction: number;
} {
  const compressionRatio = result.originalCount > 0 
    ? result.compactedCount / result.originalCount 
    : 1;
  
  return {
    compressionRatio,
    tokenSavings: result.estimatedTokenReduction,
    messageReduction: result.originalCount - result.compactedCount,
  };
}