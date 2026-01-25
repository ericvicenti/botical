/**
 * Workflows API Route Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { WorkflowService } from "@/services/workflows.ts";
import { ProjectService } from "@/services/projects.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

interface WorkflowResponse {
  id: string;
  name: string;
  label: string;
  description: string;
  category: string;
  icon?: string;
  inputSchema: { fields: unknown[] };
  steps: unknown[];
}

describe("Workflows API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/workflows-route-test"
  );
  let testProjectId: string;
  let testProjectPath: string;

  beforeEach(async () => {
    // Reset and configure for test directory
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    // Clean up any existing test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

    // Create test project in root database with path for YAML workflow support
    const rootDb = DatabaseManager.getRootDb();
    // Create a test user first
    rootDb.query(`
      INSERT OR IGNORE INTO users (id, email, username, created_at, updated_at)
      VALUES ('usr_test', 'test@example.com', 'testuser', ?, ?)
    `).run(Date.now(), Date.now());
    // Create the project with a path - capture the returned project to get the actual ID
    testProjectPath = path.join(testDataDir, "test-project");
    const project = ProjectService.create(rootDb, {
      name: "Test Workflow Project",
      ownerId: "usr_test",
      type: "local",
      path: testProjectPath,
    });
    testProjectId = project.id;
    // Create the .iris directory for YAML workflows
    const irisDir = path.join(testProjectPath, ".iris", "workflows");
    fs.mkdirSync(irisDir, { recursive: true });
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const app = createApp();

  describe("GET /api/workflows", () => {
    it("returns empty list when no workflows exist", async () => {
      const response = await app.request(
        `/api/workflows?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<WorkflowResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns workflows list with pagination", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create test workflows
      WorkflowService.create(db, testProjectId, { name: "workflow-a", label: "Workflow A" });
      WorkflowService.create(db, testProjectId, { name: "workflow-b", label: "Workflow B" });
      WorkflowService.create(db, testProjectId, { name: "workflow-c", label: "Workflow C" });

      const response = await app.request(
        `/api/workflows?projectId=${testProjectId}&limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<WorkflowResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters workflows by category", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      WorkflowService.create(db, testProjectId, { name: "git-flow", label: "Git Flow", category: "git" });
      WorkflowService.create(db, testProjectId, { name: "shell-flow", label: "Shell Flow", category: "shell" });

      const response = await app.request(
        `/api/workflows?projectId=${testProjectId}&category=git`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<WorkflowResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.name).toBe("git-flow");
    });

    it("requires projectId parameter", async () => {
      const response = await app.request("/api/workflows");

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/workflows", () => {
    it("creates a new workflow", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "new-workflow",
          label: "New Workflow",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<WorkflowResponse>;
      expect(body.data.id).toMatch(/^wf_/);
      expect(body.data.name).toBe("new-workflow");
      expect(body.data.label).toBe("New Workflow");
      expect(body.data.description).toBe("");
      expect(body.data.category).toBe("other");
    });

    it("creates workflow with all fields", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "deploy-staging",
          label: "Deploy to Staging",
          description: "Deploys the application to staging",
          category: "shell",
          icon: "rocket",
          inputSchema: {
            fields: [{ name: "branch", type: "string", label: "Branch" }],
          },
          steps: [{ id: "step1", type: "notify", message: { type: "literal", value: "Deploying..." } }],
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<WorkflowResponse>;
      expect(body.data.name).toBe("deploy-staging");
      expect(body.data.description).toBe("Deploys the application to staging");
      expect(body.data.category).toBe("shell");
      expect(body.data.icon).toBe("rocket");
      expect(body.data.inputSchema.fields).toHaveLength(1);
      expect(body.data.steps).toHaveLength(1);
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "my-workflow",
          label: "My Workflow",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("validates workflow name format", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Invalid Name",
          label: "Invalid",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicate workflow names", async () => {
      // Create first workflow
      await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "my-workflow",
          label: "First",
        }),
      });

      // Try to create duplicate
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "my-workflow",
          label: "Second",
        }),
      });

      expect(response.status).toBe(409);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/workflows/:id", () => {
    it("returns workflow by ID", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const workflow = WorkflowService.create(db, testProjectId, {
        name: "test-workflow",
        label: "Test Workflow",
      });

      const response = await app.request(
        `/api/workflows/${workflow.id}?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<WorkflowResponse>;
      expect(body.data.id).toBe(workflow.id);
      expect(body.data.name).toBe("test-workflow");
    });

    it("returns 404 for non-existent workflow", async () => {
      const response = await app.request(
        `/api/workflows/wf_nonexistent?projectId=${testProjectId}`
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 for non-existent workflow without projectId", async () => {
      // When projectId is not provided, API searches all projects
      // For a non-existent workflow, it should return 404
      const response = await app.request("/api/workflows/wf_nonexistent");

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/workflows/:id", () => {
    it("updates workflow", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const workflow = WorkflowService.create(db, testProjectId, {
        name: "old-name",
        label: "Old Label",
      });

      const response = await app.request(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "new-name",
          label: "New Label",
          description: "Updated description",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<WorkflowResponse>;
      expect(body.data.name).toBe("new-name");
      expect(body.data.label).toBe("New Label");
      expect(body.data.description).toBe("Updated description");
    });

    it("returns 404 for non-existent workflow", async () => {
      const response = await app.request("/api/workflows/wf_nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          label: "Updated",
        }),
      });

      expect(response.status).toBe(404);
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/workflows/wf_123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Updated",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/workflows/:id", () => {
    it("deletes workflow", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const workflow = WorkflowService.create(db, testProjectId, {
        name: "to-delete",
        label: "To Delete",
      });

      const response = await app.request(
        `/api/workflows/${workflow.id}?projectId=${testProjectId}`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(200);

      // Verify it's deleted
      const getResponse = await app.request(
        `/api/workflows/${workflow.id}?projectId=${testProjectId}`
      );
      expect(getResponse.status).toBe(404);
    });

    it("returns 404 for non-existent workflow", async () => {
      const response = await app.request(
        `/api/workflows/wf_nonexistent?projectId=${testProjectId}`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(404);
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/workflows/wf_123", {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });
  });
});
