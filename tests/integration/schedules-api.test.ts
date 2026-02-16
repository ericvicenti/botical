/**
 * Schedules API Integration Tests
 *
 * Tests the full schedule CRUD operations through the API.
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
import { ScheduleService } from "@/services/schedules";
import { createAuthSession, createAuthHeaders } from "./helpers/auth";
import path from "path";
import fs from "fs";

interface ScheduleData {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  actionType: string;
  actionConfig: Record<string, unknown>;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
}

interface ScheduleRunData {
  id: string;
  scheduleId: string;
  projectId: string;
  status: string;
  sessionId: string | null;
  scheduledFor: number;
  startedAt: number | null;
  completedAt: number | null;
}

interface ApiResponse<T> {
  data: T;
  meta?: { total: number; limit: number; offset: number; hasMore: boolean };
}

const app = createApp();

describe("Schedules API Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../.test-data/schedules-api-test"
  );
  const testUserId = "usr_test-schedule-user";
  let projectId: string;
  let sessionToken: string;

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
      .run(testUserId, "schedule-test@example.com", "scheduleuser", now, now);

    // Create test project
    const project = ProjectService.create(rootDb, {
      name: "Schedule Test Project",
      ownerId: testUserId,
    });
    projectId = project.id;

    // Create authenticated session
    sessionToken = await createAuthSession(app, "schedule-test@example.com");
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clean up schedules before each test
    const db = DatabaseManager.getProjectDb(projectId);
    const schedules = ScheduleService.list(db, projectId, {});
    for (const schedule of schedules) {
      ScheduleService.delete(db, schedule.id);
    }
  });

  describe("POST /api/projects/:projectId/schedules", () => {
    it("should create a new schedule", async () => {
      const response = await app.request(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
        body: JSON.stringify({
          name: "Test Schedule",
          actionType: "action",
          actionConfig: { actionId: "git.commit" },
          cronExpression: "0 9 * * *",
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.id).toMatch(/^sched_/);
      expect(data.data.name).toBe("Test Schedule");
      expect(data.data.actionType).toBe("action");
      expect(data.data.cronExpression).toBe("0 9 * * *");
      expect(data.data.enabled).toBe(true);
    });

    it("should create a schedule with workflow action", async () => {
      const response = await app.request(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Workflow Schedule",
          actionType: "workflow",
          actionConfig: { workflowId: "wf_test123" },
          cronExpression: "@daily",
          timezone: "America/New_York",
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.actionType).toBe("workflow");
      expect(data.data.actionConfig).toEqual({ workflowId: "wf_test123" });
      expect(data.data.timezone).toBe("America/New_York");
    });

    it("should return 400 for invalid cron expression", async () => {
      const response = await app.request(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Schedule",
          actionType: "action",
          actionConfig: { actionId: "test" },
          cronExpression: "invalid cron",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/projects/:projectId/schedules", () => {
    it("should list schedules for a project", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      ScheduleService.create(db, projectId, testUserId, {
        name: "Schedule 1",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });
      ScheduleService.create(db, projectId, testUserId, {
        name: "Schedule 2",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const response = await app.request(`/api/projects/${projectId}/schedules`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleData[]>;
      expect(data.data).toHaveLength(2);
      expect(data.meta!.total).toBe(2);
    });

    it("should filter by enabled status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      ScheduleService.create(db, projectId, testUserId, {
        name: "Enabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });
      ScheduleService.create(db, projectId, testUserId, {
        name: "Disabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      const enabledResponse = await app.request(
        `/api/projects/${projectId}/schedules?enabled=true`
      );
      const enabledData = (await enabledResponse.json()) as ApiResponse<ScheduleData[]>;
      expect(enabledData.data).toHaveLength(1);
      expect(enabledData.data[0]!.name).toBe("Enabled");

      const disabledResponse = await app.request(
        `/api/projects/${projectId}/schedules?enabled=false`
      );
      const disabledData = (await disabledResponse.json()) as ApiResponse<ScheduleData[]>;
      expect(disabledData.data).toHaveLength(1);
      expect(disabledData.data[0]!.name).toBe("Disabled");
    });
  });

  describe("GET /api/schedules/:id", () => {
    it("should get a schedule by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Get Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const response = await app.request(
        `/api/schedules/${schedule.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.id).toBe(schedule.id);
      expect(data.data.name).toBe("Get Test");
    });

    it("should return 404 for non-existent schedule", async () => {
      const response = await app.request(
        `/api/schedules/sched_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/schedules/:id", () => {
    it("should update a schedule", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Original Name",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const response = await app.request(`/api/schedules/${schedule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "Updated Name",
          cronExpression: "*/30 * * * *",
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.name).toBe("Updated Name");
      expect(data.data.cronExpression).toBe("*/30 * * * *");
    });
  });

  describe("DELETE /api/schedules/:id", () => {
    it("should delete a schedule", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Delete Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const response = await app.request(
        `/api/schedules/${schedule.id}?projectId=${projectId}`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(200);

      // Verify it's deleted
      const getResponse = await app.request(
        `/api/schedules/${schedule.id}?projectId=${projectId}`
      );
      expect(getResponse.status).toBe(404);
    });
  });

  describe("POST /api/schedules/:id/enable", () => {
    it("should enable a schedule", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Enable Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      expect(schedule.enabled).toBe(false);

      const response = await app.request(
        `/api/schedules/${schedule.id}/enable?projectId=${projectId}`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.enabled).toBe(true);
      expect(data.data.nextRunAt).toBeNumber();
    });
  });

  describe("POST /api/schedules/:id/disable", () => {
    it("should disable a schedule", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Disable Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      expect(schedule.enabled).toBe(true);

      const response = await app.request(
        `/api/schedules/${schedule.id}/disable?projectId=${projectId}`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleData>;
      expect(data.data.enabled).toBe(false);
      expect(data.data.nextRunAt).toBeNull();
    });
  });

  describe("POST /api/schedules/:id/run", () => {
    it("should trigger an immediate run", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Trigger Test",
        actionType: "action",
        actionConfig: { actionId: "utility.wait", actionParams: { ms: 1 } },
        cronExpression: "0 * * * *",
      });

      const response = await app.request(
        `/api/schedules/${schedule.id}/run?projectId=${projectId}`,
        { method: "POST" }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<{ triggered: boolean; runId: string }>;
      expect(data.data.triggered).toBe(true);
      expect(data.data.runId).toMatch(/^schedrun_/);
    });
  });

  describe("GET /api/schedules/:id/runs", () => {
    it("should list runs for a schedule", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const schedule = ScheduleService.create(db, projectId, testUserId, {
        name: "Runs Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      // Create some runs
      ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.createRun(db, schedule.id, projectId, Date.now());

      const response = await app.request(
        `/api/schedules/${schedule.id}/runs?projectId=${projectId}`
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<ScheduleRunData[]>;
      expect(data.data).toHaveLength(2);
    });
  });

  describe("POST /api/schedules/validate-cron", () => {
    it("should validate a valid cron expression", async () => {
      const response = await app.request("/api/schedules/validate-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression: "0 9 * * *" }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<{ valid: boolean; nextRun: number }>;
      expect(data.data.valid).toBe(true);
      expect(data.data.nextRun).toBeNumber();
    });

    it("should reject an invalid cron expression", async () => {
      const response = await app.request("/api/schedules/validate-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression: "invalid" }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ApiResponse<{ valid: boolean; error: string }>;
      expect(data.data.valid).toBe(false);
      expect(data.data.error).toBeDefined();
    });
  });

  describe("Full CRUD flow", () => {
    it("should handle complete schedule lifecycle", async () => {
      // 1. Create
      const createResponse = await app.request(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Lifecycle Test",
          description: "Testing full lifecycle",
          actionType: "action",
          actionConfig: { actionId: "utility.wait", actionParams: { ms: 1 } },
          cronExpression: "@hourly",
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await createResponse.json()) as ApiResponse<ScheduleData>;
      const scheduleId = created.data.id;

      // 2. Verify in list
      let listResponse = await app.request(`/api/projects/${projectId}/schedules`);
      let list = (await listResponse.json()) as ApiResponse<ScheduleData[]>;
      expect(list.data.some((s) => s.id === scheduleId)).toBe(true);

      // 3. Update
      const updateResponse = await app.request(`/api/schedules/${scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "Updated Lifecycle Test",
          cronExpression: "@daily",
        }),
      });
      expect(updateResponse.status).toBe(200);

      // 4. Get to verify update
      const getResponse = await app.request(
        `/api/schedules/${scheduleId}?projectId=${projectId}`
      );
      const getResult = (await getResponse.json()) as ApiResponse<ScheduleData>;
      expect(getResult.data.name).toBe("Updated Lifecycle Test");
      expect(getResult.data.cronExpression).toBe("@daily");

      // 5. Disable
      const disableResponse = await app.request(
        `/api/schedules/${scheduleId}/disable?projectId=${projectId}`,
        { method: "POST" }
      );
      expect(disableResponse.status).toBe(200);

      // 6. Enable
      const enableResponse = await app.request(
        `/api/schedules/${scheduleId}/enable?projectId=${projectId}`,
        { method: "POST" }
      );
      expect(enableResponse.status).toBe(200);

      // 7. Trigger manual run
      const triggerResponse = await app.request(
        `/api/schedules/${scheduleId}/run?projectId=${projectId}`,
        { method: "POST" }
      );
      expect(triggerResponse.status).toBe(200);

      // 8. Check run history
      const runsResponse = await app.request(
        `/api/schedules/${scheduleId}/runs?projectId=${projectId}`
      );
      const runsResult = (await runsResponse.json()) as ApiResponse<ScheduleRunData[]>;
      expect(runsResult.data.length).toBeGreaterThanOrEqual(1);

      // 9. Delete
      const deleteResponse = await app.request(
        `/api/schedules/${scheduleId}?projectId=${projectId}`,
        { method: "DELETE" }
      );
      expect(deleteResponse.status).toBe(200);

      // 10. Verify removed from list
      listResponse = await app.request(`/api/projects/${projectId}/schedules`);
      list = (await listResponse.json()) as ApiResponse<ScheduleData[]>;
      expect(list.data.some((s) => s.id === scheduleId)).toBe(false);
    });
  });
});
