/**
 * Context Compaction Tests
 */

import { describe, it, expect } from "bun:test";
import type { ModelMessage } from "ai";
import {
  compactContext,
  shouldCompact,
  getCompactionStats,
  DEFAULT_COMPACTION_CONFIG,
} from "@/utils/context-compaction.ts";

describe("Context Compaction", () => {
  // Helper to create test messages
  const createMessage = (role: "user" | "assistant" | "system", content: string): ModelMessage => ({
    role,
    content,
  });

  describe("compactContext", () => {
    it("should not compact when disabled", () => {
      const messages = [
        createMessage("user", "Hello"),
        createMessage("assistant", "Hi there"),
        createMessage("user", "How are you?"),
        createMessage("assistant", "I'm doing well"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, enabled: false });

      expect(result.wasCompacted).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.originalCount).toBe(4);
      expect(result.compactedCount).toBe(4);
    });

    it("should not compact when message count is below threshold", () => {
      const messages = [
        createMessage("user", "Hello"),
        createMessage("assistant", "Hi there"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 5 });

      expect(result.wasCompacted).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.originalCount).toBe(2);
      expect(result.compactedCount).toBe(2);
    });

    it("should compact when message count exceeds threshold", () => {
      // Create 12 messages (6 turns) - should compact with recentTurns: 2
      const messages = [
        createMessage("user", "Can you help me read a file?"),
        createMessage("assistant", "I'll help you read the file. Let me use the read tool to access it and show you the contents."),
        createMessage("user", "Please also check if there are any errors in the code"),
        createMessage("assistant", "I'll examine the code for potential errors and issues. Let me analyze the file structure and syntax."),
        createMessage("user", "Now write the corrected version to a new file"),
        createMessage("assistant", "I'll create a corrected version using the write tool to save it to a new file with the fixes applied."),
        createMessage("user", "Can you run the tests to make sure it works?"),
        createMessage("assistant", "I'll execute the test suite to verify that all functionality works correctly after the changes."),
        createMessage("user", "Message 5"),
        createMessage("assistant", "Response 5"),
        createMessage("user", "Message 6"),
        createMessage("assistant", "Response 6"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 2 });

      expect(result.wasCompacted).toBe(true);
      expect(result.originalCount).toBe(12);
      expect(result.compactedCount).toBe(5); // 1 system summary + 4 recent messages
      expect(result.estimatedTokenReduction).toBeGreaterThanOrEqual(0); // May or may not save tokens depending on content
      expect(result.compressionSummary).toContain("[CONVERSATION SUMMARY");

      // Check that recent messages are preserved
      const recentMessages = result.messages.slice(-4);
      expect(recentMessages[0].content).toBe("Message 5");
      expect(recentMessages[1].content).toBe("Response 5");
      expect(recentMessages[2].content).toBe("Message 6");
      expect(recentMessages[3].content).toBe("Response 6");

      // Check that summary is added as system message
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].content).toContain("CONVERSATION SUMMARY");
    });

    it("should handle tool usage patterns in compression", () => {
      const messages = [
        createMessage("user", "Please read the file"),
        createMessage("assistant", "I'll use the read tool to access the file content"),
        createMessage("user", "Now write to another file"),
        createMessage("assistant", "Using the write tool to create the new file"),
        createMessage("user", "Recent message"),
        createMessage("assistant", "Recent response"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 1 });

      expect(result.wasCompacted).toBe(true);
      expect(result.compressionSummary).toContain("Used tools:");
    });

    it("should handle error patterns in compression", () => {
      const messages = [
        createMessage("user", "Do something"),
        createMessage("assistant", "I encountered an error while processing"),
        createMessage("user", "Try again"),
        createMessage("assistant", "The operation failed with an exception"),
        createMessage("user", "Recent message"),
        createMessage("assistant", "Recent response"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 1 });

      expect(result.wasCompacted).toBe(true);
      expect(result.compressionSummary).toContain("Encountered errors");
    });

    it("should handle multimodal messages", () => {
      const messages = [
        createMessage("user", "Hello"),
        {
          role: "assistant" as const,
          content: [
            { type: "text", text: "I can see the image" },
            { type: "image", image: "base64data" },
          ],
        },
        createMessage("user", "Recent message"),
        createMessage("assistant", "Recent response"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 1 });

      expect(result.wasCompacted).toBe(true);
      expect(result.compressionSummary).toContain("I can see the image");
    });

    it("should respect maxSummaryTokens limit", () => {
      // Create many long messages
      const longContent = "This is a very long message that should be truncated ".repeat(100);
      const messages = [];
      
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage("user", `${longContent} ${i}`));
        messages.push(createMessage("assistant", `${longContent} response ${i}`));
      }
      
      // Add recent messages
      messages.push(createMessage("user", "Recent"));
      messages.push(createMessage("assistant", "Recent response"));

      const result = compactContext(messages, { 
        ...DEFAULT_COMPACTION_CONFIG, 
        recentTurns: 1,
        maxSummaryTokens: 100 
      });

      expect(result.wasCompacted).toBe(true);
      
      // Estimate tokens in summary (rough check)
      const summaryTokens = Math.ceil((result.compressionSummary || "").length / 4);
      expect(summaryTokens).toBeLessThanOrEqual(150); // Allow some buffer
    });
  });

  describe("shouldCompact", () => {
    it("should return false when disabled", () => {
      expect(shouldCompact(20, { ...DEFAULT_COMPACTION_CONFIG, enabled: false })).toBe(false);
    });

    it("should return false when below threshold", () => {
      expect(shouldCompact(5, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 5 })).toBe(false);
    });

    it("should return true when above threshold", () => {
      expect(shouldCompact(15, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 5 })).toBe(true);
    });
  });

  describe("getCompactionStats", () => {
    it("should calculate correct statistics", () => {
      const result = {
        messages: [],
        wasCompacted: true,
        originalCount: 20,
        compactedCount: 10,
        estimatedTokenReduction: 500,
      };

      const stats = getCompactionStats(result);

      expect(stats.compressionRatio).toBe(0.5);
      expect(stats.tokenSavings).toBe(500);
      expect(stats.messageReduction).toBe(10);
    });

    it("should handle zero original count", () => {
      const result = {
        messages: [],
        wasCompacted: false,
        originalCount: 0,
        compactedCount: 0,
        estimatedTokenReduction: 0,
      };

      const stats = getCompactionStats(result);

      expect(stats.compressionRatio).toBe(1);
      expect(stats.tokenSavings).toBe(0);
      expect(stats.messageReduction).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty message array", () => {
      const result = compactContext([]);

      expect(result.wasCompacted).toBe(false);
      expect(result.messages).toEqual([]);
      expect(result.originalCount).toBe(0);
      expect(result.compactedCount).toBe(0);
    });

    it("should handle messages with empty content", () => {
      const messages = [
        createMessage("user", ""),
        createMessage("assistant", "   "),
        createMessage("user", "Real content"),
        createMessage("assistant", "Real response"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 1 });

      // Should only include messages with actual content
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages.some(m => m.content === "Real content")).toBe(true);
    });

    it("should handle mixed role sequences", () => {
      const messages = [
        createMessage("user", "User 1"),
        createMessage("user", "User 2"), // Consecutive user messages
        createMessage("assistant", "Assistant 1"),
        createMessage("assistant", "Assistant 2"), // Consecutive assistant messages
        createMessage("user", "Recent"),
        createMessage("assistant", "Recent response"),
      ];

      const result = compactContext(messages, { ...DEFAULT_COMPACTION_CONFIG, recentTurns: 1 });

      expect(result.wasCompacted).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });
});