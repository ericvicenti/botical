/**
 * Tasks API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SessionService } from "@/services/sessions.ts";
import { TaskService } from "@/services/tasks.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  TaskResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Tasks API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/tasks-route-test"
  );
  const testUserId = "usr_test-user-tasks";
  let projectId: string;
  let sessionId: string;

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
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing test data
    rootDb
      .prepare(
        "DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)"
      )
      .run(testUserId);
    rootDb.prepare("DELETE FROM projects WHERE owner_id = ?").run(testUserId);
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "tasks-test@example.com", "tasksuser", now, now);

    // Create a test project
    const project = ProjectService.create(rootDb, {
      name: "Tasks Test Project",
      ownerId: testUserId,
    });
    projectId = project.id;

    // Create a test session
    const db = DatabaseManager.getProjectDb(projectId);
    const session = SessionService.create(db, {
      title: "Test Session",
    });
    sessionId = session.id;
  });

  const app = createApp();

  // ============================================
  // BACKWARDS COMPATIBLE TODO ROUTES
  // ============================================

  describe("GET /api/sessions/:sessionId/todos", () => {
    it("requires projectId", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`);

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns empty list when no tasks exist", async () => {
      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns tasks list with pagination", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TaskService.create(db, sessionId, {
        title: "Task 1",
        activeForm: "Task 1",
      });
      TaskService.create(db, sessionId, {
        title: "Task 2",
        activeForm: "Task 2",
      });
      TaskService.create(db, sessionId, {
        title: "Task 3",
        activeForm: "Task 3",
      });

      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}&limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters by status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

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

      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}&status=pending`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.title).toBe("Pending");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request(
        `/api/sessions/sess_nonexistent/todos?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/sessions/:sessionId/todos", () => {
    it("creates a new task using title", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "New task",
          activeForm: "Working on new task",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TaskResponse & { content: string }>;
      expect(body.data.id).toMatch(/^task_/);
      expect(body.data.title).toBe("New task");
      expect(body.data.content).toBe("New task"); // Backwards compat alias
      expect(body.data.activeForm).toBe("Working on new task");
      expect(body.data.status).toBe("pending");
    });

    it("creates a new task using content (backwards compat)", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Legacy task",
          activeForm: "Working on legacy task",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TaskResponse & { content: string }>;
      expect(body.data.title).toBe("Legacy task");
      expect(body.data.content).toBe("Legacy task");
    });

    it("creates a task with in_progress status", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "Active task",
          activeForm: "Working on active task",
          status: "in_progress",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("in_progress");
    });

    it("requires projectId", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test",
          activeForm: "Test",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/sessions/:sessionId/todos", () => {
    it("replaces all tasks using title", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TaskService.create(db, sessionId, {
        title: "Old 1",
        activeForm: "Old 1",
      });

      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [
            { title: "New 1", activeForm: "New 1", status: "pending" },
            { title: "New 2", activeForm: "New 2", status: "in_progress" },
            { title: "New 3", activeForm: "New 3", status: "completed" },
          ],
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse & { content: string }>;
      expect(body.data.length).toBe(3);
      expect(body.meta.total).toBe(3);
      expect(body.data[0]!.content).toBe("New 1"); // Backwards compat
    });

    it("replaces all tasks using content (backwards compat)", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [
            { content: "Legacy 1", activeForm: "Legacy 1", status: "pending" },
            { content: "Legacy 2", activeForm: "Legacy 2", status: "pending" },
          ],
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(2);
      expect(body.data[0]!.title).toBe("Legacy 1");
    });

    it("clears tasks when given empty array", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TaskService.create(db, sessionId, {
        title: "Existing",
        activeForm: "Existing",
      });

      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [],
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(0);
    });

    it("rejects multiple in_progress tasks", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [
            { title: "First", activeForm: "First", status: "in_progress" },
            { title: "Second", activeForm: "Second", status: "in_progress" },
          ],
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/sessions/:sessionId/todos/completed", () => {
    it("clears completed tasks", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TaskService.create(db, sessionId, {
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

      const response = await app.request(
        `/api/sessions/${sessionId}/todos/completed?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ cleared: number }>;
      expect(body.data.cleared).toBe(1);
    });
  });

  // ============================================
  // INDIVIDUAL TASK ROUTES
  // ============================================

  describe("GET /api/tasks/:id", () => {
    it("returns task by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Get test",
        activeForm: "Get test",
      });

      const response = await app.request(
        `/api/tasks/${task.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse & { content: string }>;
      expect(body.data.id).toBe(task.id);
      expect(body.data.title).toBe("Get test");
      expect(body.data.content).toBe("Get test"); // Backwards compat
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/tasks/task_test");

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent task", async () => {
      const response = await app.request(
        `/api/tasks/task_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/tasks/:id", () => {
    it("updates task title", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Original",
        activeForm: "Original",
      });

      const response = await app.request(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "Updated",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse & { content: string }>;
      expect(body.data.title).toBe("Updated");
      expect(body.data.content).toBe("Updated"); // Backwards compat
    });

    it("updates task using content (backwards compat)", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Original",
        activeForm: "Original",
      });

      const response = await app.request(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Legacy Updated",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.title).toBe("Legacy Updated");
    });

    it("updates task status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const response = await app.request(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          status: "in_progress",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("in_progress");
    });
  });

  describe("POST /api/tasks/:id/start", () => {
    it("starts a task", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const response = await app.request(`/api/tasks/${task.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("in_progress");
    });
  });

  describe("POST /api/tasks/:id/complete", () => {
    it("completes a task", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const response = await app.request(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          result: "Task completed successfully",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("completed");
      expect(body.data.result).toBe("Task completed successfully");
    });
  });

  describe("POST /api/tasks/:id/block", () => {
    it("blocks a task", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const response = await app.request(`/api/tasks/${task.id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          reason: "Waiting for dependency",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("blocked");
      expect(body.data.result).toBe("Waiting for dependency");
    });
  });

  describe("POST /api/tasks/:id/cancel", () => {
    it("cancels a task", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const response = await app.request(`/api/tasks/${task.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.status).toBe("cancelled");
    });
  });

  describe("DELETE /api/tasks/:id", () => {
    it("deletes a task", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const task = TaskService.create(db, sessionId, {
        title: "To delete",
        activeForm: "To delete",
      });

      const response = await app.request(
        `/api/tasks/${task.id}?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify task is deleted
      const deleted = TaskService.getById(db, task.id);
      expect(deleted).toBeNull();
    });
  });

  // ============================================
  // PROJECT-SCOPED TASK ROUTES
  // ============================================

  describe("GET /api/projects/:projectId/tasks", () => {
    it("lists all tasks in a project", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TaskService.create(db, sessionId, {
        title: "Task 1",
        activeForm: "Task 1",
      });
      TaskService.create(db, sessionId, {
        title: "Task 2",
        activeForm: "Task 2",
      });

      const response = await app.request(`/api/projects/${projectId}/tasks`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(2);
    });

    it("filters by sessionId", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const session2 = SessionService.create(db, { title: "Session 2" });

      TaskService.create(db, sessionId, {
        title: "Session 1 Task",
        activeForm: "Task",
      });
      TaskService.create(db, session2.id, {
        title: "Session 2 Task",
        activeForm: "Task",
      });

      const response = await app.request(
        `/api/projects/${projectId}/tasks?sessionId=${sessionId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.title).toBe("Session 1 Task");
    });
  });

  describe("POST /api/projects/:projectId/tasks", () => {
    it("creates a standalone task", async () => {
      const response = await app.request(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          title: "Project Task",
          activeForm: "Working on project task",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.id).toMatch(/^task_/);
      expect(body.data.title).toBe("Project Task");
    });

    it("requires sessionId", async () => {
      const response = await app.request(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Task",
          activeForm: "Task",
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
