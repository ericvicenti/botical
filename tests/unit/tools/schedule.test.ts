/**
 * Schedule Tool Tests
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { scheduleTool } from "@/tools/schedule.ts";
import { ScheduleService } from "@/services/schedules.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import path from "path";
import fs from "fs";

describe("Schedule Tool", () => {
  const testDataDir = path.join(import.meta.dirname, "../../../.test-data/schedule-tool-test");
  const projectId = "proj_test123";
  const userId = "usr_test123";

  let db: Database;

  const createContext = () => ({
    projectId,
    projectPath: testDataDir,
    userId,
    sessionId: "sess_test123",
    messageId: "msg_test123",
    updateMetadata: () => {},
    abortSignal: new AbortController().signal,
  });

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
      .run(userId, "tool-test@example.com", "tooluser", now, now);

    // Create test project
    rootDb
      .prepare(
        "INSERT INTO projects (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(projectId, "Tool Test Project", userId, now, now);
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    db = DatabaseManager.getProjectDb(projectId);
    // Clean up any existing schedules
    const schedules = ScheduleService.list(db, projectId, {});
    for (const schedule of schedules) {
      ScheduleService.delete(db, schedule.id);
    }
  });

  describe("create operation", () => {
    it("creates a schedule with action", async () => {
      const result = await scheduleTool.execute(
        {
          operation: "create",
          name: "Test Schedule",
          actionType: "action",
          actionConfig: { actionId: "git.commit" },
          cronExpression: "0 9 * * *",
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.title).toContain("Schedule Created");
      expect(result.metadata?.scheduleId).toMatch(/^sched_/);
    });

    it("creates a schedule with workflow", async () => {
      const result = await scheduleTool.execute(
        {
          operation: "create",
          name: "Workflow Schedule",
          actionType: "workflow",
          actionConfig: { workflowId: "wf_test123" },
          cronExpression: "@daily",
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("workflow");
    });

    it("returns error for missing required fields", async () => {
      const result = await scheduleTool.execute(
        {
          operation: "create",
          name: "Incomplete",
        },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Missing required parameters");
    });
  });

  describe("list operation", () => {
    it("lists all schedules", async () => {
      // Create some schedules
      ScheduleService.create(db, projectId, userId, {
        name: "Schedule 1",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });
      ScheduleService.create(db, projectId, userId, {
        name: "Schedule 2",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const result = await scheduleTool.execute(
        { operation: "list" },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
      expect(result.output).toContain("Schedule 1");
      expect(result.output).toContain("Schedule 2");
    });

    it("shows empty message when no schedules", async () => {
      const result = await scheduleTool.execute(
        { operation: "list" },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("No schedules found");
    });
  });

  describe("get operation", () => {
    it("gets schedule details", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Get Test",
        description: "Test description",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 9 * * *",
      });

      const result = await scheduleTool.execute(
        { operation: "get", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Get Test");
      expect(result.output).toContain("Test description");
      expect(result.output).toContain("0 9 * * *");
    });

    it("returns error for missing scheduleId", async () => {
      const result = await scheduleTool.execute(
        { operation: "get" },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("scheduleId is required");
    });
  });

  describe("update operation", () => {
    it("updates schedule name", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Original",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const result = await scheduleTool.execute(
        {
          operation: "update",
          scheduleId: schedule.id,
          name: "Updated Name",
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Updated Name");
    });
  });

  describe("delete operation", () => {
    it("deletes a schedule", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Delete Me",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const result = await scheduleTool.execute(
        { operation: "delete", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Deleted");

      // Verify it's deleted
      const check = ScheduleService.getById(db, schedule.id);
      expect(check).toBeNull();
    });
  });

  describe("enable/disable operations", () => {
    it("enables a disabled schedule", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Disabled Schedule",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      const result = await scheduleTool.execute(
        { operation: "enable", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Enabled");

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.enabled).toBe(true);
    });

    it("disables an enabled schedule", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Enabled Schedule",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      const result = await scheduleTool.execute(
        { operation: "disable", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Disabled");

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.enabled).toBe(false);
    });
  });

  describe("history operation", () => {
    it("shows run history", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "History Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      // Create some runs
      const run1 = ScheduleService.createRun(db, schedule.id, projectId, Date.now() - 60000);
      ScheduleService.startRun(db, run1.id);
      ScheduleService.completeRun(db, run1.id, "success", "Output 1");

      const run2 = ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.startRun(db, run2.id);
      ScheduleService.completeRun(db, run2.id, "failed", undefined, "Error!");

      const result = await scheduleTool.execute(
        { operation: "history", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.runCount).toBe(2);
      expect(result.output).toContain("success");
      expect(result.output).toContain("failed");
    });

    it("shows empty message when no history", async () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "No History",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const result = await scheduleTool.execute(
        { operation: "history", scheduleId: schedule.id },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("No run history");
    });
  });
});
