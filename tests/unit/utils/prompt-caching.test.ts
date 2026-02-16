/**
 * Tests for prompt caching utilities
 */

import { describe, it, expect } from "bun:test";
import type { ModelMessage } from "ai";
import {
  analyzeCaching,
  applyAnthropicCaching,
  getOpenAICachingOptions,
  supportsPromptCaching,
  getProviderCachingConfig,
  DEFAULT_CACHING_CONFIG,
  type PromptCachingConfig,
} from "@/utils/prompt-caching.ts";

describe("Prompt Caching Utilities", () => {
  const sampleMessages: ModelMessage[] = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" },
    { role: "assistant", content: "I'm doing well, thank you!" },
    { role: "user", content: "What's the weather like?" },
    { role: "assistant", content: "I don't have access to current weather data." },
    { role: "user", content: "Can you help me with coding?" },
    { role: "assistant", content: "Absolutely! What would you like help with?" },
  ];

  describe("analyzeCaching", () => {
    it("should disable caching when config disabled", () => {
      const config: PromptCachingConfig = {
        ...DEFAULT_CACHING_CONFIG,
        enabled: false,
      };

      const result = analyzeCaching(sampleMessages, config);

      expect(result.shouldCache).toBe(false);
      expect(result.reason).toBe("Caching disabled in configuration");
      expect(result.cacheableMessages).toHaveLength(0);
      expect(result.uncachedMessages).toHaveLength(sampleMessages.length);
    });

    it("should disable caching for too few messages", () => {
      const shortMessages = sampleMessages.slice(0, 3);
      const result = analyzeCaching(shortMessages, DEFAULT_CACHING_CONFIG);

      expect(result.shouldCache).toBe(false);
      expect(result.reason).toContain("Too few messages");
      expect(result.cacheableMessages).toHaveLength(0);
    });

    it("should enable caching for sufficient messages", () => {
      const result = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);

      expect(result.shouldCache).toBe(true);
      expect(result.cacheableMessages.length).toBeGreaterThan(0);
      expect(result.uncachedMessages.length).toBe(DEFAULT_CACHING_CONFIG.recentMessagesUncached);
      expect(result.cacheKey).toBeDefined();
      expect(result.estimatedTokenSavings).toBeGreaterThan(0);
    });

    it("should split messages correctly", () => {
      const config: PromptCachingConfig = {
        ...DEFAULT_CACHING_CONFIG,
        minMessagesForCaching: 4,
        recentMessagesUncached: 2,
      };

      const result = analyzeCaching(sampleMessages, config);

      expect(result.shouldCache).toBe(true);
      expect(result.cacheableMessages).toHaveLength(6); // 8 total - 2 recent
      expect(result.uncachedMessages).toHaveLength(2);
      
      // Verify the split is correct
      expect(result.cacheableMessages).toEqual(sampleMessages.slice(0, 6));
      expect(result.uncachedMessages).toEqual(sampleMessages.slice(6));
    });

    it("should generate stable cache keys", () => {
      const result1 = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const result2 = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);

      expect(result1.cacheKey).toBe(result2.cacheKey);
    });

    it("should generate different cache keys for different content", () => {
      const modifiedMessages = [...sampleMessages];
      modifiedMessages[0] = { role: "user", content: "Different content" };

      const result1 = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const result2 = analyzeCaching(modifiedMessages, DEFAULT_CACHING_CONFIG);

      expect(result1.cacheKey).not.toBe(result2.cacheKey);
    });

    it("should use cache key prefix", () => {
      const config: PromptCachingConfig = {
        ...DEFAULT_CACHING_CONFIG,
        cacheKeyPrefix: "test_session",
      };

      const result = analyzeCaching(sampleMessages, config);

      expect(result.cacheKey).toStartWith("test_session_");
    });
  });

  describe("applyAnthropicCaching", () => {
    it("should not modify messages when caching disabled", () => {
      const analysis = {
        shouldCache: false,
        cacheableMessages: [],
        uncachedMessages: sampleMessages,
        estimatedTokenSavings: 0,
        reason: "Test",
      };

      const result = applyAnthropicCaching(sampleMessages, analysis);

      expect(result).toEqual(sampleMessages);
    });

    it("should add cache control to last cacheable message", () => {
      const analysis = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const result = applyAnthropicCaching(sampleMessages, analysis);

      expect(result).toHaveLength(sampleMessages.length);
      
      // Find the last cacheable message
      const lastCacheableIndex = analysis.cacheableMessages.length - 1;
      expect(result[lastCacheableIndex]).toHaveProperty("cache_control");
      expect(result[lastCacheableIndex].cache_control).toEqual({ type: "ephemeral" });

      // Verify other messages don't have cache control
      for (let i = 0; i < result.length; i++) {
        if (i !== lastCacheableIndex) {
          expect(result[i]).not.toHaveProperty("cache_control");
        }
      }
    });

    it("should preserve message content and order", () => {
      const analysis = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const result = applyAnthropicCaching(sampleMessages, analysis);

      expect(result).toHaveLength(sampleMessages.length);
      
      for (let i = 0; i < result.length; i++) {
        expect(result[i].role).toBe(sampleMessages[i].role);
        expect(result[i].content).toBe(sampleMessages[i].content);
      }
    });
  });

  describe("getOpenAICachingOptions", () => {
    it("should return empty options when caching disabled", () => {
      const analysis = {
        shouldCache: false,
        cacheableMessages: [],
        uncachedMessages: sampleMessages,
        estimatedTokenSavings: 0,
        reason: "Test",
      };

      const result = getOpenAICachingOptions(analysis);

      expect(result).toEqual({});
    });

    it("should return caching options when enabled", () => {
      const analysis = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const result = getOpenAICachingOptions(analysis);

      expect(result).toHaveProperty("promptCacheKey");
      expect(result).toHaveProperty("promptCacheRetention");
      expect(result.promptCacheKey).toBe(analysis.cacheKey);
      expect(result.promptCacheRetention).toBe("24h"); // Default extended caching
    });

    it("should respect extended caching configuration", () => {
      const analysis = analyzeCaching(sampleMessages, DEFAULT_CACHING_CONFIG);
      const config: PromptCachingConfig = {
        ...DEFAULT_CACHING_CONFIG,
        useExtendedCaching: false,
      };

      const result = getOpenAICachingOptions(analysis, config);

      expect(result.promptCacheRetention).toBe("in_memory");
    });
  });

  describe("supportsPromptCaching", () => {
    it("should return true for supported providers", () => {
      expect(supportsPromptCaching("anthropic")).toBe(true);
      expect(supportsPromptCaching("anthropic-oauth")).toBe(true);
      expect(supportsPromptCaching("openai")).toBe(true);
    });

    it("should return false for unsupported providers", () => {
      expect(supportsPromptCaching("google")).toBe(false);
      expect(supportsPromptCaching("ollama")).toBe(false);
    });
  });

  describe("getProviderCachingConfig", () => {
    it("should return Anthropic-specific config", () => {
      const config = getProviderCachingConfig("anthropic");
      
      expect(config.minMessagesForCaching).toBe(4);
      expect(config.recentMessagesUncached).toBe(2);
    });

    it("should return OpenAI-specific config", () => {
      const config = getProviderCachingConfig("openai");
      
      expect(config.minMessagesForCaching).toBe(6);
      expect(config.recentMessagesUncached).toBe(3);
      expect(config.useExtendedCaching).toBe(true);
    });

    it("should disable caching for unsupported providers", () => {
      const config = getProviderCachingConfig("google");
      
      expect(config.enabled).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle empty messages array", () => {
      const result = analyzeCaching([], DEFAULT_CACHING_CONFIG);

      expect(result.shouldCache).toBe(false);
      expect(result.reason).toContain("Too few messages");
    });

    it("should handle messages with complex content", () => {
      const complexMessages: ModelMessage[] = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: [{ type: "text", text: "How are you?" }, { type: "text", text: "What's up?" }] },
        { role: "assistant", content: "Good!" },
        { role: "user", content: "Great!" },
        { role: "assistant", content: "Indeed!" },
      ];

      const result = analyzeCaching(complexMessages, DEFAULT_CACHING_CONFIG);

      expect(result.shouldCache).toBe(true);
      expect(result.estimatedTokenSavings).toBeGreaterThan(0);
    });

    it("should handle very short conversations", () => {
      const shortMessages: ModelMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ];

      const result = analyzeCaching(shortMessages, DEFAULT_CACHING_CONFIG);

      expect(result.shouldCache).toBe(false);
    });

    it("should handle configuration edge cases", () => {
      const config: PromptCachingConfig = {
        ...DEFAULT_CACHING_CONFIG,
        recentMessagesUncached: 10, // More than total messages
      };

      const result = analyzeCaching(sampleMessages, config);

      expect(result.shouldCache).toBe(false);
      expect(result.reason).toContain("No messages available for caching");
    });
  });
});