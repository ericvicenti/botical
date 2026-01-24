/**
 * Task Queries Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DatabaseManager } from "../../../src/database/index.ts";
import { TaskService, type Task } from "../../../src/services/tasks.ts";
import {
  tasksListBySessionQuery,
  tasksListByMissionQuery,
  tasksGetQuery,
  tasksCountBySessionQuery,
  tasksCountByMissionQuery,
  tasksCreateMutation,
  tasksUpdateMutation,
  tasksDeleteMutation,
  tasksBatchReplaceMutation,
} from "../../../src/queries/tasks.ts";
import type { QueryContext, MutationContext } from "../../../src/queries/types.ts";

// Mock data
const mockTask: Task = {
  id: "task-1",
  sessionId: "session-1",
  missionId: null,
  title: "Test Task",
  activeForm: "Testing task",
  status: "pending",
  position: 0,
  createdBy: "user",
  assignedTo: "agent",
  parentTaskId: null,
  description: "A test task",
  result: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  startedAt: null,
  completedAt: null,
};

const mockTasks: Task[] = [
  mockTask,
  {
    ...mockTask,
    id: "task-2",
    title: "In Progress Task",
    activeForm: "Working on task",
    status: "in_progress",
    position: 1,
    startedAt: Date.now(),
  },
  {
    ...mockTask,
    id: "task-3",
    title: "Completed Task",
    activeForm: "Completed task",
    status: "completed",
    position: 2,
    result: "Success",
    completedAt: Date.now(),
  },
];

describe("Task Queries", () => {
  const mockDb = { prepare: () => ({}) } as any;
  const mockContext: QueryContext = { projectId: "test-project" };
  const mockMutationContext: MutationContext = { projectId: "test-project" };

  let getProjectDbSpy: ReturnType<typeof spyOn>;
  let listBySessionSpy: ReturnType<typeof spyOn>;
  let listByMissionSpy: ReturnType<typeof spyOn>;
  let getByIdOrThrowSpy: ReturnType<typeof spyOn>;
  let countSpy: ReturnType<typeof spyOn>;
  let countByMissionSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let replaceBatchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb);
    listBySessionSpy = spyOn(TaskService, "listBySession").mockReturnValue(mockTasks);
    listByMissionSpy = spyOn(TaskService, "listByMission").mockReturnValue(mockTasks);
    getByIdOrThrowSpy = spyOn(TaskService, "getByIdOrThrow").mockReturnValue(mockTask);
    countSpy = spyOn(TaskService, "count").mockReturnValue(10);
    countByMissionSpy = spyOn(TaskService, "countByMission").mockReturnValue(5);
    createSpy = spyOn(TaskService, "create").mockReturnValue(mockTask);
    updateSpy = spyOn(TaskService, "update").mockReturnValue(mockTask);
    deleteSpy = spyOn(TaskService, "delete").mockReturnValue(undefined);
    replaceBatchSpy = spyOn(TaskService, "replaceBatch").mockReturnValue(mockTasks);
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
    listBySessionSpy.mockRestore();
    listByMissionSpy.mockRestore();
    getByIdOrThrowSpy.mockRestore();
    countSpy.mockRestore();
    countByMissionSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    replaceBatchSpy.mockRestore();
  });

  describe("tasksListBySessionQuery", () => {
    test("has correct name", () => {
      expect(tasksListBySessionQuery.name).toBe("tasks.listbysession");
    });

    test("fetches tasks list by session", async () => {
      const result = await tasksListBySessionQuery.fetch(
        { projectId: "test-project", sessionId: "session-1" },
        mockContext
      );

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe("task-1");
      expect(result[0]!.status).toBe("pending");
      expect(result[1]!.status).toBe("in_progress");
      expect(result[2]!.status).toBe("completed");
    });

    test("passes filter options", async () => {
      await tasksListBySessionQuery.fetch(
        { projectId: "test-project", sessionId: "session-1", status: "pending" },
        mockContext
      );

      expect(listBySessionSpy).toHaveBeenCalledWith(mockDb, "session-1", {
        status: "pending",
        limit: undefined,
        offset: undefined,
      });
    });

    test("has correct cache configuration", () => {
      expect(tasksListBySessionQuery.cache).toBeDefined();
      expect(tasksListBySessionQuery.cache!.ttl).toBe(5_000);
      expect(tasksListBySessionQuery.cache!.scope).toBe("project");
    });

    test("generates correct cache key", () => {
      const key = tasksListBySessionQuery.cache!.key!({
        projectId: "proj1",
        sessionId: "sess1",
        status: "pending",
      });
      expect(key).toContain("tasks.listbysession");
      expect(key).toContain("proj1");
      expect(key).toContain("sess1");
      expect(key).toContain("status:pending");
    });

    test("has realtime events", () => {
      expect(tasksListBySessionQuery.realtime).toBeDefined();
      expect(tasksListBySessionQuery.realtime!.events).toContain("task.created");
      expect(tasksListBySessionQuery.realtime!.events).toContain("task.updated");
      expect(tasksListBySessionQuery.realtime!.events).toContain("task.deleted");
      expect(tasksListBySessionQuery.realtime!.events).toContain("tasks.replaced");
    });
  });

  describe("tasksListByMissionQuery", () => {
    test("has correct name", () => {
      expect(tasksListByMissionQuery.name).toBe("tasks.listbymission");
    });

    test("fetches tasks list by mission", async () => {
      const result = await tasksListByMissionQuery.fetch(
        { projectId: "test-project", missionId: "mission-1" },
        mockContext
      );

      expect(result).toHaveLength(3);
      expect(listByMissionSpy).toHaveBeenCalledWith(mockDb, "mission-1", {
        status: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    test("generates correct cache key", () => {
      const key = tasksListByMissionQuery.cache!.key!({
        projectId: "proj1",
        missionId: "miss1",
      });
      expect(key).toContain("tasks.listbymission");
      expect(key).toContain("proj1");
      expect(key).toContain("miss1");
    });
  });

  describe("tasksGetQuery", () => {
    test("has correct name", () => {
      expect(tasksGetQuery.name).toBe("tasks.get");
    });

    test("fetches a single task", async () => {
      const result = await tasksGetQuery.fetch(
        { projectId: "test-project", taskId: "task-1" },
        mockContext
      );

      expect(result.id).toBe("task-1");
      expect(result.title).toBe("Test Task");
      expect(getByIdOrThrowSpy).toHaveBeenCalledWith(mockDb, "task-1");
    });

    test("has correct cache configuration", () => {
      const key = tasksGetQuery.cache!.key!({
        projectId: "proj1",
        taskId: "task1",
      });
      expect(key).toEqual(["tasks.get", "proj1", "task1"]);
    });
  });

  describe("tasksCountBySessionQuery", () => {
    test("has correct name", () => {
      expect(tasksCountBySessionQuery.name).toBe("tasks.countbysession");
    });

    test("returns task count by session", async () => {
      const result = await tasksCountBySessionQuery.fetch(
        { projectId: "test-project", sessionId: "session-1" },
        mockContext
      );

      expect(result).toBe(10);
      expect(countSpy).toHaveBeenCalledWith(mockDb, "session-1", undefined);
    });

    test("passes status filter", async () => {
      await tasksCountBySessionQuery.fetch(
        { projectId: "test-project", sessionId: "session-1", status: "completed" },
        mockContext
      );

      expect(countSpy).toHaveBeenCalledWith(mockDb, "session-1", "completed");
    });
  });

  describe("tasksCountByMissionQuery", () => {
    test("has correct name", () => {
      expect(tasksCountByMissionQuery.name).toBe("tasks.countbymission");
    });

    test("returns task count by mission", async () => {
      const result = await tasksCountByMissionQuery.fetch(
        { projectId: "test-project", missionId: "mission-1" },
        mockContext
      );

      expect(result).toBe(5);
      expect(countByMissionSpy).toHaveBeenCalledWith(mockDb, "mission-1", undefined);
    });
  });

  describe("tasksCreateMutation", () => {
    test("has correct name", () => {
      expect(tasksCreateMutation.name).toBe("tasks.create");
    });

    test("creates a task", async () => {
      const createInput = {
        title: "New Task",
        activeForm: "Creating task",
        status: "pending" as const,
      };

      const result = await tasksCreateMutation.execute(
        { projectId: "test-project", sessionId: "session-1", data: createInput },
        mockMutationContext
      );

      expect(result.id).toBe("task-1");
      expect(createSpy).toHaveBeenCalledWith(mockDb, "session-1", createInput);
    });

    test("invalidates correct queries", () => {
      expect(tasksCreateMutation.invalidates).toContain("tasks.listbysession");
      expect(tasksCreateMutation.invalidates).toContain("tasks.listbymission");
      expect(tasksCreateMutation.invalidates).toContain("tasks.countbysession");
      expect(tasksCreateMutation.invalidates).toContain("tasks.countbymission");
    });
  });

  describe("tasksUpdateMutation", () => {
    test("has correct name", () => {
      expect(tasksUpdateMutation.name).toBe("tasks.update");
    });

    test("updates a task", async () => {
      const result = await tasksUpdateMutation.execute(
        {
          projectId: "test-project",
          taskId: "task-1",
          data: { status: "completed", result: "Done" },
        },
        mockMutationContext
      );

      expect(result.id).toBe("task-1");
      expect(updateSpy).toHaveBeenCalledWith(mockDb, "task-1", {
        status: "completed",
        result: "Done",
      });
    });

    test("has correct invalidate keys function", () => {
      const keys = tasksUpdateMutation.invalidateKeys!(
        { projectId: "proj1", taskId: "task1", data: {} },
        mockTask as any
      );
      expect(keys).toContainEqual(["tasks.get", "proj1", "task1"]);
    });
  });

  describe("tasksDeleteMutation", () => {
    test("has correct name", () => {
      expect(tasksDeleteMutation.name).toBe("tasks.delete");
    });

    test("deletes a task", async () => {
      const result = await tasksDeleteMutation.execute(
        { projectId: "test-project", taskId: "task-1" },
        mockMutationContext
      );

      expect(result).toEqual({ deleted: true });
      expect(deleteSpy).toHaveBeenCalledWith(mockDb, "task-1");
    });
  });

  describe("tasksBatchReplaceMutation", () => {
    test("has correct name", () => {
      expect(tasksBatchReplaceMutation.name).toBe("tasks.batchreplace");
    });

    test("replaces all tasks for a session", async () => {
      const newTasks = [
        { title: "Task A", activeForm: "Doing A", status: "pending" as const },
        { title: "Task B", activeForm: "Doing B", status: "in_progress" as const },
      ];

      const result = await tasksBatchReplaceMutation.execute(
        { projectId: "test-project", sessionId: "session-1", tasks: newTasks },
        mockMutationContext
      );

      expect(result).toHaveLength(3);
      expect(replaceBatchSpy).toHaveBeenCalledWith(mockDb, "session-1", newTasks);
    });

    test("invalidates correct queries", () => {
      expect(tasksBatchReplaceMutation.invalidates).toContain("tasks.listbysession");
      expect(tasksBatchReplaceMutation.invalidates).toContain("tasks.countbysession");
      expect(tasksBatchReplaceMutation.invalidates).toContain("tasks.countbymission");
    });
  });
});
