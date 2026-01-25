/**
 * Workflows API Integration Tests
 *
 * Tests the full workflow CRUD operations through the API.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createApp } from "@/server/app";
import { DatabaseManager } from "@/database/index";
import { Config } from "@/config/index";
import { ProjectService } from "@/services/projects";
import { WorkflowService } from "@/services/workflows";
import path from "path";
import fs from "fs";

interface WorkflowData {
  id: string;
  name: string;
  label: string;
  description: string;
  steps: Array<{ id: string; type: string; message?: unknown }>;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; limit: number; offset: number; hasMore: boolean };
}

const app = createApp();

describe("Workflows API Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../.test-data/workflows-api-test"
  );
  const testUserId = "usr_test-workflow-user";
  let projectId: string;

  beforeAll(async () => {
    Config.load({ dataDir: testDataDir });
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();
    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "workflow-test@example.com", "workflowuser", now, now);

    // Create test project
    const project = ProjectService.create(rootDb, {
      name: "Workflow Test Project",
      ownerId: testUserId,
    });
    projectId = project.id;
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clean up workflows before each test
    const db = DatabaseManager.getProjectDb(projectId);
    const workflows = WorkflowService.list(db, projectId, {});
    for (const workflow of workflows) {
      WorkflowService.delete(db, workflow.id);
    }
  });

  describe("POST /api/workflows", () => {
    it("should create a new workflow", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "test-workflow",
          label: "Test Workflow",
          description: "A test workflow",
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ApiResponse<WorkflowData>;
      expect(data.data.id).toMatch(/^wf_/);
      expect(data.data.name).toBe("test-workflow");
      expect(data.data.label).toBe("Test Workflow");
      expect(data.data.description).toBe("A test workflow");
    });

    it("should return 400 if projectId is missing", async () => {
      const response = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-workflow",
          label: "Test Workflow",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/workflows", () => {
    it("should list workflows for a project", async () => {
      // Create two workflows
      const db = DatabaseManager.getProjectDb(projectId);
      WorkflowService.create(db, projectId, {
        name: "workflow-1",
        label: "Workflow 1",
        description: "First workflow",
      });
      WorkflowService.create(db, projectId, {
        name: "workflow-2",
        label: "Workflow 2",
        description: "Second workflow",
      });

      const response = await app.request(
        `/api/workflows?projectId=${projectId}`
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<WorkflowData[]>;
      expect(data.data).toHaveLength(2);
      expect(data.meta!.total).toBe(2);
    });

    it("should return empty array when no workflows exist", async () => {
      const response = await app.request(
        `/api/workflows?projectId=${projectId}`
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<WorkflowData[]>;
      expect(data.data).toHaveLength(0);
      expect(data.meta!.total).toBe(0);
    });

    it("should show newly created workflow in list", async () => {
      // Create workflow via API
      const createResponse = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "new-workflow",
          label: "New Workflow",
        }),
      });

      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as ApiResponse<WorkflowData>;

      // List workflows - should include the new one
      const listResponse = await app.request(
        `/api/workflows?projectId=${projectId}`
      );

      expect(listResponse.status).toBe(200);
      const list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      expect(list.data).toHaveLength(1);
      expect(list.data[0]!.id).toBe(created.data.id);
      expect(list.data[0]!.label).toBe("New Workflow");
    });
  });

  describe("GET /api/workflows/:id", () => {
    it("should get a workflow by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const workflow = WorkflowService.create(db, projectId, {
        name: "get-test",
        label: "Get Test Workflow",
        description: "Test getting a workflow",
      });

      const response = await app.request(
        `/api/workflows/${workflow.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<WorkflowData>;
      expect(data.data.id).toBe(workflow.id);
      expect(data.data.label).toBe("Get Test Workflow");
    });

    it("should return 404 for non-existent workflow", async () => {
      const response = await app.request(
        `/api/workflows/wf_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/workflows/:id", () => {
    it("should update a workflow", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const workflow = WorkflowService.create(db, projectId, {
        name: "update-test",
        label: "Original Label",
        description: "Original description",
      });

      const response = await app.request(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          label: "Updated Label",
          description: "Updated description",
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<WorkflowData>;
      expect(data.data.label).toBe("Updated Label");
      expect(data.data.description).toBe("Updated description");

      // Verify the update persisted
      const getResponse = await app.request(
        `/api/workflows/${workflow.id}?projectId=${projectId}`
      );
      const getData = (await getResponse.json()) as ApiResponse<WorkflowData>;
      expect(getData.data.label).toBe("Updated Label");
    });

    it("should show updated workflow in list", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const workflow = WorkflowService.create(db, projectId, {
        name: "list-update-test",
        label: "Original Label",
      });

      // Update the workflow
      await app.request(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          label: "New Label After Update",
        }),
      });

      // List should show updated label
      const listResponse = await app.request(
        `/api/workflows?projectId=${projectId}`
      );
      const list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      const updatedInList = list.data.find((w) => w.id === workflow.id);
      expect(updatedInList!.label).toBe("New Label After Update");
    });
  });

  describe("DELETE /api/workflows/:id", () => {
    it("should delete a workflow", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const workflow = WorkflowService.create(db, projectId, {
        name: "delete-test",
        label: "Delete Test",
      });

      const response = await app.request(
        `/api/workflows/${workflow.id}?projectId=${projectId}`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(200);

      // Verify it's deleted
      const getResponse = await app.request(
        `/api/workflows/${workflow.id}?projectId=${projectId}`
      );
      expect(getResponse.status).toBe(404);
    });

    it("should remove workflow from list after deletion", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const workflow1 = WorkflowService.create(db, projectId, {
        name: "keep-this",
        label: "Keep This",
      });
      const workflow2 = WorkflowService.create(db, projectId, {
        name: "delete-this",
        label: "Delete This",
      });

      // Delete workflow2
      await app.request(`/api/workflows/${workflow2.id}?projectId=${projectId}`, {
        method: "DELETE",
      });

      // List should only show workflow1
      const listResponse = await app.request(
        `/api/workflows?projectId=${projectId}`
      );
      const list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      expect(list.data).toHaveLength(1);
      expect(list.data[0]!.id).toBe(workflow1.id);
    });
  });

  describe("Full CRUD flow", () => {
    it("should handle complete workflow lifecycle", async () => {
      // 1. Create
      const createResponse = await app.request("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "lifecycle-test",
          label: "Lifecycle Test",
          description: "Testing full lifecycle",
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as ApiResponse<WorkflowData>;
      const workflowId = created.data.id;

      // 2. Verify it appears in list
      let listResponse = await app.request(`/api/workflows?projectId=${projectId}`);
      let list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      expect(list.data.some((w) => w.id === workflowId)).toBe(true);

      // 3. Update
      const updateResponse = await app.request(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          label: "Updated Lifecycle Test",
          steps: [
            { id: "step-1", type: "log", message: { type: "literal", value: "Hello" } },
          ],
        }),
      });
      expect(updateResponse.status).toBe(200);

      // 4. Verify update in list
      listResponse = await app.request(`/api/workflows?projectId=${projectId}`);
      list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      const updatedInList = list.data.find((w) => w.id === workflowId);
      expect(updatedInList!.label).toBe("Updated Lifecycle Test");

      // 5. Get to verify steps
      const getResponse = await app.request(`/api/workflows/${workflowId}?projectId=${projectId}`);
      const getResult = (await getResponse.json()) as ApiResponse<WorkflowData>;
      expect(getResult.data.steps).toHaveLength(1);
      expect(getResult.data.steps[0]!.type).toBe("log");

      // 6. Delete
      const deleteResponse = await app.request(`/api/workflows/${workflowId}?projectId=${projectId}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);

      // 7. Verify removed from list
      listResponse = await app.request(`/api/workflows?projectId=${projectId}`);
      list = (await listResponse.json()) as ApiResponse<WorkflowData[]>;
      expect(list.data.some((w) => w.id === workflowId)).toBe(false);
    });
  });
});
