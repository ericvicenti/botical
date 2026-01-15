/**
 * Custom Tools Integration Tests
 *
 * Tests the complete custom tools system including CRUD operations,
 * validation, and project scoping.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ToolService } from "@/services/tools.ts";
import { ConflictError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

describe("Custom Tools Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/custom-tools"
  );
  const testProjectId = "test-custom-tools";

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("tool creation workflow", () => {
    it("creates and retrieves code tools", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create a code tool
      const tool = ToolService.create(db, {
        name: "calculate-sum",
        description: "Calculates the sum of two numbers",
        type: "code",
        code: `function calculate(params) { return params.a + params.b; }`,
        parametersSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
      });

      expect(tool.id).toMatch(/^tool_/);
      expect(tool.name).toBe("calculate-sum");
      expect(tool.type).toBe("code");
      expect(tool.enabled).toBe(true);

      // Retrieve by name
      const byName = ToolService.getByName(db, "calculate-sum");
      expect(byName).not.toBeNull();
      expect(byName?.id).toBe(tool.id);

      // Retrieve by ID
      const byId = ToolService.getById(db, tool.id);
      expect(byId).not.toBeNull();
      expect(byId?.name).toBe("calculate-sum");
    });

    it("creates MCP tools with server configuration", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "external-api",
        description: "Calls an external MCP API",
        type: "mcp",
        mcpServer: "https://mcp.example.com",
        mcpTool: "data-processor",
        parametersSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
      });

      expect(tool.type).toBe("mcp");
      expect(tool.mcpServer).toBe("https://mcp.example.com");
      expect(tool.mcpTool).toBe("data-processor");
    });

    it("creates HTTP tools with endpoint configuration", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "webhook-caller",
        description: "Calls a webhook endpoint",
        type: "http",
        httpUrl: "https://api.example.com/webhook",
        httpMethod: "POST",
        parametersSchema: {
          type: "object",
          properties: {
            payload: { type: "object" },
          },
        },
      });

      expect(tool.type).toBe("http");
      expect(tool.httpUrl).toBe("https://api.example.com/webhook");
      expect(tool.httpMethod).toBe("POST");
    });
  });

  describe("tool validation", () => {
    it("enforces unique tool names", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      ToolService.create(db, {
        name: "unique-tool",
        description: "First tool",
        type: "code",
        code: "return 1;",
      });

      expect(() => {
        ToolService.create(db, {
          name: "unique-tool",
          description: "Duplicate",
          type: "code",
          code: "return 2;",
        });
      }).toThrow(ConflictError);
    });

    it("prevents reserved tool names", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const reservedNames = ToolService.getReservedNames();

      for (const name of reservedNames) {
        expect(() => {
          ToolService.create(db, {
            name,
            description: "Invalid",
            type: "code",
            code: "return null;",
          });
        }).toThrow();
      }
    });

    it("validates tool name format", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Invalid formats
      const invalidNames = [
        "Tool-Name", // Uppercase
        "123-tool", // Starts with number
        "tool_name", // Underscores
        "tool name", // Spaces
        "tool.name", // Dots
      ];

      for (const name of invalidNames) {
        expect(() => {
          ToolService.create(db, {
            name,
            description: "Invalid",
            type: "code",
            code: "return null;",
          });
        }).toThrow();
      }

      // Valid format
      const validTool = ToolService.create(db, {
        name: "valid-tool-name",
        description: "Valid",
        type: "code",
        code: "return null;",
      });
      expect(validTool.name).toBe("valid-tool-name");
    });

    it("enforces type-specific field requirements", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Code tool without code
      expect(() => {
        ToolService.create(db, {
          name: "no-code",
          description: "Missing code",
          type: "code",
        });
      }).toThrow();

      // MCP tool without server
      expect(() => {
        ToolService.create(db, {
          name: "no-mcp-server",
          description: "Missing server",
          type: "mcp",
        });
      }).toThrow();

      // HTTP tool without URL
      expect(() => {
        ToolService.create(db, {
          name: "no-http-url",
          description: "Missing URL",
          type: "http",
        });
      }).toThrow();
    });
  });

  describe("tool lifecycle", () => {
    it("updates tool configuration", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "updatable-tool",
        description: "Original description",
        type: "code",
        code: "return 1;",
      });

      const updated = ToolService.update(db, tool.id, {
        description: "Updated description",
        code: "return 2;",
      });

      expect(updated.description).toBe("Updated description");
      expect(updated.code).toBe("return 2;");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(tool.updatedAt);
    });

    it("renames tools with validation", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "original-name",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      // Valid rename
      const renamed = ToolService.update(db, tool.id, {
        name: "new-name",
      });
      expect(renamed.name).toBe("new-name");

      // Cannot rename to reserved name
      expect(() => {
        ToolService.update(db, tool.id, { name: "bash" });
      }).toThrow();
    });

    it("soft deletes tools (disable)", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "deletable-tool",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      ToolService.delete(db, tool.id);

      const deleted = ToolService.getById(db, tool.id);
      expect(deleted).not.toBeNull();
      expect(deleted?.enabled).toBe(false);
    });

    it("hard deletes tools permanently", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tool = ToolService.create(db, {
        name: "permanent-delete",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      ToolService.hardDelete(db, tool.id);

      const deleted = ToolService.getById(db, tool.id);
      expect(deleted).toBeNull();
    });
  });

  describe("tool listing and filtering", () => {
    beforeEach(() => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create a variety of tools
      ToolService.create(db, {
        name: "code-enabled",
        description: "Enabled code tool",
        type: "code",
        code: "return 1;",
        enabled: true,
      });
      ToolService.create(db, {
        name: "code-disabled",
        description: "Disabled code tool",
        type: "code",
        code: "return 2;",
        enabled: false,
      });
      ToolService.create(db, {
        name: "mcp-tool",
        description: "MCP tool",
        type: "mcp",
        mcpServer: "https://mcp.example.com",
        mcpTool: "processor",
        enabled: true,
      });
      ToolService.create(db, {
        name: "http-tool",
        description: "HTTP tool",
        type: "http",
        httpUrl: "https://api.example.com",
        httpMethod: "GET",
        enabled: true,
      });
    });

    it("lists all tools", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const tools = ToolService.list(db);
      expect(tools.length).toBe(4);
    });

    it("filters by type", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const codeTools = ToolService.list(db, { type: "code" });
      expect(codeTools.length).toBe(2);
      expect(codeTools.every((t) => t.type === "code")).toBe(true);

      const mcpTools = ToolService.list(db, { type: "mcp" });
      expect(mcpTools.length).toBe(1);

      const httpTools = ToolService.list(db, { type: "http" });
      expect(httpTools.length).toBe(1);
    });

    it("filters by enabled status", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const enabledTools = ToolService.list(db, { enabled: true });
      expect(enabledTools.length).toBe(3);

      const disabledTools = ToolService.list(db, { enabled: false });
      expect(disabledTools.length).toBe(1);
      expect(disabledTools[0]!.name).toBe("code-disabled");
    });

    it("supports pagination", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const page1 = ToolService.list(db, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = ToolService.list(db, { limit: 2, offset: 2 });
      expect(page2.length).toBe(2);

      const page3 = ToolService.list(db, { limit: 2, offset: 4 });
      expect(page3.length).toBe(0);
    });

    it("counts tools with filters", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      expect(ToolService.count(db)).toBe(4);
      expect(ToolService.count(db, { type: "code" })).toBe(2);
      expect(ToolService.count(db, { enabled: true })).toBe(3);
      expect(ToolService.count(db, { type: "code", enabled: true })).toBe(1);
    });
  });

  describe("project isolation", () => {
    it("isolates tools between projects", () => {
      const project1 = "project-1";
      const project2 = "project-2";

      const db1 = DatabaseManager.getProjectDb(project1);
      const db2 = DatabaseManager.getProjectDb(project2);

      ToolService.create(db1, {
        name: "shared-name",
        description: "Project 1 tool",
        type: "code",
        code: "return 'project1';",
      });

      // Same name allowed in different project
      const tool2 = ToolService.create(db2, {
        name: "shared-name",
        description: "Project 2 tool",
        type: "code",
        code: "return 'project2';",
      });

      expect(tool2.name).toBe("shared-name");

      // Each project has its own tools
      expect(ToolService.list(db1).length).toBe(1);
      expect(ToolService.list(db2).length).toBe(1);

      const tool1 = ToolService.getByName(db1, "shared-name");
      const tool2Retrieved = ToolService.getByName(db2, "shared-name");

      expect(tool1?.code).toBe("return 'project1';");
      expect(tool2Retrieved?.code).toBe("return 'project2';");
    });
  });
});
