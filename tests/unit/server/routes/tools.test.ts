/**
 * Tools API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { ToolService } from "@/services/tools.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  ToolResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Tools API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/tools-route-test"
  );
  const testUserId = "usr_test-user-tools";
  let projectId: string;

  beforeAll(() => {
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing test data
    rootDb
      .prepare(
        "DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)"
      )
      .run(testUserId);
    rootDb.prepare("DELETE FROM projects WHERE owner_id = ?").run(testUserId);
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "tools-test@example.com", "toolsuser", now, now);

    // Create a test project
    const project = ProjectService.create(rootDb, {
      name: "Tools Test Project",
      ownerId: testUserId,
    });
    projectId = project.id;
  });

  const app = createApp();

  describe("GET /api/tools", () => {
    it("requires projectId", async () => {
      const response = await app.request("/api/tools");

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns empty list when no tools exist", async () => {
      const response = await app.request(`/api/tools?projectId=${projectId}`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ToolResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns tools list with pagination", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      ToolService.create(db, {
        name: "tool-one",
        description: "Tool 1",
        type: "code",
        code: "return 1;",
      });
      ToolService.create(db, {
        name: "tool-two",
        description: "Tool 2",
        type: "code",
        code: "return 2;",
      });
      ToolService.create(db, {
        name: "tool-three",
        description: "Tool 3",
        type: "code",
        code: "return 3;",
      });

      const response = await app.request(
        `/api/tools?projectId=${projectId}&limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ToolResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters by type", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      ToolService.create(db, {
        name: "code-tool",
        description: "Code",
        type: "code",
        code: "return null;",
      });
      ToolService.create(db, {
        name: "http-tool",
        description: "HTTP",
        type: "http",
        httpUrl: "https://api.example.com",
        httpMethod: "GET",
      });

      const response = await app.request(
        `/api/tools?projectId=${projectId}&type=code`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ToolResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.type).toBe("code");
    });

    it("filters by enabled status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      ToolService.create(db, {
        name: "enabled-tool",
        description: "Enabled",
        type: "code",
        code: "return null;",
        enabled: true,
      });
      ToolService.create(db, {
        name: "disabled-tool",
        description: "Disabled",
        type: "code",
        code: "return null;",
        enabled: false,
      });

      const response = await app.request(
        `/api/tools?projectId=${projectId}&enabled=true`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ToolResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.name).toBe("enabled-tool");
    });
  });

  describe("POST /api/tools", () => {
    it("creates a code tool", async () => {
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "new-code-tool",
          description: "A new code tool",
          type: "code",
          code: "return 42;",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.id).toMatch(/^tool_/);
      expect(body.data.name).toBe("new-code-tool");
      expect(body.data.type).toBe("code");
      expect(body.data.code).toBe("return 42;");
    });

    it("creates an MCP tool", async () => {
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "new-mcp-tool",
          description: "An MCP tool",
          type: "mcp",
          mcpServer: "https://mcp.example.com",
          mcpTool: "remote-tool",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.type).toBe("mcp");
      expect(body.data.mcpServer).toBe("https://mcp.example.com");
    });

    it("creates an HTTP tool", async () => {
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "new-http-tool",
          description: "An HTTP tool",
          type: "http",
          httpUrl: "https://api.example.com/endpoint",
          httpMethod: "POST",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.type).toBe("http");
      expect(body.data.httpUrl).toBe("https://api.example.com/endpoint");
      expect(body.data.httpMethod).toBe("POST");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-tool",
          description: "Test",
          type: "code",
          code: "return null;",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects reserved tool names", async () => {
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "bash",
          description: "Invalid",
          type: "code",
          code: "return null;",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicate tool names", async () => {
      // Create first tool
      await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "unique-tool",
          description: "First",
          type: "code",
          code: "return 1;",
        }),
      });

      // Try to create duplicate
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "unique-tool",
          description: "Duplicate",
          type: "code",
          code: "return 2;",
        }),
      });

      expect(response.status).toBe(409);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("CONFLICT");
    });

    it("validates type-specific fields", async () => {
      // Code tool without code
      const response = await app.request("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "no-code",
          description: "Missing code",
          type: "code",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/tools/:id", () => {
    it("returns tool by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const tool = ToolService.create(db, {
        name: "get-test-tool",
        description: "Test tool",
        type: "code",
        code: "return null;",
      });

      const response = await app.request(
        `/api/tools/${tool.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.id).toBe(tool.id);
      expect(body.data.name).toBe("get-test-tool");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/tools/tool_test");

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent tool", async () => {
      const response = await app.request(
        `/api/tools/tool_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/tools/:id", () => {
    it("updates tool description", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const tool = ToolService.create(db, {
        name: "update-test",
        description: "Original",
        type: "code",
        code: "return null;",
      });

      const response = await app.request(`/api/tools/${tool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          description: "Updated description",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.description).toBe("Updated description");
    });

    it("updates tool name", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const tool = ToolService.create(db, {
        name: "original-name",
        description: "Test",
        type: "code",
        code: "return null;",
      });

      const response = await app.request(`/api/tools/${tool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "new-name",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.name).toBe("new-name");
    });

    it("updates enabled status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const tool = ToolService.create(db, {
        name: "enable-test",
        description: "Test",
        type: "code",
        code: "return null;",
      });

      const response = await app.request(`/api/tools/${tool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          enabled: false,
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ToolResponse>;
      expect(body.data.enabled).toBe(false);
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/tools/tool_test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Test",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent tool", async () => {
      const response = await app.request("/api/tools/tool_nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          description: "Test",
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/tools/:id", () => {
    it("soft deletes a tool", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const tool = ToolService.create(db, {
        name: "delete-test",
        description: "Test",
        type: "code",
        code: "return null;",
      });

      const response = await app.request(
        `/api/tools/${tool.id}?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify tool is disabled
      const updated = ToolService.getById(db, tool.id);
      expect(updated?.enabled).toBe(false);
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/tools/tool_test", {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent tool", async () => {
      const response = await app.request(
        `/api/tools/tool_nonexistent?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(404);
    });
  });
});
