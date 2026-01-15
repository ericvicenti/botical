/**
 * Tool Registry Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "@/tools/registry.ts";
import { defineTool, type ToolExecutionContext } from "@/tools/types.ts";

// Mock tool execution context
const mockContext: ToolExecutionContext = {
  projectId: "proj_test",
  projectPath: "/test/project",
  sessionId: "sess_test",
  messageId: "msg_test",
  userId: "usr_test",
  abortSignal: new AbortController().signal,
  updateMetadata: () => {},
};

// Test tool
const testTool = defineTool("test_tool", {
  description: "A test tool",
  parameters: z.object({
    input: z.string(),
  }),
  execute: async (args) => ({
    title: "Test Result",
    output: `Processed: ${args.input}`,
    success: true,
  }),
});

// Another test tool
const anotherTool = defineTool("another_tool", {
  description: "Another test tool",
  parameters: z.object({
    count: z.number(),
  }),
  execute: async (args) => ({
    title: "Another Result",
    output: `Count: ${args.count}`,
    success: true,
  }),
});

describe("Tool Registry", () => {
  beforeEach(() => {
    // Clear registry before each test
    ToolRegistry.clear();
  });

  describe("register", () => {
    it("registers a tool successfully", () => {
      ToolRegistry.register(testTool, { category: "other" });

      expect(ToolRegistry.has("test_tool")).toBe(true);
    });

    it("throws when registering duplicate tool", () => {
      ToolRegistry.register(testTool, { category: "other" });

      expect(() => {
        ToolRegistry.register(testTool, { category: "other" });
      }).toThrow('Tool "test_tool" is already registered');
    });

    it("registers with default category", () => {
      ToolRegistry.register(testTool);

      const tool = ToolRegistry.get("test_tool");
      expect(tool?.category).toBe("other");
    });

    it("registers with requiresCodeExecution flag", () => {
      ToolRegistry.register(testTool, {
        category: "execution",
        requiresCodeExecution: true,
      });

      const tool = ToolRegistry.get("test_tool");
      expect(tool?.requiresCodeExecution).toBe(true);
    });
  });

  describe("unregister", () => {
    it("removes a registered tool", () => {
      ToolRegistry.register(testTool);
      expect(ToolRegistry.has("test_tool")).toBe(true);

      const result = ToolRegistry.unregister("test_tool");
      expect(result).toBe(true);
      expect(ToolRegistry.has("test_tool")).toBe(false);
    });

    it("returns false for non-existent tool", () => {
      const result = ToolRegistry.unregister("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("get", () => {
    it("returns registered tool", () => {
      ToolRegistry.register(testTool, { category: "filesystem" });

      const tool = ToolRegistry.get("test_tool");
      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe("test_tool");
      expect(tool?.category).toBe("filesystem");
    });

    it("returns undefined for non-existent tool", () => {
      const tool = ToolRegistry.get("nonexistent");
      expect(tool).toBeUndefined();
    });
  });

  describe("getDefinition", () => {
    it("returns tool definition", () => {
      ToolRegistry.register(testTool);

      const def = ToolRegistry.getDefinition("test_tool");
      expect(def?.name).toBe("test_tool");
      expect(def?.description).toBe("A test tool");
    });

    it("returns undefined for non-existent tool", () => {
      const def = ToolRegistry.getDefinition("nonexistent");
      expect(def).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("returns all registered tools", () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);

      const tools = ToolRegistry.getAll();
      expect(tools.length).toBe(2);
    });

    it("returns empty array when no tools registered", () => {
      const tools = ToolRegistry.getAll();
      expect(tools.length).toBe(0);
    });
  });

  describe("getByCategory", () => {
    it("filters tools by category", () => {
      ToolRegistry.register(testTool, { category: "filesystem" });
      ToolRegistry.register(anotherTool, { category: "execution" });

      const filesystemTools = ToolRegistry.getByCategory("filesystem");
      expect(filesystemTools.length).toBe(1);
      expect(filesystemTools[0]!.definition.name).toBe("test_tool");
    });
  });

  describe("getNames", () => {
    it("returns all tool names", () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);

      const names = ToolRegistry.getNames();
      expect(names).toContain("test_tool");
      expect(names).toContain("another_tool");
    });
  });

  describe("getSafeTools", () => {
    it("returns only tools that don't require code execution", () => {
      ToolRegistry.register(testTool, { requiresCodeExecution: false });
      ToolRegistry.register(anotherTool, { requiresCodeExecution: true });

      const safeTools = ToolRegistry.getSafeTools();
      expect(safeTools.length).toBe(1);
      expect(safeTools[0]!.definition.name).toBe("test_tool");
    });
  });

  describe("toAITools", () => {
    it("converts tools to AI SDK format", () => {
      ToolRegistry.register(testTool);

      const aiTools = ToolRegistry.toAITools(mockContext);
      expect(aiTools.test_tool).toBeDefined();
    });

    it("filters by tool names", () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);

      const aiTools = ToolRegistry.toAITools(mockContext, {
        toolNames: ["test_tool"],
      });
      expect(aiTools.test_tool).toBeDefined();
      expect(aiTools.another_tool).toBeUndefined();
    });

    it("filters by code execution permission", () => {
      ToolRegistry.register(testTool, { requiresCodeExecution: false });
      ToolRegistry.register(anotherTool, { requiresCodeExecution: true });

      const aiTools = ToolRegistry.toAITools(mockContext, {
        canExecuteCode: false,
      });
      expect(aiTools.test_tool).toBeDefined();
      expect(aiTools.another_tool).toBeUndefined();
    });

    it("includes code execution tools when permitted", () => {
      ToolRegistry.register(testTool, { requiresCodeExecution: false });
      ToolRegistry.register(anotherTool, { requiresCodeExecution: true });

      const aiTools = ToolRegistry.toAITools(mockContext, {
        canExecuteCode: true,
      });
      expect(aiTools.test_tool).toBeDefined();
      expect(aiTools.another_tool).toBeDefined();
    });
  });

  describe("clear", () => {
    it("removes all registered tools", () => {
      ToolRegistry.register(testTool);
      ToolRegistry.register(anotherTool);
      expect(ToolRegistry.getAll().length).toBe(2);

      ToolRegistry.clear();
      expect(ToolRegistry.getAll().length).toBe(0);
    });
  });
});
