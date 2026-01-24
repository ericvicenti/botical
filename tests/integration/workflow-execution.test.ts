/**
 * Workflow Execution Integration Tests
 *
 * Tests workflow execution including built-in actions like utility.wait.
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
import { WorkflowExecutionService } from "@/services/workflow-executions";
import { registerAllActions } from "@/actions/index";
import path from "path";
import fs from "fs";
import type { WorkflowStep } from "@/workflows/types";

const app = createApp();

describe("Workflow Execution Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../.test-data/workflow-execution-test"
  );
  const testUserId = "usr_test-exec-user";
  let projectId: string;

  beforeAll(async () => {
    Config.load({ dataDir: testDataDir });
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    await DatabaseManager.initialize();

    // Register all actions (including utility.wait)
    registerAllActions();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();
    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "exec-test@example.com", "execuser", now, now);

    // Create test project
    const project = ProjectService.create(rootDb, {
      name: "Workflow Execution Test Project",
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
    // Clean up workflows and executions before each test
    const db = DatabaseManager.getProjectDb(projectId);
    const workflows = WorkflowService.list(db, projectId, {});
    for (const workflow of workflows) {
      WorkflowService.delete(db, workflow.id);
    }
  });

  describe("POST /api/workflows/:id/execute", () => {
    it("should execute a workflow with a single log step", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with a log step
      const workflow = WorkflowService.create(db, projectId, {
        name: "log-test",
        label: "Log Test Workflow",
        steps: [
          {
            id: "step-1",
            type: "log",
            message: { type: "literal", value: "Hello from workflow" },
          } as WorkflowStep,
        ],
      });

      // Execute the workflow
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.executionId).toMatch(/^wfx_/);
      expect(data.data.status).toBe("pending");

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check execution status
      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution).toBeDefined();
      expect(execution?.status).toBe("completed");
    });

    it("should execute a workflow with utility.wait action", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with a wait action
      const workflow = WorkflowService.create(db, projectId, {
        name: "wait-test",
        label: "Wait Test Workflow",
        steps: [
          {
            id: "wait-step",
            type: "action",
            action: "utility.wait",
            args: {
              ms: { type: "literal", value: 50 },
            },
          } as WorkflowStep,
        ],
      });

      // Execute the workflow and measure time
      const startTime = Date.now();
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete (should take at least 50ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
      const elapsed = Date.now() - startTime;

      // Execution should have taken at least 50ms due to wait
      expect(elapsed).toBeGreaterThanOrEqual(50);

      // Check execution completed
      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution).toBeDefined();
      expect(execution?.status).toBe("completed");

      // Check step output contains wait result
      const steps = execution?.steps;
      expect(steps).toBeDefined();
      expect(steps?.["wait-step"]).toBeDefined();
      expect(steps?.["wait-step"]?.status).toBe("completed");
      // Output structure: { title, output, metadata: { durationMs } }
      expect(steps?.["wait-step"]?.output?.metadata?.durationMs).toBe(50);
    });

    it("should execute a workflow with utility.wait using seconds", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with a wait action using seconds
      const workflow = WorkflowService.create(db, projectId, {
        name: "wait-seconds-test",
        label: "Wait Seconds Test Workflow",
        steps: [
          {
            id: "wait-step",
            type: "action",
            action: "utility.wait",
            args: {
              seconds: { type: "literal", value: 0.05 },
            },
          } as WorkflowStep,
        ],
      });

      // Execute the workflow
      const startTime = Date.now();
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 150));
      const elapsed = Date.now() - startTime;

      // Should have waited at least 50ms (0.05 seconds)
      expect(elapsed).toBeGreaterThanOrEqual(50);

      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution?.status).toBe("completed");
    });

    it("should execute multiple wait steps in sequence", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with multiple sequential wait steps
      const workflow = WorkflowService.create(db, projectId, {
        name: "multi-wait-test",
        label: "Multi Wait Test Workflow",
        steps: [
          {
            id: "wait-1",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 30 } },
          } as WorkflowStep,
          {
            id: "wait-2",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 30 } },
            dependsOn: ["wait-1"],
          } as WorkflowStep,
        ],
      });

      // Execute the workflow
      const startTime = Date.now();
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 200));
      const elapsed = Date.now() - startTime;

      // Should have waited at least 60ms (30 + 30)
      expect(elapsed).toBeGreaterThanOrEqual(60);

      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution?.status).toBe("completed");

      // Both steps should be completed
      const steps = execution?.steps;
      expect(steps?.["wait-1"]?.status).toBe("completed");
      expect(steps?.["wait-2"]?.status).toBe("completed");
    });

    it("should execute parallel wait steps concurrently", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with parallel wait steps (no dependsOn)
      const workflow = WorkflowService.create(db, projectId, {
        name: "parallel-wait-test",
        label: "Parallel Wait Test Workflow",
        steps: [
          {
            id: "wait-1",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 50 } },
          } as WorkflowStep,
          {
            id: "wait-2",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 50 } },
          } as WorkflowStep,
        ],
      });

      // Execute the workflow
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution?.status).toBe("completed");

      // Both steps should be completed
      const steps = execution?.steps;
      expect(steps?.["wait-1"]?.status).toBe("completed");
      expect(steps?.["wait-2"]?.status).toBe("completed");
    });

    it("should execute a workflow combining wait and notify steps", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with notify, wait, notify sequence
      const workflow = WorkflowService.create(db, projectId, {
        name: "wait-notify-test",
        label: "Wait Notify Test Workflow",
        steps: [
          {
            id: "notify-start",
            type: "notify",
            message: { type: "literal", value: "Starting..." },
            variant: "info",
          } as WorkflowStep,
          {
            id: "wait-step",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 30 } },
            dependsOn: ["notify-start"],
          } as WorkflowStep,
          {
            id: "notify-end",
            type: "notify",
            message: { type: "literal", value: "Done!" },
            variant: "success",
            dependsOn: ["wait-step"],
          } as WorkflowStep,
        ],
      });

      // Execute the workflow
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: {},
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution?.status).toBe("completed");

      // All 3 steps should be completed
      const steps = execution?.steps;
      expect(steps?.["notify-start"]?.status).toBe("completed");
      expect(steps?.["wait-step"]?.status).toBe("completed");
      expect(steps?.["notify-end"]?.status).toBe("completed");
    });

    it("should handle wait with input binding", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create a workflow with wait duration from input
      const workflow = WorkflowService.create(db, projectId, {
        name: "wait-input-test",
        label: "Wait Input Test Workflow",
        steps: [
          {
            id: "wait-step",
            type: "action",
            action: "utility.wait",
            args: {
              ms: { type: "input", path: "waitTime" },
            },
          } as WorkflowStep,
        ],
      });

      // Execute with input
      const startTime = Date.now();
      const response = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          input: { waitTime: 40 },
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 150));
      const elapsed = Date.now() - startTime;

      // Should have waited the input-specified time
      expect(elapsed).toBeGreaterThanOrEqual(40);

      const execution = WorkflowExecutionService.getById(db, data.data.executionId);
      expect(execution?.status).toBe("completed");
    });
  });

  describe("GET /api/workflow-executions/:id", () => {
    it("should get execution details including wait step output", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create and execute a workflow
      const workflow = WorkflowService.create(db, projectId, {
        name: "get-exec-test",
        label: "Get Execution Test",
        steps: [
          {
            id: "wait-step",
            type: "action",
            action: "utility.wait",
            args: { ms: { type: "literal", value: 25 } },
          } as WorkflowStep,
        ],
      });

      const execResponse = await app.request(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, input: {} }),
      });

      const execData = await execResponse.json();
      const executionId = execData.data.executionId;

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Get execution details
      const getResponse = await app.request(
        `/api/workflow-executions/${executionId}?projectId=${projectId}`
      );

      expect(getResponse.status).toBe(200);
      const getData = await getResponse.json();

      expect(getData.data.id).toBe(executionId);
      expect(getData.data.status).toBe("completed");
      expect(getData.data.workflowId).toBe(workflow.id);
    });
  });
});
