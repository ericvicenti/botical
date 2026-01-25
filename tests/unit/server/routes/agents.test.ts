/**
 * Agents API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { AgentService } from "@/services/agents.ts";
import { ProjectService } from "@/services/projects.ts";
import type {
  ItemResponse,
  ErrorResponse,
  AgentResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

interface AgentListResponse {
  data: Array<AgentResponse & { isBuiltin: boolean; mode: string }>;
  meta: {
    total: number;
    builtinCount: number;
    customCount: number;
  };
}

describe("Agents API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/agents-route-test"
  );
  let testProjectId: string;
  let testProjectPath: string;

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
    // Reset and configure for test directory
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    // Clean up any existing test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

    // Create test project in root database with path for YAML support
    const rootDb = DatabaseManager.getRootDb();
    // Create a test user first
    rootDb.query(`
      INSERT OR IGNORE INTO users (id, email, username, created_at, updated_at)
      VALUES ('usr_test', 'test@example.com', 'testuser', ?, ?)
    `).run(Date.now(), Date.now());
    // Create the project with a path - capture the returned project to get the actual ID
    testProjectPath = path.join(testDataDir, "test-project");
    const project = ProjectService.create(rootDb, {
      name: "Test Agent Project",
      ownerId: "usr_test",
      type: "local",
      path: testProjectPath,
    });
    testProjectId = project.id;
    // Create the .iris directory for YAML agents
    const irisDir = path.join(testProjectPath, ".iris", "agents");
    fs.mkdirSync(irisDir, { recursive: true });
  });

  const app = createApp();

  describe("GET /api/agents", () => {
    it("returns built-in agents without projectId", async () => {
      const response = await app.request("/api/agents");

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta.builtinCount).toBeGreaterThan(0);

      // Check that default agent exists
      const defaultAgent = body.data.find((a) => a.name === "default");
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent!.isBuiltin).toBe(true);
    });

    it("returns both built-in and custom agents with projectId", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "custom-agent",
        description: "A custom agent",
        mode: "subagent",
      });

      const response = await app.request(
        `/api/agents?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.meta.customCount).toBe(1);

      const customAgent = body.data.find((a) => a.name === "custom-agent");
      expect(customAgent).toBeDefined();
      expect(customAgent!.isBuiltin).toBe(false);
    });

    it("filters by mode", async () => {
      const response = await app.request("/api/agents?mode=primary");

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      // All returned agents should be usable as primary
      for (const agent of body.data) {
        expect(agent.mode === "primary" || agent.mode === "all").toBe(true);
      }
    });

    it("filters to built-in only", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "custom-agent",
        mode: "subagent",
      });

      const response = await app.request(
        `/api/agents?projectId=${testProjectId}&builtinOnly=true`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.meta.customCount).toBe(0);
    });

    it("filters to custom only", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "custom-agent",
        mode: "subagent",
      });

      const response = await app.request(
        `/api/agents?projectId=${testProjectId}&customOnly=true`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.meta.builtinCount).toBe(0);
      expect(body.meta.customCount).toBe(1);
    });
  });

  describe("POST /api/agents", () => {
    it("creates a custom agent", async () => {
      const response = await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "my-custom-agent",
          description: "A custom agent for testing",
          mode: "subagent",
          tools: ["read", "glob"],
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<AgentResponse & { isBuiltin: boolean }>;
      expect(body.data.name).toBe("my-custom-agent");
      expect(body.data.description).toBe("A custom agent for testing");
      expect(body.data.isBuiltin).toBe(false);
    });

    it("rejects reserved names", async () => {
      const response = await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "default",
          mode: "subagent",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("reserved");
    });

    it("validates agent name format", async () => {
      const response = await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Invalid Name",
          mode: "subagent",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-agent",
          mode: "subagent",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/agents/:name", () => {
    it("returns built-in agent by name", async () => {
      const response = await app.request("/api/agents/default");

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<AgentResponse & { isBuiltin: boolean }>;
      expect(body.data.name).toBe("default");
      expect(body.data.isBuiltin).toBe(true);
    });

    it("returns custom agent by name", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "my-agent",
        mode: "subagent",
      });

      const response = await app.request(
        `/api/agents/my-agent?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<AgentResponse & { isBuiltin: boolean }>;
      expect(body.data.name).toBe("my-agent");
      expect(body.data.isBuiltin).toBe(false);
    });

    it("returns 400 for non-existent agent", async () => {
      const response = await app.request("/api/agents/nonexistent");

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.message).toContain("not found");
    });
  });

  describe("PUT /api/agents/:name", () => {
    it("updates custom agent", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "update-agent",
        mode: "subagent",
      });

      const response = await app.request("/api/agents/update-agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          description: "Updated description",
          tools: ["bash", "read"],
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<AgentResponse>;
      expect(body.data.description).toBe("Updated description");
    });

    it("rejects updating built-in agents", async () => {
      const response = await app.request("/api/agents/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          description: "Trying to update built-in",
        }),
      });

      expect(response.status).toBe(403);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("rejects renaming to reserved name", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "rename-agent",
        mode: "subagent",
      });

      const response = await app.request("/api/agents/rename-agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "default",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.message).toContain("reserved");
    });
  });

  describe("DELETE /api/agents/:name", () => {
    it("deletes custom agent", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      AgentService.create(db, {
        name: "delete-agent",
        mode: "subagent",
      });

      const response = await app.request(
        `/api/agents/delete-agent?projectId=${testProjectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify agent is deleted
      const agent = AgentService.getByName(db, "delete-agent");
      expect(agent).toBeNull();
    });

    it("rejects deleting built-in agents", async () => {
      const response = await app.request(
        `/api/agents/default?projectId=${testProjectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(403);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/agents/test-agent", {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });
  });
});
