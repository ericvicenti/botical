/**
 * Agent Orchestrator Tests
 *
 * Tests the orchestrator with mocked LLM responses to verify:
 * - Agent configuration resolution
 * - Tool filtering based on agent config
 * - Task tool handling for sub-agents
 * - Message creation and stats tracking
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { AgentRegistry } from "@/agents/registry.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { registerCoreTools } from "@/tools/index.ts";
import * as LLMModule from "@/agents/llm.ts";

// Register tools once before all tests
registerCoreTools();

describe("Agent Orchestrator", () => {
  let db: Database;
  let llmSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Mock LLM.streamCompletion to avoid real API calls
    llmSpy = spyOn(LLMModule.LLM, "streamCompletion").mockImplementation(
      async (options) => {
        // Simulate streaming events
        if (options.onStreamEvent) {
          await options.onStreamEvent({ type: "text-delta", text: "Hello " });
          await options.onStreamEvent({ type: "text-delta", text: "world!" });
          await options.onStreamEvent({
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 50 },
          });
        }

        return {
          text: "Hello world!",
          finishReason: "stop",
          usage: { inputTokens: 100, outputTokens: 50 },
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
    it("creates user and assistant messages", async () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: true,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      const messages = MessageService.listBySession(db, session.id);
      expect(messages.length).toBe(2);

      // Find messages by role (don't rely on array order since IDs have random components)
      const userMsg = messages.find((m) => m.role === "user");
      const assistantMsg = messages.find((m) => m.role === "assistant");
      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
    });

    it("uses default agent when none specified", async () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: true,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      // Verify LLM was called with system prompt from default agent
      expect(llmSpy).toHaveBeenCalled();
      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      expect(callArgs.system).toContain("coding"); // Default agent prompt mentions coding
    });

    it("uses specified agent configuration", async () => {
      const session = SessionService.create(db, {
        agent: "explore",
        title: "Explore Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: false,
        content: "Find files",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      // Verify LLM was called
      expect(llmSpy).toHaveBeenCalled();
      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;

      // Explore agent should have exploration-focused prompt
      expect(callArgs.system).toContain("exploration");
    });

    it("overrides agent with agentName option", async () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: false,
        content: "Plan this",
        apiKey: "test-key",
        providerId: "anthropic",
        agentName: "plan", // Override session's agent
      });

      expect(llmSpy).toHaveBeenCalled();
      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;

      // Plan agent prompt should mention architect
      expect(callArgs.system).toContain("architect");
    });

    it("returns message ID and usage stats", async () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const result = await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: true,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      expect(result.messageId).toMatch(/^msg_/);
      expect(result.finishReason).toBe("stop");
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
    });

    it("throws error for non-existent agent", async () => {
      const session = SessionService.create(db, {
        agent: "nonexistent",
        title: "Test Session",
      });

      await expect(
        AgentOrchestrator.run({
          db,
          projectId: "proj_123",
          projectPath: "/test/path",
          sessionId: session.id,
          userId: "user_123",
          canExecuteCode: true,
          content: "Hello",
          apiKey: "test-key",
          providerId: "anthropic",
        })
      ).rejects.toThrow(/not found/);
    });

    it("throws error for non-existent session", async () => {
      await expect(
        AgentOrchestrator.run({
          db,
          projectId: "proj_123",
          projectPath: "/test/path",
          sessionId: "sess_nonexistent",
          userId: "user_123",
          canExecuteCode: true,
          content: "Hello",
          apiKey: "test-key",
          providerId: "anthropic",
        })
      ).rejects.toThrow();
    });
  });

  describe("tool filtering", () => {
    it("provides tools based on agent configuration", async () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: true,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      const toolNames = Object.keys(callArgs.tools || {});

      // Default agent should have all standard tools
      expect(toolNames).toContain("read");
      expect(toolNames).toContain("write");
      expect(toolNames).toContain("glob");
      expect(toolNames).toContain("grep");
    });

    it("restricts tools for explore agent", async () => {
      const session = SessionService.create(db, {
        agent: "explore",
        title: "Explore Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: false,
        content: "Find files",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      const toolNames = Object.keys(callArgs.tools || {});

      // Explore agent should only have read-only tools
      expect(toolNames).toContain("read");
      expect(toolNames).toContain("glob");
      expect(toolNames).toContain("grep");
      expect(toolNames).not.toContain("write");
      expect(toolNames).not.toContain("edit");
      expect(toolNames).not.toContain("bash");
    });
  });

  describe("agent settings", () => {
    it("uses agent temperature when specified", async () => {
      const session = SessionService.create(db, {
        agent: "explore", // Explore agent has temperature: 0.3
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: false,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
      });

      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      expect(callArgs.temperature).toBe(0.3);
    });

    it("allows temperature override via options", async () => {
      const session = SessionService.create(db, {
        agent: "explore",
        title: "Test Session",
      });

      await AgentOrchestrator.run({
        db,
        projectId: "proj_123",
        projectPath: "/test/path",
        sessionId: session.id,
        userId: "user_123",
        canExecuteCode: false,
        content: "Hello",
        apiKey: "test-key",
        providerId: "anthropic",
        temperature: 0.9, // Override agent's temperature
      });

      const callArgs = llmSpy.mock.calls[0]![0] as LLMModule.LLMCallOptions;
      expect(callArgs.temperature).toBe(0.9);
    });
  });

  describe("error handling", () => {
    it("marks message as errored on LLM failure", async () => {
      // Mock LLM to throw error
      llmSpy.mockImplementation(async () => {
        throw new Error("API rate limited");
      });

      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      await expect(
        AgentOrchestrator.run({
          db,
          projectId: "proj_123",
          projectPath: "/test/path",
          sessionId: session.id,
          userId: "user_123",
          canExecuteCode: true,
          content: "Hello",
          apiKey: "test-key",
          providerId: "anthropic",
        })
      ).rejects.toThrow("API rate limited");

      // Check that the assistant message was marked as errored
      const messages = MessageService.listBySession(db, session.id);
      const assistantMsg = messages.find((m) => m.role === "assistant");
      expect(assistantMsg?.errorType).toBe("Error");
      expect(assistantMsg?.errorMessage).toBe("API rate limited");
    });
  });
});
