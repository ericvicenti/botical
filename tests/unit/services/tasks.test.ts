/**
 * Task Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { TaskService } from "@/services/tasks.ts";
import { SessionService } from "@/services/sessions.ts";
import { MissionService } from "@/services/missions.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

describe("Task Service", () => {
  let db: Database;
  let sessionId: string;
  const projectId = "prj_test-project";

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Create a session for tasks
    const session = SessionService.create(db, {
      title: "Test Session",
    });
    sessionId = session.id;
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a task with pending status", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Fix the bug",
        activeForm: "Fixing the bug",
      });

      expect(task.id).toMatch(/^task_/);
      expect(task.sessionId).toBe(sessionId);
      expect(task.title).toBe("Fix the bug");
      expect(task.activeForm).toBe("Fixing the bug");
      expect(task.status).toBe("pending");
      expect(task.position).toBe(0);
      expect(task.createdBy).toBe("agent");
      expect(task.assignedTo).toBe("agent");
      expect(task.missionId).toBeNull();
      expect(task.parentTaskId).toBeNull();
      expect(task.description).toBeNull();
      expect(task.result).toBeNull();
      expect(task.startedAt).toBeNull();
      expect(task.completedAt).toBeNull();
    });

    it("creates a task with in_progress status", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Active task",
        activeForm: "Working on active task",
        status: "in_progress",
      });

      expect(task.status).toBe("in_progress");
      expect(task.startedAt).not.toBeNull();
    });

    it("auto-increments position", () => {
      const task1 = TaskService.create(db, sessionId, {
        title: "First",
        activeForm: "First",
      });
      const task2 = TaskService.create(db, sessionId, {
        title: "Second",
        activeForm: "Second",
      });
      const task3 = TaskService.create(db, sessionId, {
        title: "Third",
        activeForm: "Third",
      });

      expect(task1.position).toBe(0);
      expect(task2.position).toBe(1);
      expect(task3.position).toBe(2);
    });

    it("demotes existing in_progress task when creating new one with in_progress", () => {
      const first = TaskService.create(db, sessionId, {
        title: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TaskService.create(db, sessionId, {
        title: "Second",
        activeForm: "Second",
        status: "in_progress",
      });

      const updatedFirst = TaskService.getById(db, first.id);
      expect(updatedFirst?.status).toBe("pending");
      expect(second.status).toBe("in_progress");
    });

    it("creates a task with missionId", () => {
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, "usr_test");
      MissionService.start(db, mission.id, sessionId);

      const task = TaskService.create(db, sessionId, {
        title: "Mission task",
        activeForm: "Working on mission task",
        missionId: mission.id,
      });

      expect(task.missionId).toBe(mission.id);
    });

    it("creates a task with createdBy and assignedTo", () => {
      const task = TaskService.create(db, sessionId, {
        title: "User created task",
        activeForm: "Working on user task",
        createdBy: "user",
        assignedTo: "user",
      });

      expect(task.createdBy).toBe("user");
      expect(task.assignedTo).toBe("user");
    });

    it("creates a task with description", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Detailed task",
        activeForm: "Working on detailed task",
        description: "This is a detailed description of the task",
      });

      expect(task.description).toBe("This is a detailed description of the task");
    });
  });

  describe("getById", () => {
    it("retrieves a task by ID", () => {
      const created = TaskService.create(db, sessionId, {
        title: "Test task",
        activeForm: "Testing",
      });

      const retrieved = TaskService.getById(db, created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe("Test task");
    });

    it("returns null for non-existent ID", () => {
      const result = TaskService.getById(db, "task_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("retrieves a task or throws", () => {
      const created = TaskService.create(db, sessionId, {
        title: "Test task",
        activeForm: "Testing",
      });

      const retrieved = TaskService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws NotFoundError for non-existent ID", () => {
      expect(() => {
        TaskService.getByIdOrThrow(db, "task_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("listBySession", () => {
    beforeEach(() => {
      TaskService.create(db, sessionId, {
        title: "Pending 1",
        activeForm: "Pending 1",
        status: "pending",
      });
      TaskService.create(db, sessionId, {
        title: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });
      TaskService.create(db, sessionId, {
        title: "Pending 2",
        activeForm: "Pending 2",
        status: "pending",
      });
    });

    it("lists all tasks for a session", () => {
      const tasks = TaskService.listBySession(db, sessionId);
      expect(tasks.length).toBe(3);
    });

    it("lists tasks in position order", () => {
      const tasks = TaskService.listBySession(db, sessionId);
      expect(tasks[0]!.position).toBe(0);
      expect(tasks[1]!.position).toBe(1);
      expect(tasks[2]!.position).toBe(2);
    });

    it("filters by status", () => {
      const pending = TaskService.listBySession(db, sessionId, { status: "pending" });
      expect(pending.length).toBe(2);

      const inProgress = TaskService.listBySession(db, sessionId, { status: "in_progress" });
      expect(inProgress.length).toBe(1);
    });

    it("supports pagination", () => {
      const page1 = TaskService.listBySession(db, sessionId, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = TaskService.listBySession(db, sessionId, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it("returns empty array for different session", () => {
      const otherSession = SessionService.create(db, { title: "Other" });
      const tasks = TaskService.listBySession(db, otherSession.id);
      expect(tasks.length).toBe(0);
    });
  });

  describe("listByMission", () => {
    it("lists tasks for a mission", () => {
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, "usr_test");
      MissionService.start(db, mission.id, sessionId);

      TaskService.create(db, sessionId, {
        title: "Mission Task 1",
        activeForm: "Working on task 1",
        missionId: mission.id,
      });
      TaskService.create(db, sessionId, {
        title: "Mission Task 2",
        activeForm: "Working on task 2",
        missionId: mission.id,
      });
      TaskService.create(db, sessionId, {
        title: "Non-mission Task",
        activeForm: "Working on other task",
      });

      const missionTasks = TaskService.listByMission(db, mission.id);
      expect(missionTasks.length).toBe(2);
      expect(missionTasks[0]!.title).toBe("Mission Task 1");
      expect(missionTasks[1]!.title).toBe("Mission Task 2");
    });
  });

  describe("list", () => {
    it("lists tasks with advanced filters", () => {
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      TaskService.create(db, sessionId, {
        title: "Agent Task",
        activeForm: "Working on agent task",
        createdBy: "agent",
        assignedTo: "agent",
      });
      TaskService.create(db, sessionId, {
        title: "User Task",
        activeForm: "Working on user task",
        createdBy: "user",
        assignedTo: "user",
      });

      const agentTasks = TaskService.list(db, { createdBy: "agent" });
      expect(agentTasks.length).toBe(1);
      expect(agentTasks[0]!.title).toBe("Agent Task");

      const userTasks = TaskService.list(db, { assignedTo: "user" });
      expect(userTasks.length).toBe(1);
      expect(userTasks[0]!.title).toBe("User Task");
    });
  });

  describe("update", () => {
    it("updates task title", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Original",
        activeForm: "Original",
      });

      const updated = TaskService.update(db, task.id, {
        title: "Updated",
      });

      expect(updated.title).toBe("Updated");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
    });

    it("updates task status", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const inProgress = TaskService.update(db, task.id, { status: "in_progress" });
      expect(inProgress.status).toBe("in_progress");
      expect(inProgress.startedAt).not.toBeNull();

      const completed = TaskService.update(db, task.id, { status: "completed" });
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
    });

    it("demotes existing in_progress when setting another to in_progress", () => {
      const first = TaskService.create(db, sessionId, {
        title: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TaskService.create(db, sessionId, {
        title: "Second",
        activeForm: "Second",
        status: "pending",
      });

      TaskService.update(db, second.id, { status: "in_progress" });

      const updatedFirst = TaskService.getById(db, first.id);
      const updatedSecond = TaskService.getById(db, second.id);

      expect(updatedFirst?.status).toBe("pending");
      expect(updatedSecond?.status).toBe("in_progress");
    });

    it("updates task position", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
      });

      const updated = TaskService.update(db, task.id, { position: 5 });
      expect(updated.position).toBe(5);
    });

    it("updates task description and result", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
      });

      const updated = TaskService.update(db, task.id, {
        description: "New description",
        result: "Task result",
      });

      expect(updated.description).toBe("New description");
      expect(updated.result).toBe("Task result");
    });

    it("throws for non-existent task", () => {
      expect(() => {
        TaskService.update(db, "task_nonexistent", { title: "Updated" });
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes a task", () => {
      const task = TaskService.create(db, sessionId, {
        title: "To delete",
        activeForm: "Deleting",
      });

      TaskService.delete(db, task.id);

      const retrieved = TaskService.getById(db, task.id);
      expect(retrieved).toBeNull();
    });

    it("throws for non-existent task", () => {
      expect(() => {
        TaskService.delete(db, "task_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("count", () => {
    beforeEach(() => {
      TaskService.create(db, sessionId, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      TaskService.create(db, sessionId, {
        title: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });
    });

    it("counts all tasks for a session", () => {
      expect(TaskService.count(db, sessionId)).toBe(2);
    });

    it("counts by status", () => {
      expect(TaskService.count(db, sessionId, "pending")).toBe(1);
      expect(TaskService.count(db, sessionId, "in_progress")).toBe(1);
      expect(TaskService.count(db, sessionId, "completed")).toBe(0);
    });

    it("returns 0 for different session", () => {
      const otherSession = SessionService.create(db, { title: "Other" });
      expect(TaskService.count(db, otherSession.id)).toBe(0);
    });
  });

  describe("countByMission", () => {
    it("counts tasks for a mission", () => {
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, "usr_test");
      MissionService.start(db, mission.id, sessionId);

      TaskService.create(db, sessionId, {
        title: "Mission Task 1",
        activeForm: "Working",
        missionId: mission.id,
      });
      TaskService.create(db, sessionId, {
        title: "Mission Task 2",
        activeForm: "Working",
        missionId: mission.id,
        status: "in_progress",
      });

      expect(TaskService.countByMission(db, mission.id)).toBe(2);
      expect(TaskService.countByMission(db, mission.id, "pending")).toBe(1);
      expect(TaskService.countByMission(db, mission.id, "in_progress")).toBe(1);
    });
  });

  describe("replaceBatch", () => {
    it("replaces all tasks for a session", () => {
      // Create initial tasks
      TaskService.create(db, sessionId, {
        title: "Old 1",
        activeForm: "Old 1",
      });
      TaskService.create(db, sessionId, {
        title: "Old 2",
        activeForm: "Old 2",
      });

      // Replace with new tasks
      const newTasks = TaskService.replaceBatch(db, sessionId, [
        { title: "New 1", activeForm: "New 1", status: "pending" },
        { title: "New 2", activeForm: "New 2", status: "in_progress" },
        { title: "New 3", activeForm: "New 3", status: "completed" },
      ]);

      expect(newTasks.length).toBe(3);

      const allTasks = TaskService.listBySession(db, sessionId);
      expect(allTasks.length).toBe(3);
      expect(allTasks[0]!.title).toBe("New 1");
      expect(allTasks[1]!.title).toBe("New 2");
      expect(allTasks[2]!.title).toBe("New 3");
    });

    it("sets correct positions", () => {
      const tasks = TaskService.replaceBatch(db, sessionId, [
        { title: "First", activeForm: "First", status: "pending" },
        { title: "Second", activeForm: "Second", status: "pending" },
        { title: "Third", activeForm: "Third", status: "pending" },
      ]);

      expect(tasks[0]!.position).toBe(0);
      expect(tasks[1]!.position).toBe(1);
      expect(tasks[2]!.position).toBe(2);
    });

    it("throws when multiple tasks are in_progress", () => {
      expect(() => {
        TaskService.replaceBatch(db, sessionId, [
          { title: "First", activeForm: "First", status: "in_progress" },
          { title: "Second", activeForm: "Second", status: "in_progress" },
        ]);
      }).toThrow(ValidationError);
    });

    it("clears all tasks when given empty array", () => {
      TaskService.create(db, sessionId, {
        title: "Existing",
        activeForm: "Existing",
      });

      TaskService.replaceBatch(db, sessionId, []);

      const tasks = TaskService.listBySession(db, sessionId);
      expect(tasks.length).toBe(0);
    });

    it("preserves mission tasks when replacing", () => {
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, "usr_test");
      MissionService.start(db, mission.id, sessionId);

      // Create a mission task
      TaskService.create(db, sessionId, {
        title: "Mission Task",
        activeForm: "Working",
        missionId: mission.id,
      });

      // Create a standalone task
      TaskService.create(db, sessionId, {
        title: "Standalone Task",
        activeForm: "Working",
      });

      // Replace batch - should only replace standalone tasks
      TaskService.replaceBatch(db, sessionId, [
        { title: "New Standalone", activeForm: "New", status: "pending" },
      ]);

      const allTasks = TaskService.listBySession(db, sessionId);
      expect(allTasks.length).toBe(2);

      const missionTasks = TaskService.listByMission(db, mission.id);
      expect(missionTasks.length).toBe(1);
      expect(missionTasks[0]!.title).toBe("Mission Task");
    });
  });

  describe("clearCompleted", () => {
    it("removes completed tasks", () => {
      const pending = TaskService.create(db, sessionId, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      const completed = TaskService.create(db, sessionId, {
        title: "Completed",
        activeForm: "Completed",
        status: "pending",
      });
      TaskService.update(db, completed.id, { status: "completed" });

      const cleared = TaskService.clearCompleted(db, sessionId);
      expect(cleared).toBe(1);

      const tasks = TaskService.listBySession(db, sessionId);
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.id).toBe(pending.id);
    });

    it("returns 0 when no completed tasks", () => {
      TaskService.create(db, sessionId, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });

      const cleared = TaskService.clearCompleted(db, sessionId);
      expect(cleared).toBe(0);
    });
  });

  describe("getInProgress", () => {
    it("returns the in_progress task", () => {
      TaskService.create(db, sessionId, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      const active = TaskService.create(db, sessionId, {
        title: "Active",
        activeForm: "Active",
        status: "in_progress",
      });

      const inProgress = TaskService.getInProgress(db, sessionId);
      expect(inProgress).not.toBeNull();
      expect(inProgress?.id).toBe(active.id);
    });

    it("returns null when no in_progress task", () => {
      TaskService.create(db, sessionId, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });

      const inProgress = TaskService.getInProgress(db, sessionId);
      expect(inProgress).toBeNull();
    });
  });

  describe("setInProgress", () => {
    it("sets a task to in_progress", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const updated = TaskService.setInProgress(db, task.id);
      expect(updated.status).toBe("in_progress");
      expect(updated.startedAt).not.toBeNull();
    });

    it("demotes existing in_progress task", () => {
      const first = TaskService.create(db, sessionId, {
        title: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TaskService.create(db, sessionId, {
        title: "Second",
        activeForm: "Second",
        status: "pending",
      });

      TaskService.setInProgress(db, second.id);

      const updatedFirst = TaskService.getById(db, first.id);
      expect(updatedFirst?.status).toBe("pending");
    });
  });

  describe("markCompleted", () => {
    it("marks a task as completed", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const completed = TaskService.markCompleted(db, task.id);
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
    });

    it("marks a task as completed with result", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const completed = TaskService.markCompleted(db, task.id, "Task completed successfully");
      expect(completed.result).toBe("Task completed successfully");
    });
  });

  describe("start", () => {
    it("starts a task (alias for setInProgress)", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const started = TaskService.start(db, task.id);
      expect(started.status).toBe("in_progress");
    });
  });

  describe("complete", () => {
    it("completes a task (alias for markCompleted)", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const completed = TaskService.complete(db, task.id, "Done");
      expect(completed.status).toBe("completed");
      expect(completed.result).toBe("Done");
    });
  });

  describe("block", () => {
    it("blocks a task", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const blocked = TaskService.block(db, task.id);
      expect(blocked.status).toBe("blocked");
    });

    it("blocks a task with reason", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const blocked = TaskService.block(db, task.id, "Waiting for dependency");
      expect(blocked.status).toBe("blocked");
      expect(blocked.result).toBe("Waiting for dependency");
    });
  });

  describe("cancel", () => {
    it("cancels a task", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const cancelled = TaskService.cancel(db, task.id);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.completedAt).not.toBeNull();
    });
  });

  describe("session isolation", () => {
    it("isolates tasks between sessions", () => {
      const session1 = SessionService.create(db, { title: "Session 1" });
      const session2 = SessionService.create(db, { title: "Session 2" });

      TaskService.create(db, session1.id, {
        title: "Session 1 Task",
        activeForm: "Session 1 Task",
      });
      TaskService.create(db, session2.id, {
        title: "Session 2 Task",
        activeForm: "Session 2 Task",
      });

      const session1Tasks = TaskService.listBySession(db, session1.id);
      const session2Tasks = TaskService.listBySession(db, session2.id);

      expect(session1Tasks.length).toBe(1);
      expect(session2Tasks.length).toBe(1);
      expect(session1Tasks[0]!.title).toBe("Session 1 Task");
      expect(session2Tasks[0]!.title).toBe("Session 2 Task");
    });
  });

  describe("backwards compatibility", () => {
    it("creates tasks with task_ prefix (not todo_)", () => {
      const task = TaskService.create(db, sessionId, {
        title: "Test",
        activeForm: "Test",
      });

      expect(task.id).toMatch(/^task_/);
    });
  });
});
