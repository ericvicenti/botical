/**
 * Agents API Route Tests
 *
 * Custom agents now use YAML files via AgentYamlService/UnifiedAgentService.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { AgentYamlService } from "@/config/agents.ts";
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

function makeCustomAgent(name: string, opts: Record<string, any> = {}) {
  return {
    id: `agent_yaml_${name}`,
    name,
    description: opts.description ?? null,
    mode: opts.mode ?? "subagent",
    hidden: opts.hidden ?? false,
    providerId: opts.providerId ?? null,
    modelId: opts.modelId ?? null,
    temperature: opts.temperature ?? null,
    topP: opts.topP ?? null,
    maxSteps: opts.maxSteps ?? null,
    prompt: opts.prompt ?? null,
    tools: opts.tools ?? [],
    options: opts.options ?? {},
    color: opts.color ?? null,
    isBuiltin: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
    // Enable single-user mode for these tests so auth is auto-handled
    process.env.BOTICAL_SINGLE_USER = "true";
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    delete process.env.BOTICAL_SINGLE_USER;
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

    const rootDb = DatabaseManager.getRootDb();
    rootDb.query(`
      INSERT OR IGNORE INTO users (id, email, username, created_at, updated_at)
      VALUES ('usr_test', 'test@example.com', 'testuser', ?, ?)
    `).run(Date.now(), Date.now());
    testProjectPath = path.join(testDataDir, "test-project");
    const project = ProjectService.create(rootDb, {
      name: "Test Agent Project",
      ownerId: "usr_test",
      type: "local",
      path: testProjectPath,
    });
    testProjectId = project.id;
    const boticalDir = path.join(testProjectPath, ".botical", "agents");
    fs.mkdirSync(boticalDir, { recursive: true });
  });

  const app = createApp();

  describe("GET /api/agents", () => {
    it("returns built-in agents without projectId", async () => {
      const response = await app.request("/api/agents");

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta.builtinCount).toBeGreaterThan(0);

      const defaultAgent = body.data.find((a) => a.name === "default");
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent!.isBuiltin).toBe(true);
    });

    it("returns both built-in and custom agents with projectId", async () => {
      AgentYamlService.save(testProjectPath, makeCustomAgent("custom-agent", {
        description: "A custom agent",
        mode: "subagent",
      }));

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
      for (const agent of body.data) {
        expect(agent.mode === "primary" || agent.mode === "all").toBe(true);
      }
    });

    it("filters to built-in only", async () => {
      AgentYamlService.save(testProjectPath, makeCustomAgent("custom-agent"));

      const response = await app.request(
        `/api/agents?projectId=${testProjectId}&builtinOnly=true`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as AgentListResponse;
      expect(body.meta.customCount).toBe(0);
    });

    it("filters to custom only", async () => {
      AgentYamlService.save(testProjectPath, makeCustomAgent("custom-agent"));

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
      AgentYamlService.save(testProjectPath, makeCustomAgent("my-agent"));

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
      AgentYamlService.save(testProjectPath, makeCustomAgent("update-agent"));

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
      AgentYamlService.save(testProjectPath, makeCustomAgent("rename-agent"));

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
      AgentYamlService.save(testProjectPath, makeCustomAgent("delete-agent"));

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
      const agent = AgentYamlService.getByName(testProjectPath, "delete-agent");
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
