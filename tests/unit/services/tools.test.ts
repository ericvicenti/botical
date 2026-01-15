/**
 * Tool Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ToolService } from "@/services/tools.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";

describe("Tool Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a code tool", () => {
      const tool = ToolService.create(db, {
        name: "my-code-tool",
        description: "A custom code tool",
        type: "code",
        code: "return 42;",
        parametersSchema: { type: "object" },
      });

      expect(tool.id).toMatch(/^tool_/);
      expect(tool.name).toBe("my-code-tool");
      expect(tool.description).toBe("A custom code tool");
      expect(tool.type).toBe("code");
      expect(tool.code).toBe("return 42;");
      expect(tool.enabled).toBe(true);
    });

    it("creates an MCP tool", () => {
      const tool = ToolService.create(db, {
        name: "my-mcp-tool",
        description: "An MCP tool",
        type: "mcp",
        mcpServer: "https://mcp.example.com",
        mcpTool: "remote-tool",
        parametersSchema: {},
      });

      expect(tool.type).toBe("mcp");
      expect(tool.mcpServer).toBe("https://mcp.example.com");
      expect(tool.mcpTool).toBe("remote-tool");
    });

    it("creates an HTTP tool", () => {
      const tool = ToolService.create(db, {
        name: "my-http-tool",
        description: "An HTTP tool",
        type: "http",
        httpUrl: "https://api.example.com/endpoint",
        httpMethod: "POST",
        parametersSchema: {},
      });

      expect(tool.type).toBe("http");
      expect(tool.httpUrl).toBe("https://api.example.com/endpoint");
      expect(tool.httpMethod).toBe("POST");
    });

    it("creates a disabled tool", () => {
      const tool = ToolService.create(db, {
        name: "disabled-tool",
        description: "A disabled tool",
        type: "code",
        code: "return null;",
        enabled: false,
      });

      expect(tool.enabled).toBe(false);
    });

    it("throws for reserved tool names", () => {
      expect(() => {
        ToolService.create(db, {
          name: "read",
          description: "Invalid tool",
          type: "code",
          code: "return null;",
        });
      }).toThrow();
    });

    it("throws for duplicate tool names", () => {
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

    it("throws for invalid tool name format", () => {
      expect(() => {
        ToolService.create(db, {
          name: "InvalidName",
          description: "Bad name",
          type: "code",
          code: "return null;",
        });
      }).toThrow();

      expect(() => {
        ToolService.create(db, {
          name: "123-tool",
          description: "Bad name",
          type: "code",
          code: "return null;",
        });
      }).toThrow();
    });

    it("throws when code is missing for code tools", () => {
      expect(() => {
        ToolService.create(db, {
          name: "no-code-tool",
          description: "Missing code",
          type: "code",
        });
      }).toThrow();
    });

    it("throws when mcp fields are missing for MCP tools", () => {
      expect(() => {
        ToolService.create(db, {
          name: "no-mcp-server",
          description: "Missing server",
          type: "mcp",
        });
      }).toThrow();

      expect(() => {
        ToolService.create(db, {
          name: "no-mcp-tool",
          description: "Missing tool",
          type: "mcp",
          mcpServer: "https://mcp.example.com",
        });
      }).toThrow();
    });

    it("throws when http fields are missing for HTTP tools", () => {
      expect(() => {
        ToolService.create(db, {
          name: "no-http-url",
          description: "Missing URL",
          type: "http",
        });
      }).toThrow();

      expect(() => {
        ToolService.create(db, {
          name: "no-http-method",
          description: "Missing method",
          type: "http",
          httpUrl: "https://api.example.com",
        });
      }).toThrow();
    });
  });

  describe("getById", () => {
    it("retrieves a tool by ID", () => {
      const created = ToolService.create(db, {
        name: "test-tool",
        description: "Test tool",
        type: "code",
        code: "return null;",
      });

      const retrieved = ToolService.getById(db, created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("test-tool");
    });

    it("returns null for non-existent ID", () => {
      const result = ToolService.getById(db, "tool_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("retrieves a tool or throws", () => {
      const created = ToolService.create(db, {
        name: "test-tool",
        description: "Test tool",
        type: "code",
        code: "return null;",
      });

      const retrieved = ToolService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws NotFoundError for non-existent ID", () => {
      expect(() => {
        ToolService.getByIdOrThrow(db, "tool_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("getByName", () => {
    it("retrieves a tool by name", () => {
      ToolService.create(db, {
        name: "named-tool",
        description: "Named tool",
        type: "code",
        code: "return null;",
      });

      const retrieved = ToolService.getByName(db, "named-tool");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("named-tool");
    });

    it("returns null for non-existent name", () => {
      const result = ToolService.getByName(db, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByNameOrThrow", () => {
    it("retrieves a tool by name or throws", () => {
      ToolService.create(db, {
        name: "named-tool",
        description: "Named tool",
        type: "code",
        code: "return null;",
      });

      const retrieved = ToolService.getByNameOrThrow(db, "named-tool");
      expect(retrieved.name).toBe("named-tool");
    });

    it("throws NotFoundError for non-existent name", () => {
      expect(() => {
        ToolService.getByNameOrThrow(db, "nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("list", () => {
    beforeEach(() => {
      ToolService.create(db, {
        name: "code-tool",
        description: "Code tool",
        type: "code",
        code: "return 1;",
      });
      ToolService.create(db, {
        name: "mcp-tool",
        description: "MCP tool",
        type: "mcp",
        mcpServer: "https://mcp.example.com",
        mcpTool: "tool",
      });
      ToolService.create(db, {
        name: "http-tool",
        description: "HTTP tool",
        type: "http",
        httpUrl: "https://api.example.com",
        httpMethod: "GET",
      });
      ToolService.create(db, {
        name: "disabled-tool",
        description: "Disabled tool",
        type: "code",
        code: "return null;",
        enabled: false,
      });
    });

    it("lists all tools", () => {
      const tools = ToolService.list(db);
      expect(tools.length).toBe(4);
    });

    it("filters by type", () => {
      const codeTools = ToolService.list(db, { type: "code" });
      expect(codeTools.length).toBe(2);
      expect(codeTools.every((t) => t.type === "code")).toBe(true);

      const mcpTools = ToolService.list(db, { type: "mcp" });
      expect(mcpTools.length).toBe(1);
    });

    it("filters by enabled status", () => {
      const enabledTools = ToolService.list(db, { enabled: true });
      expect(enabledTools.length).toBe(3);

      const disabledTools = ToolService.list(db, { enabled: false });
      expect(disabledTools.length).toBe(1);
    });

    it("supports pagination", () => {
      const page1 = ToolService.list(db, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = ToolService.list(db, { limit: 2, offset: 2 });
      expect(page2.length).toBe(2);

      const page3 = ToolService.list(db, { limit: 2, offset: 4 });
      expect(page3.length).toBe(0);
    });
  });

  describe("update", () => {
    it("updates tool description", () => {
      const tool = ToolService.create(db, {
        name: "update-tool",
        description: "Original",
        type: "code",
        code: "return null;",
      });

      const updated = ToolService.update(db, tool.id, {
        description: "Updated",
      });

      expect(updated.description).toBe("Updated");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(tool.updatedAt);
    });

    it("updates tool name", () => {
      const tool = ToolService.create(db, {
        name: "original-name",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      const updated = ToolService.update(db, tool.id, {
        name: "new-name",
      });

      expect(updated.name).toBe("new-name");
    });

    it("throws for reserved name on update", () => {
      const tool = ToolService.create(db, {
        name: "my-tool",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      expect(() => {
        ToolService.update(db, tool.id, { name: "bash" });
      }).toThrow(ValidationError);
    });

    it("throws for duplicate name on update", () => {
      ToolService.create(db, {
        name: "existing-tool",
        description: "Existing",
        type: "code",
        code: "return null;",
      });

      const tool = ToolService.create(db, {
        name: "my-tool",
        description: "My tool",
        type: "code",
        code: "return null;",
      });

      expect(() => {
        ToolService.update(db, tool.id, { name: "existing-tool" });
      }).toThrow(ConflictError);
    });

    it("updates enabled status", () => {
      const tool = ToolService.create(db, {
        name: "enable-test",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      const disabled = ToolService.update(db, tool.id, { enabled: false });
      expect(disabled.enabled).toBe(false);

      const enabled = ToolService.update(db, tool.id, { enabled: true });
      expect(enabled.enabled).toBe(true);
    });

    it("updates parameters schema", () => {
      const tool = ToolService.create(db, {
        name: "schema-tool",
        description: "Tool",
        type: "code",
        code: "return null;",
        parametersSchema: {},
      });

      const updated = ToolService.update(db, tool.id, {
        parametersSchema: { type: "object", properties: { foo: { type: "string" } } },
      });

      expect(updated.parametersSchema).toEqual({
        type: "object",
        properties: { foo: { type: "string" } },
      });
    });

    it("throws for non-existent tool", () => {
      expect(() => {
        ToolService.update(db, "tool_nonexistent", { description: "Updated" });
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("soft deletes a tool (sets enabled=0)", () => {
      const tool = ToolService.create(db, {
        name: "delete-test",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      ToolService.delete(db, tool.id);

      const retrieved = ToolService.getById(db, tool.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.enabled).toBe(false);
    });

    it("throws for non-existent tool", () => {
      expect(() => {
        ToolService.delete(db, "tool_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("hardDelete", () => {
    it("permanently deletes a tool", () => {
      const tool = ToolService.create(db, {
        name: "hard-delete-test",
        description: "Tool",
        type: "code",
        code: "return null;",
      });

      ToolService.hardDelete(db, tool.id);

      const retrieved = ToolService.getById(db, tool.id);
      expect(retrieved).toBeNull();
    });

    it("throws for non-existent tool", () => {
      expect(() => {
        ToolService.hardDelete(db, "tool_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("count", () => {
    beforeEach(() => {
      ToolService.create(db, {
        name: "code-tool-1",
        description: "Code 1",
        type: "code",
        code: "return 1;",
      });
      ToolService.create(db, {
        name: "code-tool-2",
        description: "Code 2",
        type: "code",
        code: "return 2;",
        enabled: false,
      });
      ToolService.create(db, {
        name: "mcp-tool",
        description: "MCP",
        type: "mcp",
        mcpServer: "https://mcp.example.com",
        mcpTool: "tool",
      });
    });

    it("counts all tools", () => {
      expect(ToolService.count(db)).toBe(3);
    });

    it("counts by type", () => {
      expect(ToolService.count(db, { type: "code" })).toBe(2);
      expect(ToolService.count(db, { type: "mcp" })).toBe(1);
      expect(ToolService.count(db, { type: "http" })).toBe(0);
    });

    it("counts by enabled status", () => {
      expect(ToolService.count(db, { enabled: true })).toBe(2);
      expect(ToolService.count(db, { enabled: false })).toBe(1);
    });
  });

  describe("isReservedName", () => {
    it("returns true for reserved names", () => {
      expect(ToolService.isReservedName("read")).toBe(true);
      expect(ToolService.isReservedName("write")).toBe(true);
      expect(ToolService.isReservedName("bash")).toBe(true);
      expect(ToolService.isReservedName("web_search")).toBe(true);
    });

    it("returns false for non-reserved names", () => {
      expect(ToolService.isReservedName("my-tool")).toBe(false);
      expect(ToolService.isReservedName("custom-tool")).toBe(false);
    });
  });

  describe("getReservedNames", () => {
    it("returns list of reserved names", () => {
      const reserved = ToolService.getReservedNames();
      expect(reserved).toContain("read");
      expect(reserved).toContain("write");
      expect(reserved).toContain("bash");
      expect(reserved.length).toBeGreaterThan(0);
    });
  });
});
