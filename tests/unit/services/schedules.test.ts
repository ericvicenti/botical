/**
 * Schedule Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ScheduleService } from "@/services/schedules.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Schedule Service", () => {
  let db: Database;
  const projectId = "proj_test123";
  const userId = "usr_test123";

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a schedule with required fields", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "My Schedule",
        actionType: "action",
        actionConfig: { actionId: "git.commit" },
        cronExpression: "0 9 * * *",
      });

      expect(schedule.id).toMatch(/^sched_/);
      expect(schedule.name).toBe("My Schedule");
      expect(schedule.actionType).toBe("action");
      expect(schedule.actionConfig).toEqual({ actionId: "git.commit" });
      expect(schedule.cronExpression).toBe("0 9 * * *");
      expect(schedule.timezone).toBe("UTC");
      expect(schedule.enabled).toBe(true);
      expect(schedule.nextRunAt).toBeNumber();
      expect(schedule.createdBy).toBe(userId);
    });

    it("creates a schedule with all fields", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Full Schedule",
        description: "A complete schedule",
        actionType: "workflow",
        actionConfig: { workflowId: "wf_test123", workflowInput: { env: "prod" } },
        cronExpression: "@daily",
        timezone: "America/New_York",
        enabled: false,
        maxRuntimeMs: 60000,
      });

      expect(schedule.name).toBe("Full Schedule");
      expect(schedule.description).toBe("A complete schedule");
      expect(schedule.actionType).toBe("workflow");
      expect(schedule.actionConfig).toEqual({ workflowId: "wf_test123", workflowInput: { env: "prod" } });
      expect(schedule.cronExpression).toBe("@daily");
      expect(schedule.timezone).toBe("America/New_York");
      expect(schedule.enabled).toBe(false);
      expect(schedule.nextRunAt).toBeNull(); // Disabled, so no next run
      expect(schedule.maxRuntimeMs).toBe(60000);
    });

    it("generates unique IDs", () => {
      const schedule1 = ScheduleService.create(db, projectId, userId, {
        name: "Schedule 1",
        actionType: "action",
        actionConfig: { actionId: "test.action" },
        cronExpression: "0 * * * *",
      });

      const schedule2 = ScheduleService.create(db, projectId, userId, {
        name: "Schedule 2",
        actionType: "action",
        actionConfig: { actionId: "test.action" },
        cronExpression: "0 * * * *",
      });

      expect(schedule1.id).not.toBe(schedule2.id);
      expect(schedule1.id).toMatch(/^sched_/);
      expect(schedule2.id).toMatch(/^sched_/);
    });

    it("throws on invalid cron expression", () => {
      expect(() => {
        ScheduleService.create(db, projectId, userId, {
          name: "Bad Schedule",
          actionType: "action",
          actionConfig: { actionId: "test" },
          cronExpression: "not a cron",
        });
      }).toThrow(/Invalid cron expression/);
    });

    it("expands cron presets", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Daily Schedule",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "@hourly",
      });

      expect(schedule.cronExpression).toBe("@hourly");
      expect(schedule.nextRunAt).toBeNumber();
    });
  });

  describe("getById", () => {
    it("retrieves an existing schedule", () => {
      const created = ScheduleService.create(db, projectId, userId, {
        name: "Test Schedule",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const retrieved = ScheduleService.getById(db, created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("Test Schedule");
    });

    it("returns null for non-existent schedule", () => {
      const result = ScheduleService.getById(db, "sched_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns schedule when it exists", () => {
      const created = ScheduleService.create(db, projectId, userId, {
        name: "Test Schedule",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const retrieved = ScheduleService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws for non-existent schedule", () => {
      expect(() => {
        ScheduleService.getByIdOrThrow(db, "sched_nonexistent");
      }).toThrow();
    });
  });

  describe("list", () => {
    it("lists all schedules for a project", () => {
      ScheduleService.create(db, projectId, userId, {
        name: "Schedule A",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });
      ScheduleService.create(db, projectId, userId, {
        name: "Schedule B",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const schedules = ScheduleService.list(db, projectId);
      expect(schedules).toHaveLength(2);
    });

    it("returns schedules sorted by name", () => {
      ScheduleService.create(db, projectId, userId, {
        name: "Zebra",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });
      ScheduleService.create(db, projectId, userId, {
        name: "Apple",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const schedules = ScheduleService.list(db, projectId);
      expect(schedules[0]?.name).toBe("Apple");
      expect(schedules[1]?.name).toBe("Zebra");
    });

    it("filters by enabled status", () => {
      ScheduleService.create(db, projectId, userId, {
        name: "Enabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });
      ScheduleService.create(db, projectId, userId, {
        name: "Disabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      const enabledOnly = ScheduleService.list(db, projectId, { enabled: true });
      expect(enabledOnly).toHaveLength(1);
      expect(enabledOnly[0]?.name).toBe("Enabled");

      const disabledOnly = ScheduleService.list(db, projectId, { enabled: false });
      expect(disabledOnly).toHaveLength(1);
      expect(disabledOnly[0]?.name).toBe("Disabled");
    });

    it("supports pagination", () => {
      for (let i = 0; i < 5; i++) {
        ScheduleService.create(db, projectId, userId, {
          name: `Schedule ${i}`,
          actionType: "action",
          actionConfig: { actionId: "test" },
          cronExpression: "0 * * * *",
        });
      }

      const page1 = ScheduleService.list(db, projectId, { limit: 2 });
      expect(page1).toHaveLength(2);

      const page2 = ScheduleService.list(db, projectId, { limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);

      const page3 = ScheduleService.list(db, projectId, { limit: 2, offset: 4 });
      expect(page3).toHaveLength(1);
    });
  });

  describe("count", () => {
    it("counts all schedules", () => {
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

      expect(ScheduleService.count(db, projectId)).toBe(2);
    });

    it("counts by enabled status", () => {
      ScheduleService.create(db, projectId, userId, {
        name: "Enabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });
      ScheduleService.create(db, projectId, userId, {
        name: "Disabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      expect(ScheduleService.count(db, projectId, { enabled: true })).toBe(1);
      expect(ScheduleService.count(db, projectId, { enabled: false })).toBe(1);
    });
  });

  describe("update", () => {
    it("updates schedule name", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Original",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      ScheduleService.update(db, schedule.id, { name: "Updated" });

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.name).toBe("Updated");
    });

    it("updates cron expression and recalculates next run", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const originalNextRun = schedule.nextRunAt;

      ScheduleService.update(db, schedule.id, { cronExpression: "*/5 * * * *" });

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.cronExpression).toBe("*/5 * * * *");
      // Next run time should be recalculated
      expect(updated?.nextRunAt).toBeNumber();
    });

    it("clears next run when disabled", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      expect(schedule.nextRunAt).toBeNumber();

      ScheduleService.update(db, schedule.id, { enabled: false });

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.enabled).toBe(false);
      expect(updated?.nextRunAt).toBeNull();
    });

    it("throws for non-existent schedule", () => {
      expect(() => {
        ScheduleService.update(db, "sched_nonexistent", { name: "Test" });
      }).toThrow();
    });

    it("validates cron expression on update", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      expect(() => {
        ScheduleService.update(db, schedule.id, { cronExpression: "invalid cron" });
      }).toThrow(/Invalid cron expression/);
    });
  });

  describe("enable/disable", () => {
    it("enables a disabled schedule", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      expect(schedule.enabled).toBe(false);

      const enabled = ScheduleService.enable(db, schedule.id);
      expect(enabled.enabled).toBe(true);
      expect(enabled.nextRunAt).toBeNumber();
    });

    it("disables an enabled schedule", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      expect(schedule.enabled).toBe(true);

      const disabled = ScheduleService.disable(db, schedule.id);
      expect(disabled.enabled).toBe(false);
      expect(disabled.nextRunAt).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes an existing schedule", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      ScheduleService.delete(db, schedule.id);

      const result = ScheduleService.getById(db, schedule.id);
      expect(result).toBeNull();
    });

    it("throws for non-existent schedule", () => {
      expect(() => {
        ScheduleService.delete(db, "sched_nonexistent");
      }).toThrow();
    });
  });

  describe("getDueSchedules", () => {
    it("returns schedules that are due", () => {
      // Create a schedule with next_run_at in the past
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Past Due",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      // Manually set next_run_at to the past
      db.query("UPDATE schedules SET next_run_at = ? WHERE id = ?").run(
        Date.now() - 60000,
        schedule.id
      );

      const due = ScheduleService.getDueSchedules(db);
      expect(due.length).toBeGreaterThanOrEqual(1);
      expect(due.some(s => s.id === schedule.id)).toBe(true);
    });

    it("does not return disabled schedules", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Disabled",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: false,
      });

      const due = ScheduleService.getDueSchedules(db);
      expect(due.find(s => s.id === schedule.id)).toBeUndefined();
    });
  });

  describe("schedule runs", () => {
    it("creates a schedule run", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const run = ScheduleService.createRun(db, schedule.id, projectId, Date.now());

      expect(run.id).toMatch(/^schedrun_/);
      expect(run.scheduleId).toBe(schedule.id);
      expect(run.status).toBe("pending");
    });

    it("lists runs for a schedule", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.createRun(db, schedule.id, projectId, Date.now());

      const runs = ScheduleService.listRuns(db, schedule.id);
      expect(runs).toHaveLength(2);
    });

    it("starts a run", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const run = ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.startRun(db, run.id, "sess_test123");

      const updated = ScheduleService.getRunById(db, run.id);
      expect(updated?.status).toBe("running");
      expect(updated?.startedAt).toBeNumber();
      expect(updated?.sessionId).toBe("sess_test123");
    });

    it("completes a run with success", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const run = ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.startRun(db, run.id);
      ScheduleService.completeRun(db, run.id, "success", "Output text");

      const updated = ScheduleService.getRunById(db, run.id);
      expect(updated?.status).toBe("success");
      expect(updated?.completedAt).toBeNumber();
      expect(updated?.output).toBe("Output text");
    });

    it("completes a run with failure", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
      });

      const run = ScheduleService.createRun(db, schedule.id, projectId, Date.now());
      ScheduleService.startRun(db, run.id);
      ScheduleService.completeRun(db, run.id, "failed", undefined, "Error message");

      const updated = ScheduleService.getRunById(db, run.id);
      expect(updated?.status).toBe("failed");
      expect(updated?.error).toBe("Error message");
    });
  });

  describe("updateAfterRun", () => {
    it("updates last run info and calculates next run", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      ScheduleService.updateAfterRun(db, schedule.id, "success");

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.lastRunAt).toBeNumber();
      expect(updated?.lastRunStatus).toBe("success");
      expect(updated?.lastRunError).toBeNull();
      expect(updated?.nextRunAt).toBeNumber();
    });

    it("records error on failed run", () => {
      const schedule = ScheduleService.create(db, projectId, userId, {
        name: "Test",
        actionType: "action",
        actionConfig: { actionId: "test" },
        cronExpression: "0 * * * *",
        enabled: true,
      });

      ScheduleService.updateAfterRun(db, schedule.id, "failed", "Something went wrong");

      const updated = ScheduleService.getById(db, schedule.id);
      expect(updated?.lastRunStatus).toBe("failed");
      expect(updated?.lastRunError).toBe("Something went wrong");
    });
  });

  describe("validateCronExpression", () => {
    it("validates valid expressions", () => {
      expect(ScheduleService.validateCronExpression("0 * * * *").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("*/15 * * * *").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("0 9 * * 1-5").valid).toBe(true);
    });

    it("validates presets", () => {
      expect(ScheduleService.validateCronExpression("@hourly").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("@daily").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("@weekly").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("@monthly").valid).toBe(true);
      expect(ScheduleService.validateCronExpression("@yearly").valid).toBe(true);
    });

    it("rejects invalid expressions", () => {
      expect(ScheduleService.validateCronExpression("invalid").valid).toBe(false);
      expect(ScheduleService.validateCronExpression("* * *").valid).toBe(false);
    });
  });

  describe("calculateNextRun", () => {
    it("calculates next run time", () => {
      const next = ScheduleService.calculateNextRun("0 * * * *", "UTC");
      expect(next).toBeNumber();
      expect(next).toBeGreaterThan(Date.now());
    });

    it("respects timezone", () => {
      const utc = ScheduleService.calculateNextRun("0 12 * * *", "UTC");
      const ny = ScheduleService.calculateNextRun("0 12 * * *", "America/New_York");

      // Different timezones should give different results
      expect(utc).not.toBe(ny);
    });

    it("returns null for invalid expression", () => {
      const result = ScheduleService.calculateNextRun("invalid", "UTC");
      expect(result).toBeNull();
    });
  });
});
