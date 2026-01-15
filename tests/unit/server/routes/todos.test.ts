/**
 * Todos API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SessionService } from "@/services/sessions.ts";
import { TodoService } from "@/services/todos.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  TodoResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Todos API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/todos-route-test"
  );
  const testUserId = "usr_test-user-todos";
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
      .run(testUserId, "todos-test@example.com", "todosuser", now, now);

    // Create a test project
    const project = ProjectService.create(rootDb, {
      name: "Todos Test Project",
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

  describe("GET /api/sessions/:sessionId/todos", () => {
    it("requires projectId", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`);

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns empty list when no todos exist", async () => {
      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TodoResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns todos list with pagination", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TodoService.create(db, sessionId, {
        content: "Task 1",
        activeForm: "Task 1",
      });
      TodoService.create(db, sessionId, {
        content: "Task 2",
        activeForm: "Task 2",
      });
      TodoService.create(db, sessionId, {
        content: "Task 3",
        activeForm: "Task 3",
      });

      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}&limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TodoResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters by status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TodoService.create(db, sessionId, {
        content: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      TodoService.create(db, sessionId, {
        content: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });

      const response = await app.request(
        `/api/sessions/${sessionId}/todos?projectId=${projectId}&status=pending`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TodoResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.content).toBe("Pending");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request(
        `/api/sessions/sess_nonexistent/todos?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/sessions/:sessionId/todos", () => {
    it("creates a new todo", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "New task",
          activeForm: "Working on new task",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TodoResponse>;
      expect(body.data.id).toMatch(/^todo_/);
      expect(body.data.content).toBe("New task");
      expect(body.data.activeForm).toBe("Working on new task");
      expect(body.data.status).toBe("pending");
    });

    it("creates a todo with in_progress status", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Active task",
          activeForm: "Working on active task",
          status: "in_progress",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TodoResponse>;
      expect(body.data.status).toBe("in_progress");
    });

    it("requires projectId", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Test",
          activeForm: "Test",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request("/api/sessions/sess_nonexistent/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Test",
          activeForm: "Test",
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/sessions/:sessionId/todos", () => {
    it("replaces all todos", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create initial todos
      TodoService.create(db, sessionId, {
        content: "Old 1",
        activeForm: "Old 1",
      });

      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [
            { content: "New 1", activeForm: "New 1", status: "pending" },
            { content: "New 2", activeForm: "New 2", status: "in_progress" },
            { content: "New 3", activeForm: "New 3", status: "completed" },
          ],
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TodoResponse>;
      expect(body.data.length).toBe(3);
      expect(body.meta.total).toBe(3);
    });

    it("clears todos when given empty array", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TodoService.create(db, sessionId, {
        content: "Existing",
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

      const body = (await response.json()) as ListResponse<TodoResponse>;
      expect(body.data.length).toBe(0);
    });

    it("rejects multiple in_progress todos", async () => {
      const response = await app.request(`/api/sessions/${sessionId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [
            { content: "First", activeForm: "First", status: "in_progress" },
            { content: "Second", activeForm: "Second", status: "in_progress" },
          ],
        }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request("/api/sessions/sess_nonexistent/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          todos: [],
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/sessions/:sessionId/todos/completed", () => {
    it("clears completed todos", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      TodoService.create(db, sessionId, {
        content: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      const completed = TodoService.create(db, sessionId, {
        content: "Completed",
        activeForm: "Completed",
        status: "pending",
      });
      TodoService.update(db, completed.id, { status: "completed" });

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

    it("returns 0 when no completed todos", async () => {
      const response = await app.request(
        `/api/sessions/${sessionId}/todos/completed?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ cleared: number }>;
      expect(body.data.cleared).toBe(0);
    });
  });

  describe("GET /api/todos/:id", () => {
    it("returns todo by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const todo = TodoService.create(db, sessionId, {
        content: "Get test",
        activeForm: "Get test",
      });

      const response = await app.request(
        `/api/todos/${todo.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TodoResponse>;
      expect(body.data.id).toBe(todo.id);
      expect(body.data.content).toBe("Get test");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/todos/todo_test");

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent todo", async () => {
      const response = await app.request(
        `/api/todos/todo_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/todos/:id", () => {
    it("updates todo content", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const todo = TodoService.create(db, sessionId, {
        content: "Original",
        activeForm: "Original",
      });

      const response = await app.request(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Updated",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TodoResponse>;
      expect(body.data.content).toBe("Updated");
    });

    it("updates todo status", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const todo = TodoService.create(db, sessionId, {
        content: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const response = await app.request(`/api/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          status: "in_progress",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<TodoResponse>;
      expect(body.data.status).toBe("in_progress");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/todos/todo_test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Test",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent todo", async () => {
      const response = await app.request("/api/todos/todo_nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "Test",
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/todos/:id", () => {
    it("deletes a todo", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const todo = TodoService.create(db, sessionId, {
        content: "To delete",
        activeForm: "To delete",
      });

      const response = await app.request(
        `/api/todos/${todo.id}?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify todo is deleted
      const deleted = TodoService.getById(db, todo.id);
      expect(deleted).toBeNull();
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/todos/todo_test", {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent todo", async () => {
      const response = await app.request(
        `/api/todos/todo_nonexistent?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(404);
    });
  });
});
