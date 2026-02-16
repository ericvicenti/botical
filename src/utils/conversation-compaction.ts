/**
 * Conversation History Compaction Utilities
 * 
 * Implements auto-compaction of older conversation turns to prevent context bloat
 * while preserving recent interactions verbatim. Uses a sliding window approach
 * with compressed history similar to Letta's memory blocks.
 */

import { ModelMessage } from "../types/ai";

export interface CompactionOptions {
  /** Number of recent turns to keep verbatim (default: 5) */
  keepRecentTurns: number;
  /** Maximum length for summarized content (default: 500) */
  maxSummaryLength: number;
  /** Whether to include turn count in summary (default: true) */
  includeTurnCount: boolean;
}

export interface CompactionResult {
  /** The compacted messages array */
  messages: ModelMessage[];
  /** Whether compaction occurred */
  wasCompacted: boolean;
  /** Number of turns that were summarized */
  summarizedTurns: number;
  /** Original message count */
  originalCount: number;
  /** Summary of compacted content */
  summary?: string;
}

/**
 * Default compaction options
 */
export const DEFAULT_COMPACTION_OPTIONS: CompactionOptions = {
  keepRecentTurns: 5,
  maxSummaryLength: 500,
  includeTurnCount: true,
};

/**
 * Compact conversation history by summarizing older turns
 * while keeping recent ones verbatim
 */
export function compactConversationHistory(
  messages: ModelMessage[],
  options: CompactionOptions = DEFAULT_COMPACTION_OPTIONS
): CompactionResult {
  const originalCount = messages.length;
  
  // If we have fewer messages than the keep threshold, no compaction needed
  if (messages.length <= options.keepRecentTurns) {
    return {
      messages,
      wasCompacted: false,
      summarizedTurns: 0,
      originalCount,
    };
  }
  
  // Split messages into old (to be summarized) and recent (to keep verbatim)
  const splitIndex = messages.length - options.keepRecentTurns;
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);
  
  // Create summary of old messages
  const summary = summarizeMessages(oldMessages, options);
  
  // Create compacted message array
  const compactedMessages: ModelMessage[] = [
    {
      role: "system",
      content: `[Conversation History Summary]\n${summary}\n\n[Recent Conversation Continues Below]`
    },
    ...recentMessages
  ];
  
  return {
    messages: compactedMessages,
    wasCompacted: true,
    summarizedTurns: oldMessages.length,
    originalCount,
    summary,
  };
}

/**
 * Summarize a sequence of messages into a compact representation
 */
function summarizeMessages(
  messages: ModelMessage[],
  options: CompactionOptions
): string {
  if (messages.length === 0) {
    return "No previous conversation.";
  }
  
  // Group messages into conversation turns (user-assistant pairs)
  const turns = groupIntoTurns(messages);
  
  // Create summary
  let summary = "";
  
  if (options.includeTurnCount) {
    summary += `Previous conversation: ${turns.length} turns, ${messages.length} messages.\n\n`;
  }
  
  // Summarize key topics and interactions
  const topics = extractTopics(turns);
  if (topics.length > 0) {
    summary += `Key topics discussed: ${topics.join(", ")}.\n\n`;
  }
  
  // Include brief excerpts from important turns
  const importantTurns = selectImportantTurns(turns, 3);
  if (importantTurns.length > 0) {
    summary += "Key interactions:\n";
    for (const turn of importantTurns) {
      const userPreview = truncateText(turn.userMessage, 100);
      const assistantPreview = truncateText(turn.assistantMessage, 150);
      summary += `- User: ${userPreview}\n  Assistant: ${assistantPreview}\n`;
    }
  }
  
  // Ensure summary doesn't exceed max length
  if (summary.length > options.maxSummaryLength) {
    summary = truncateText(summary, options.maxSummaryLength) + "\n[Summary truncated for brevity]";
  }
  
  return summary.trim();
}

/**
 * Group messages into conversation turns (user-assistant pairs)
 */
interface ConversationTurn {
  userMessage: string;
  assistantMessage: string;
  turnIndex: number;
}

