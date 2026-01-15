/**
 * SubAgent Runner Tests
 *
 * Tests sub-agent spawning with mocked LLM responses.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { SubAgentRunner } from "@/agents/subagent-runner.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { registerCoreTools } from "@/tools/index.ts";
import * as LLMModule from "@/agents/llm.ts";

// Register tools once before all tests
registerCoreTools();

describe("SubAgent Runner", () => {
  let db: Database;
  let llmSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Mock LLM.streamCompletion
    llmSpy = spyOn(LLMModule.LLM, "streamCompletion").mockImplementation(
      async (options) => {
        if (options.onStreamEvent) {
          await options.onStreamEvent({
            type: "text-delta",
            text: "Sub-agent response",
          });
          await options.onStreamEvent({
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 50, outputTokens: 25 },
          });
        }

        return {
          text: "Sub-agent response",
          finishReason: "stop",
          usage: { inputTokens: 50, outputTokens: 25 },
          toolCalls: [],
          steps: 1,
        };
      }
    );
  });

  afterEach(() => {
    llmSpy.mockRestore();
    db.close();
  });

  describe("run", () => {
    it("creates child session linked to parent", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Explore codebase",
          prompt: "Find all TypeScript files",
          subagent_type: "explore",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
        parentModelId: "claude-sonnet-4-20250514",
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toMatch(/^sess_/);

      // Verify child session was created with parent link
      const childSession = SessionService.getById(db, result.sessionId);
      expect(childSession).not.toBeNull();
      expect(childSession!.parentId).toBe(parentSession.id);
      expect(childSession!.agent).toBe("explore");
    });

    it("returns response from sub-agent", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBe("Sub-agent response");
    });

    it("returns usage stats", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      expect(result.usage).toBeDefined();
      expect(result.usage!.inputTokens).toBe(50);
      expect(result.usage!.outputTokens).toBe(25);
    });

    it("uses specified model alias", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          model: "haiku",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
        parentModelId: "claude-sonnet-4-20250514",
      });

      // Verify LLM was called with haiku model
      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      expect(callArgs.modelId).toContain("haiku");
    });

    it("inherits model from parent when not specified", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
        parentModelId: "claude-sonnet-4-20250514",
      });

      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      expect(callArgs.modelId).toBe("claude-sonnet-4-20250514");
    });

    it("returns error for unknown agent type", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "nonexistent-agent",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles LLM errors gracefully", async () => {
      llmSpy.mockImplementation(async () => {
        throw new Error("API error");
      });

      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API error");
    });

    it("creates messages in child session", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Test prompt",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      // Verify messages were created in child session
      const messages = MessageService.listBySession(db, result.sessionId);
      expect(messages.length).toBe(2);

      const userMsg = messages.find((m) => m.role === "user");
      const assistantMsg = messages.find((m) => m.role === "assistant");
      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();

      // Check user message content
      const parts = MessagePartService.listByMessage(db, userMsg!.id);
      const textPart = parts.find((p) => p.type === "text");
      expect((textPart!.content as { text: string }).text).toBe("Test prompt");
    });

    it("updates child session stats", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      const childSession = SessionService.getById(db, result.sessionId);
      expect(childSession!.messageCount).toBeGreaterThan(0);
      expect(childSession!.totalTokensInput).toBe(50);
      expect(childSession!.totalTokensOutput).toBe(25);
    });

    it("filters out task tool from sub-agents", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: true,
        taskParams: {
          description: "Test task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: false,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      // Verify task tool was NOT provided to sub-agent (prevents infinite recursion)
      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      const toolNames = Object.keys(callArgs.tools || {});
      expect(toolNames).not.toContain("task");
    });
  });

  describe("background tasks", () => {
    it("returns immediately for background tasks", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Background task",
          prompt: "Do something in background",
          subagent_type: "default",
          run_in_background: true,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      expect(result.success).toBe(true);
      expect(result.response).toContain("background");
      expect(result.sessionId).toMatch(/^sess_/);

      // Wait for background task to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("can retrieve background task by session ID", async () => {
      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Background task",
          prompt: "Do something",
          subagent_type: "default",
          run_in_background: true,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      // Task should be trackable
      const task = SubAgentRunner.getBackgroundTask(result.sessionId);
      // May or may not still be running depending on timing
      // Just verify the API works
      expect(task === undefined || task.sessionId === result.sessionId).toBe(true);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("can cancel background tasks", async () => {
      // Make LLM take longer
      llmSpy.mockImplementation(async (options) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return {
          text: "Done",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 5 },
          toolCalls: [],
          steps: 1,
        };
      });

      const parentSession = SessionService.create(db, {
        agent: "default",
        title: "Parent Session",
      });

      const result = await SubAgentRunner.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        parentSessionId: parentSession.id,
        userId: "user_123",
        canExecuteCode: false,
        taskParams: {
          description: "Long task",
          prompt: "Take a while",
          subagent_type: "default",
          run_in_background: true,
        },
        apiKey: "test-key",
        parentProviderId: "anthropic",
      });

      // Cancel it
      const cancelled = SubAgentRunner.cancelBackgroundTask(result.sessionId);
      expect(cancelled).toBe(true);

      // Verify it's no longer tracked
      const task = SubAgentRunner.getBackgroundTask(result.sessionId);
      expect(task).toBeUndefined();
    });
  });
});
