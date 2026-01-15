/**
 * Todo Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { TodoService } from "@/services/todos.ts";
import { SessionService } from "@/services/sessions.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

describe("Todo Service", () => {
  let db: Database;
  let sessionId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Create a session for todos
    const session = SessionService.create(db, {
      title: "Test Session",
    });
    sessionId = session.id;
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a todo with pending status", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Fix the bug",
        activeForm: "Fixing the bug",
      });

      expect(todo.id).toMatch(/^todo_/);
      expect(todo.sessionId).toBe(sessionId);
      expect(todo.content).toBe("Fix the bug");
      expect(todo.activeForm).toBe("Fixing the bug");
      expect(todo.status).toBe("pending");
      expect(todo.position).toBe(0);
    });

    it("creates a todo with in_progress status", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Active task",
        activeForm: "Working on active task",
        status: "in_progress",
      });

      expect(todo.status).toBe("in_progress");
    });

    it("auto-increments position", () => {
      const todo1 = TodoService.create(db, sessionId, {
        content: "First",
        activeForm: "First",
      });
      const todo2 = TodoService.create(db, sessionId, {
        content: "Second",
        activeForm: "Second",
      });
      const todo3 = TodoService.create(db, sessionId, {
        content: "Third",
        activeForm: "Third",
      });

      expect(todo1.position).toBe(0);
      expect(todo2.position).toBe(1);
      expect(todo3.position).toBe(2);
    });

    it("demotes existing in_progress todo when creating new one with in_progress", () => {
      const first = TodoService.create(db, sessionId, {
        content: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TodoService.create(db, sessionId, {
        content: "Second",
        activeForm: "Second",
        status: "in_progress",
      });

      const updatedFirst = TodoService.getById(db, first.id);
      expect(updatedFirst?.status).toBe("pending");
      expect(second.status).toBe("in_progress");
    });
  });

  describe("getById", () => {
    it("retrieves a todo by ID", () => {
      const created = TodoService.create(db, sessionId, {
        content: "Test todo",
        activeForm: "Testing",
      });

      const retrieved = TodoService.getById(db, created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.content).toBe("Test todo");
    });

    it("returns null for non-existent ID", () => {
      const result = TodoService.getById(db, "todo_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("retrieves a todo or throws", () => {
      const created = TodoService.create(db, sessionId, {
        content: "Test todo",
        activeForm: "Testing",
      });

      const retrieved = TodoService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws NotFoundError for non-existent ID", () => {
      expect(() => {
        TodoService.getByIdOrThrow(db, "todo_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("listBySession", () => {
    beforeEach(() => {
      TodoService.create(db, sessionId, {
        content: "Pending 1",
        activeForm: "Pending 1",
        status: "pending",
      });
      TodoService.create(db, sessionId, {
        content: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });
      TodoService.create(db, sessionId, {
        content: "Pending 2",
        activeForm: "Pending 2",
        status: "pending",
      });
    });

    it("lists all todos for a session", () => {
      const todos = TodoService.listBySession(db, sessionId);
      expect(todos.length).toBe(3);
    });

    it("lists todos in position order", () => {
      const todos = TodoService.listBySession(db, sessionId);
      expect(todos[0]!.position).toBe(0);
      expect(todos[1]!.position).toBe(1);
      expect(todos[2]!.position).toBe(2);
    });

    it("filters by status", () => {
      const pending = TodoService.listBySession(db, sessionId, { status: "pending" });
      expect(pending.length).toBe(2);

      const inProgress = TodoService.listBySession(db, sessionId, { status: "in_progress" });
      expect(inProgress.length).toBe(1);
    });

    it("supports pagination", () => {
      const page1 = TodoService.listBySession(db, sessionId, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = TodoService.listBySession(db, sessionId, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it("returns empty array for different session", () => {
      const otherSession = SessionService.create(db, { title: "Other" });
      const todos = TodoService.listBySession(db, otherSession.id);
      expect(todos.length).toBe(0);
    });
  });

  describe("update", () => {
    it("updates todo content", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Original",
        activeForm: "Original",
      });

      const updated = TodoService.update(db, todo.id, {
        content: "Updated",
      });

      expect(updated.content).toBe("Updated");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(todo.updatedAt);
    });

    it("updates todo status", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const inProgress = TodoService.update(db, todo.id, { status: "in_progress" });
      expect(inProgress.status).toBe("in_progress");

      const completed = TodoService.update(db, todo.id, { status: "completed" });
      expect(completed.status).toBe("completed");
    });

    it("demotes existing in_progress when setting another to in_progress", () => {
      const first = TodoService.create(db, sessionId, {
        content: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TodoService.create(db, sessionId, {
        content: "Second",
        activeForm: "Second",
        status: "pending",
      });

      TodoService.update(db, second.id, { status: "in_progress" });

      const updatedFirst = TodoService.getById(db, first.id);
      const updatedSecond = TodoService.getById(db, second.id);

      expect(updatedFirst?.status).toBe("pending");
      expect(updatedSecond?.status).toBe("in_progress");
    });

    it("updates todo position", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Task",
        activeForm: "Task",
      });

      const updated = TodoService.update(db, todo.id, { position: 5 });
      expect(updated.position).toBe(5);
    });

    it("throws for non-existent todo", () => {
      expect(() => {
        TodoService.update(db, "todo_nonexistent", { content: "Updated" });
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes a todo", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "To delete",
        activeForm: "Deleting",
      });

      TodoService.delete(db, todo.id);

      const retrieved = TodoService.getById(db, todo.id);
      expect(retrieved).toBeNull();
    });

    it("throws for non-existent todo", () => {
      expect(() => {
        TodoService.delete(db, "todo_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("count", () => {
    beforeEach(() => {
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
    });

    it("counts all todos for a session", () => {
      expect(TodoService.count(db, sessionId)).toBe(2);
    });

    it("counts by status", () => {
      expect(TodoService.count(db, sessionId, "pending")).toBe(1);
      expect(TodoService.count(db, sessionId, "in_progress")).toBe(1);
      expect(TodoService.count(db, sessionId, "completed")).toBe(0);
    });

    it("returns 0 for different session", () => {
      const otherSession = SessionService.create(db, { title: "Other" });
      expect(TodoService.count(db, otherSession.id)).toBe(0);
    });
  });

  describe("replaceBatch", () => {
    it("replaces all todos for a session", () => {
      // Create initial todos
      TodoService.create(db, sessionId, {
        content: "Old 1",
        activeForm: "Old 1",
      });
      TodoService.create(db, sessionId, {
        content: "Old 2",
        activeForm: "Old 2",
      });

      // Replace with new todos
      const newTodos = TodoService.replaceBatch(db, sessionId, [
        { content: "New 1", activeForm: "New 1", status: "pending" },
        { content: "New 2", activeForm: "New 2", status: "in_progress" },
        { content: "New 3", activeForm: "New 3", status: "completed" },
      ]);

      expect(newTodos.length).toBe(3);

      const allTodos = TodoService.listBySession(db, sessionId);
      expect(allTodos.length).toBe(3);
      expect(allTodos[0]!.content).toBe("New 1");
      expect(allTodos[1]!.content).toBe("New 2");
      expect(allTodos[2]!.content).toBe("New 3");
    });

    it("sets correct positions", () => {
      const todos = TodoService.replaceBatch(db, sessionId, [
        { content: "First", activeForm: "First", status: "pending" },
        { content: "Second", activeForm: "Second", status: "pending" },
        { content: "Third", activeForm: "Third", status: "pending" },
      ]);

      expect(todos[0]!.position).toBe(0);
      expect(todos[1]!.position).toBe(1);
      expect(todos[2]!.position).toBe(2);
    });

    it("throws when multiple todos are in_progress", () => {
      expect(() => {
        TodoService.replaceBatch(db, sessionId, [
          { content: "First", activeForm: "First", status: "in_progress" },
          { content: "Second", activeForm: "Second", status: "in_progress" },
        ]);
      }).toThrow(ValidationError);
    });

    it("clears all todos when given empty array", () => {
      TodoService.create(db, sessionId, {
        content: "Existing",
        activeForm: "Existing",
      });

      TodoService.replaceBatch(db, sessionId, []);

      const todos = TodoService.listBySession(db, sessionId);
      expect(todos.length).toBe(0);
    });
  });

  describe("clearCompleted", () => {
    it("removes completed todos", () => {
      const pending = TodoService.create(db, sessionId, {
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

      const cleared = TodoService.clearCompleted(db, sessionId);
      expect(cleared).toBe(1);

      const todos = TodoService.listBySession(db, sessionId);
      expect(todos.length).toBe(1);
      expect(todos[0]!.id).toBe(pending.id);
    });

    it("returns 0 when no completed todos", () => {
      TodoService.create(db, sessionId, {
        content: "Pending",
        activeForm: "Pending",
        status: "pending",
      });

      const cleared = TodoService.clearCompleted(db, sessionId);
      expect(cleared).toBe(0);
    });
  });

  describe("getInProgress", () => {
    it("returns the in_progress todo", () => {
      TodoService.create(db, sessionId, {
        content: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      const active = TodoService.create(db, sessionId, {
        content: "Active",
        activeForm: "Active",
        status: "in_progress",
      });

      const inProgress = TodoService.getInProgress(db, sessionId);
      expect(inProgress).not.toBeNull();
      expect(inProgress?.id).toBe(active.id);
    });

    it("returns null when no in_progress todo", () => {
      TodoService.create(db, sessionId, {
        content: "Pending",
        activeForm: "Pending",
        status: "pending",
      });

      const inProgress = TodoService.getInProgress(db, sessionId);
      expect(inProgress).toBeNull();
    });
  });

  describe("setInProgress", () => {
    it("sets a todo to in_progress", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Task",
        activeForm: "Task",
        status: "pending",
      });

      const updated = TodoService.setInProgress(db, todo.id);
      expect(updated.status).toBe("in_progress");
    });

    it("demotes existing in_progress todo", () => {
      const first = TodoService.create(db, sessionId, {
        content: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const second = TodoService.create(db, sessionId, {
        content: "Second",
        activeForm: "Second",
        status: "pending",
      });

      TodoService.setInProgress(db, second.id);

      const updatedFirst = TodoService.getById(db, first.id);
      expect(updatedFirst?.status).toBe("pending");
    });
  });

  describe("markCompleted", () => {
    it("marks a todo as completed", () => {
      const todo = TodoService.create(db, sessionId, {
        content: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const completed = TodoService.markCompleted(db, todo.id);
      expect(completed.status).toBe("completed");
    });
  });

  describe("session isolation", () => {
    it("isolates todos between sessions", () => {
      const session1 = SessionService.create(db, { title: "Session 1" });
      const session2 = SessionService.create(db, { title: "Session 2" });

      TodoService.create(db, session1.id, {
        content: "Session 1 Todo",
        activeForm: "Session 1 Todo",
      });
      TodoService.create(db, session2.id, {
        content: "Session 2 Todo",
        activeForm: "Session 2 Todo",
      });

      const session1Todos = TodoService.listBySession(db, session1.id);
      const session2Todos = TodoService.listBySession(db, session2.id);

      expect(session1Todos.length).toBe(1);
      expect(session2Todos.length).toBe(1);
      expect(session1Todos[0]!.content).toBe("Session 1 Todo");
      expect(session2Todos[0]!.content).toBe("Session 2 Todo");
    });
  });
});