function groupIntoTurns(messages: ModelMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentUser = "";
  let turnIndex = 0;
  
  for (const message of messages) {
    if (message.role === "user") {
      currentUser = message.content;
    } else if (message.role === "assistant" && currentUser) {
      turns.push({
        userMessage: currentUser,
        assistantMessage: message.content,
        turnIndex: turnIndex++,
      });
      currentUser = "";
    }
  }
  
  return turns;
}

/**
 * Extract key topics from conversation turns
 */
function extractTopics(turns: ConversationTurn[]): string[] {
  const topics = new Set<string>();
  
  for (const turn of turns) {
    // Look for common patterns that indicate topics
    const combined = `${turn.userMessage} ${turn.assistantMessage}`.toLowerCase();
    
    // Extract file/path references
    const fileMatches = combined.match(/\b[\w-]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|toml|sql|css|html)\b/g);
    if (fileMatches) {
      fileMatches.forEach(file => topics.add(`file: ${file}`));
    }
    
    // Extract action/command patterns
    const actionMatches = combined.match(/\b(implement|fix|add|create|update|delete|refactor|test|deploy|build)\s+\w+/g);
    if (actionMatches) {
      actionMatches.slice(0, 2).forEach(action => topics.add(action));
    }
    
    // Extract error patterns
    if (combined.includes("error") || combined.includes("bug") || combined.includes("fail")) {
      topics.add("error handling");
    }
    
    // Extract testing patterns
    if (combined.includes("test") && !combined.includes("test.")) {
      topics.add("testing");
    }
  }
  
  // Limit to most relevant topics
  return Array.from(topics).slice(0, 5);
}

/**
 * Select the most important turns based on heuristics
 */
function selectImportantTurns(turns: ConversationTurn[], maxTurns: number): ConversationTurn[] {
  if (turns.length <= maxTurns) {
    return turns;
  }
  
  // Score turns based on importance indicators
  const scoredTurns = turns.map(turn => ({
    turn,
    score: scoreTurnImportance(turn),
  }));
  
  // Sort by score and take top N
  scoredTurns.sort((a, b) => b.score - a.score);
  return scoredTurns.slice(0, maxTurns).map(st => st.turn);
}

/**
 * Score a turn's importance based on content heuristics
 */
function scoreTurnImportance(turn: ConversationTurn): number {
  let score = 0;
  const combined = `${turn.userMessage} ${turn.assistantMessage}`.toLowerCase();
  
  // Higher score for errors and problems
  if (combined.includes("error") || combined.includes("fail") || combined.includes("bug")) {
    score += 3;
  }
  
  // Higher score for implementation and changes
  if (combined.includes("implement") || combined.includes("fix") || combined.includes("create")) {
    score += 2;
  }
  
  // Higher score for file operations
  if (combined.includes("file") || combined.includes("read") || combined.includes("write")) {
    score += 1;
  }
  
  // Higher score for longer interactions (more detailed)
  if (turn.assistantMessage.length > 500) {
    score += 1;
  }
  
  // Lower score for very recent turns (they'll be kept anyway)
  score -= turn.turnIndex * 0.1;
  
  return score;
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Check if conversation history should be compacted
 */
export function shouldCompactHistory(
  messageCount: number,
  threshold: number = 10
): boolean {
  return messageCount > threshold;
}

/**
 * Get conversation statistics for monitoring
 */
export interface ConversationStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  totalCharacters: number;
  averageMessageLength: number;
}

export function getConversationStats(messages: ModelMessage[]): ConversationStats {
  let totalCharacters = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let systemMessages = 0;
  
  for (const message of messages) {
    totalCharacters += message.content.length;
    
    switch (message.role) {
      case "user":
        userMessages++;
        break;
      case "assistant":
        assistantMessages++;
        break;
      case "system":
        systemMessages++;
        break;
    }
  }
  
  return {
    totalMessages: messages.length,
    userMessages,
    assistantMessages,
    systemMessages,
    totalCharacters,
    averageMessageLength: messages.length > 0 ? Math.round(totalCharacters / messages.length) : 0,
  };
}