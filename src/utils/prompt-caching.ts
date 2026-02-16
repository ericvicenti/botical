/**
 * Prompt Caching Utilities
 * 
 * Provides intelligent prompt caching to reduce token costs and improve performance
 * by caching static parts of conversations (system prompt, tools, early messages).
 * 
 * Supports both Anthropic and OpenAI prompt caching mechanisms.
 */

import type { ModelMessage } from "ai";
import type { ProviderId } from "@/agents/types.ts";

/**
 * Configuration for prompt caching behavior
 */
export interface PromptCachingConfig {
  /** Whether to enable prompt caching */
  enabled: boolean;
  /** Minimum number of messages before caching is considered */
  minMessagesForCaching: number;
  /** Number of recent messages to keep uncached (for dynamic content) */
  recentMessagesUncached: number;
  /** Cache key prefix for this session/agent */
  cacheKeyPrefix?: string;
  /** Whether to use extended 24h caching (OpenAI only) */
  useExtendedCaching?: boolean;
}

/**
 * Default prompt caching configuration
 */
export const DEFAULT_CACHING_CONFIG: PromptCachingConfig = {
  enabled: true,
  minMessagesForCaching: 5, // Only cache if we have at least 5 messages
  recentMessagesUncached: 3, // Keep last 3 messages uncached for dynamic content
  useExtendedCaching: true, // Use 24h caching for OpenAI when available
};

/**
 * Result of prompt caching analysis
 */
export interface CachingAnalysis {
  /** Whether caching should be applied */
  shouldCache: boolean;
  /** Messages that should be cached */
  cacheableMessages: ModelMessage[];
  /** Messages that should remain uncached */
  uncachedMessages: ModelMessage[];
  /** Cache key to use */
  cacheKey?: string;
  /** Estimated token savings from caching */
  estimatedTokenSavings: number;
  /** Reason why caching was or wasn't applied */
  reason: string;
}

/**
 * Enhanced model message with caching metadata
 */
export interface CachedModelMessage extends ModelMessage {
  /** Anthropic-specific cache control */
  cache_control?: {
    type: "ephemeral";
  };
}

/**
 * Analyze messages for prompt caching opportunities
 */
export function analyzeCaching(
  messages: ModelMessage[],
  config: PromptCachingConfig = DEFAULT_CACHING_CONFIG
): CachingAnalysis {
  // Check if caching is enabled
  if (!config.enabled) {
    return {
      shouldCache: false,
      cacheableMessages: [],
      uncachedMessages: messages,
      estimatedTokenSavings: 0,
      reason: "Caching disabled in configuration",
    };
  }

  // Check minimum message threshold
  if (messages.length < config.minMessagesForCaching) {
    return {
      shouldCache: false,
      cacheableMessages: [],
      uncachedMessages: messages,
      estimatedTokenSavings: 0,
      reason: `Too few messages (${messages.length} < ${config.minMessagesForCaching})`,
    };
  }

  // Calculate split point
  const totalMessages = messages.length;
  const uncachedCount = Math.min(config.recentMessagesUncached, totalMessages);
  const cachedCount = totalMessages - uncachedCount;

  if (cachedCount <= 0) {
    return {
      shouldCache: false,
      cacheableMessages: [],
      uncachedMessages: messages,
      estimatedTokenSavings: 0,
      reason: "No messages available for caching after reserving recent messages",
    };
  }

  // Split messages
  const cacheableMessages = messages.slice(0, cachedCount);
  const uncachedMessages = messages.slice(cachedCount);

  // Generate cache key
  const cacheKey = generateCacheKey(cacheableMessages, config.cacheKeyPrefix);

  // Estimate token savings (rough approximation)
  const estimatedCachedTokens = estimateTokens(cacheableMessages);
  const estimatedTokenSavings = Math.floor(estimatedCachedTokens * 0.9); // 90% savings assumption

  return {
    shouldCache: true,
    cacheableMessages,
    uncachedMessages,
    cacheKey,
    estimatedTokenSavings,
    reason: `Caching ${cachedCount} messages, keeping ${uncachedCount} recent messages uncached`,
  };
}

/**
 * Apply Anthropic-specific prompt caching to messages
 */
export function applyAnthropicCaching(
  messages: ModelMessage[],
  analysis: CachingAnalysis
): CachedModelMessage[] {
  if (!analysis.shouldCache || analysis.cacheableMessages.length === 0) {
    return messages as CachedModelMessage[];
  }

  const result: CachedModelMessage[] = [];

  // Add cacheable messages with cache control on the last one
  for (let i = 0; i < analysis.cacheableMessages.length; i++) {
    const message = analysis.cacheableMessages[i];
    const isLastCacheable = i === analysis.cacheableMessages.length - 1;
    
    result.push({
      ...message,
      ...(isLastCacheable && {
        cache_control: { type: "ephemeral" }
      })
    });
  }

  // Add uncached messages without cache control
  result.push(...analysis.uncachedMessages as CachedModelMessage[]);

  return result;
}

/**
 * Get OpenAI-specific caching options
 */
export function getOpenAICachingOptions(
  analysis: CachingAnalysis,
  config: PromptCachingConfig = DEFAULT_CACHING_CONFIG
): {
  promptCacheKey?: string;
  promptCacheRetention?: "in_memory" | "24h";
} {
  if (!analysis.shouldCache || !analysis.cacheKey) {
    return {};
  }

  return {
    promptCacheKey: analysis.cacheKey,
    promptCacheRetention: config.useExtendedCaching ? "24h" : "in_memory",
  };
}

/**
 * Generate a stable cache key from messages
 */
function generateCacheKey(messages: ModelMessage[], prefix?: string): string {
  // Create a hash of the cacheable content
  const content = messages.map(m => `${m.role}:${JSON.stringify(m.content)}`).join("|");
  
  // Simple hash function (for production, consider using crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const hashStr = Math.abs(hash).toString(36);
  return prefix ? `${prefix}_${hashStr}` : `cache_${hashStr}`;
}

/**
 * Rough token estimation for messages (4 chars ≈ 1 token)
 */
function estimateTokens(messages: ModelMessage[]): number {
  let totalChars = 0;
  
  for (const message of messages) {
    if (typeof message.content === "string") {
      totalChars += message.content.length;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (typeof part === "string") {
          totalChars += part.length;
        } else if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          totalChars += part.text.length;
        }
      }
    }
  }
  
  return Math.ceil(totalChars / 4);
}

/**
 * Check if a provider supports prompt caching
 */
export function supportsPromptCaching(providerId: ProviderId): boolean {
  return ["anthropic", "anthropic-oauth", "openai"].includes(providerId);
}

/**
 * Get provider-specific caching configuration
 */
export function getProviderCachingConfig(providerId: ProviderId): Partial<PromptCachingConfig> {
  switch (providerId) {
    case "anthropic":
    case "anthropic-oauth":
      return {
        // Anthropic has generous caching, can be more aggressive
        minMessagesForCaching: 4,
        recentMessagesUncached: 2,
      };
    case "openai":
      return {
        // OpenAI caching is newer, be more conservative
        minMessagesForCaching: 6,
        recentMessagesUncached: 3,
        useExtendedCaching: true,
      };
    default:
      return {
        enabled: false, // Disable for unsupported providers
      };
  }
}