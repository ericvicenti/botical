/**
 * Todo Tracking Integration Tests
 *
 * Tests the complete todo tracking system including lifecycle management,
 * session isolation, and batch operations.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { TodoService } from "@/services/tasks.ts";
import { SessionService } from "@/services/sessions.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

describe("Todo Tracking Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/todo-tracking"
  );
  const testProjectId = "test-todo-tracking";

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("todo lifecycle", () => {
    it("creates and tracks todos through status transitions", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Development Session" });

      // Create pending todo
      const todo = TodoService.create(db, session.id, {
        title: "Implement feature X",
        activeForm: "Implementing feature X",
        status: "pending",
      });

      expect(todo.status).toBe("pending");
      expect(todo.position).toBe(0);

      // Transition to in_progress
      const inProgress = TodoService.update(db, todo.id, { status: "in_progress" });
      expect(inProgress.status).toBe("in_progress");

      // Complete the todo
      const completed = TodoService.update(db, todo.id, { status: "completed" });
      expect(completed.status).toBe("completed");
    });

    it("enforces single in_progress constraint", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      // Create first in_progress todo
      const todo1 = TodoService.create(db, session.id, {
        title: "Task 1",
        activeForm: "Task 1",
        status: "in_progress",
      });

      // Create second in_progress todo (should demote first)
      const todo2 = TodoService.create(db, session.id, {
        title: "Task 2",
        activeForm: "Task 2",
        status: "in_progress",
      });

      // Verify only one is in_progress
      const updatedTodo1 = TodoService.getById(db, todo1.id);
      expect(updatedTodo1?.status).toBe("pending");
      expect(todo2.status).toBe("in_progress");

      // Only one in_progress at a time
      const inProgress = TodoService.getInProgress(db, session.id);
      expect(inProgress?.id).toBe(todo2.id);
    });

    it("maintains position order", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      const todo1 = TodoService.create(db, session.id, {
        title: "First",
        activeForm: "First",
      });
      const todo2 = TodoService.create(db, session.id, {
        title: "Second",
        activeForm: "Second",
      });
      const todo3 = TodoService.create(db, session.id, {
        title: "Third",
        activeForm: "Third",
      });

      expect(todo1.position).toBe(0);
      expect(todo2.position).toBe(1);
      expect(todo3.position).toBe(2);

      // Todos should be listed in position order
      const todos = TodoService.listBySession(db, session.id);
      expect(todos[0]!.title).toBe("First");
      expect(todos[1]!.title).toBe("Second");
      expect(todos[2]!.title).toBe("Third");
    });
  });

  describe("batch operations", () => {
    it("replaces all todos atomically", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      // Create initial todos
      TodoService.create(db, session.id, { title: "Old 1", activeForm: "Old 1" });
      TodoService.create(db, session.id, { title: "Old 2", activeForm: "Old 2" });
      TodoService.create(db, session.id, { title: "Old 3", activeForm: "Old 3" });

      // Replace with new list
      const newTodos = TodoService.replaceBatch(db, session.id, [
        { title: "New Task A", activeForm: "Working on A", status: "completed" },
        { title: "New Task B", activeForm: "Working on B", status: "in_progress" },
        { title: "New Task C", activeForm: "Working on C", status: "pending" },
        { title: "New Task D", activeForm: "Working on D", status: "pending" },
      ]);

      expect(newTodos.length).toBe(4);

      // Verify all old todos are gone
      const allTodos = TodoService.listBySession(db, session.id);
      expect(allTodos.length).toBe(4);
      expect(allTodos.every((t) => t.title.startsWith("New Task"))).toBe(true);

      // Verify positions
      expect(allTodos[0]!.position).toBe(0);
      expect(allTodos[1]!.position).toBe(1);
      expect(allTodos[2]!.position).toBe(2);
      expect(allTodos[3]!.position).toBe(3);
    });

    it("rejects batch with multiple in_progress", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      expect(() => {
        TodoService.replaceBatch(db, session.id, [
          { title: "Task 1", activeForm: "Task 1", status: "in_progress" },
          { title: "Task 2", activeForm: "Task 2", status: "in_progress" },
        ]);
      }).toThrow(ValidationError);
    });

    it("clears all completed todos", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      // Create mixed status todos
      TodoService.create(db, session.id, {
        title: "Pending",
        activeForm: "Pending",
        status: "pending",
      });
      const inProgress = TodoService.create(db, session.id, {
        title: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });
      const completed1 = TodoService.create(db, session.id, {
        title: "Done 1",
        activeForm: "Done 1",
        status: "pending",
      });
      TodoService.update(db, completed1.id, { status: "completed" });
      const completed2 = TodoService.create(db, session.id, {
        title: "Done 2",
        activeForm: "Done 2",
        status: "pending",
      });
      TodoService.update(db, completed2.id, { status: "completed" });

      // Clear completed
      const cleared = TodoService.clearCompleted(db, session.id);
      expect(cleared).toBe(2);

      // Only pending and in_progress remain
      const remaining = TodoService.listBySession(db, session.id);
      expect(remaining.length).toBe(2);
      expect(remaining.some((t) => t.status === "completed")).toBe(false);
    });
  });

  describe("session isolation", () => {
    it("isolates todos between sessions", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const session1 = SessionService.create(db, { title: "Session 1" });
      const session2 = SessionService.create(db, { title: "Session 2" });

      // Create todos in each session
      TodoService.create(db, session1.id, {
        title: "Session 1 Task",
        activeForm: "Session 1 Task",
      });
      TodoService.create(db, session2.id, {
        title: "Session 2 Task",
        activeForm: "Session 2 Task",
      });
      TodoService.create(db, session2.id, {
        title: "Session 2 Task 2",
        activeForm: "Session 2 Task 2",
      });

      // Verify isolation
      const session1Todos = TodoService.listBySession(db, session1.id);
      const session2Todos = TodoService.listBySession(db, session2.id);

      expect(session1Todos.length).toBe(1);
      expect(session2Todos.length).toBe(2);

      expect(TodoService.count(db, session1.id)).toBe(1);
      expect(TodoService.count(db, session2.id)).toBe(2);
    });

    it("in_progress is scoped to session", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const session1 = SessionService.create(db, { title: "Session 1" });
      const session2 = SessionService.create(db, { title: "Session 2" });

      // Each session can have its own in_progress
      const todo1 = TodoService.create(db, session1.id, {
        title: "Active in S1",
        activeForm: "Active in S1",
        status: "in_progress",
      });

      const todo2 = TodoService.create(db, session2.id, {
        title: "Active in S2",
        activeForm: "Active in S2",
        status: "in_progress",
      });

      // Both should remain in_progress
      expect(TodoService.getById(db, todo1.id)?.status).toBe("in_progress");
      expect(TodoService.getById(db, todo2.id)?.status).toBe("in_progress");

      expect(TodoService.getInProgress(db, session1.id)?.id).toBe(todo1.id);
      expect(TodoService.getInProgress(db, session2.id)?.id).toBe(todo2.id);
    });
  });

  describe("filtering and counting", () => {
    it("filters by status", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      TodoService.create(db, session.id, {
        title: "Pending 1",
        activeForm: "Pending 1",
        status: "pending",
      });
      TodoService.create(db, session.id, {
        title: "Pending 2",
        activeForm: "Pending 2",
        status: "pending",
      });
      TodoService.create(db, session.id, {
        title: "In Progress",
        activeForm: "In Progress",
        status: "in_progress",
      });
      const completed = TodoService.create(db, session.id, {
        title: "Completed",
        activeForm: "Completed",
        status: "pending",
      });
      TodoService.update(db, completed.id, { status: "completed" });

      expect(TodoService.count(db, session.id, "pending")).toBe(2);
      expect(TodoService.count(db, session.id, "in_progress")).toBe(1);
      expect(TodoService.count(db, session.id, "completed")).toBe(1);

      const pendingTodos = TodoService.listBySession(db, session.id, {
        status: "pending",
      });
      expect(pendingTodos.length).toBe(2);
    });

    it("supports pagination", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      for (let i = 0; i < 10; i++) {
        TodoService.create(db, session.id, {
          title: `Task ${i + 1}`,
          activeForm: `Task ${i + 1}`,
        });
      }

      const page1 = TodoService.listBySession(db, session.id, { limit: 3 });
      expect(page1.length).toBe(3);
      expect(page1[0]!.title).toBe("Task 1");

      const page2 = TodoService.listBySession(db, session.id, { limit: 3, offset: 3 });
      expect(page2.length).toBe(3);
      expect(page2[0]!.title).toBe("Task 4");

      const page4 = TodoService.listBySession(db, session.id, { limit: 3, offset: 9 });
      expect(page4.length).toBe(1);
      expect(page4[0]!.title).toBe("Task 10");
    });
  });

  describe("todo helper methods", () => {
    it("setInProgress demotes existing", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      const todo1 = TodoService.create(db, session.id, {
        title: "First",
        activeForm: "First",
        status: "in_progress",
      });

      const todo2 = TodoService.create(db, session.id, {
        title: "Second",
        activeForm: "Second",
        status: "pending",
      });

      // Set todo2 to in_progress
      TodoService.setInProgress(db, todo2.id);

      expect(TodoService.getById(db, todo1.id)?.status).toBe("pending");
      expect(TodoService.getById(db, todo2.id)?.status).toBe("in_progress");
    });

    it("markCompleted changes status", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Test Session" });

      const todo = TodoService.create(db, session.id, {
        title: "Task",
        activeForm: "Task",
        status: "in_progress",
      });

      const completed = TodoService.markCompleted(db, todo.id);
      expect(completed.status).toBe("completed");
    });
  });

  describe("error handling", () => {
    it("throws NotFoundError for non-existent todo", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      expect(() => {
        TodoService.getByIdOrThrow(db, "task_nonexistent");
      }).toThrow(NotFoundError);

      expect(() => {
        TodoService.update(db, "task_nonexistent", { title: "Updated" });
      }).toThrow(NotFoundError);

      expect(() => {
        TodoService.delete(db, "task_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("typical workflow simulation", () => {
    it("simulates an agent working through tasks", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, { title: "Implementation Session" });

      // Agent receives task and creates todo list
      TodoService.replaceBatch(db, session.id, [
        {
          title: "Analyze requirements",
          activeForm: "Analyzing requirements",
          status: "in_progress",
        },
        {
          title: "Write implementation",
          activeForm: "Writing implementation",
          status: "pending",
        },
        { title: "Add tests", activeForm: "Adding tests", status: "pending" },
        {
          title: "Update documentation",
          activeForm: "Updating documentation",
          status: "pending",
        },
      ]);

      let todos = TodoService.listBySession(db, session.id);
      expect(todos.length).toBe(4);
      expect(TodoService.getInProgress(db, session.id)?.title).toBe(
        "Analyze requirements"
      );

      // Complete first task, start second
      const firstTodo = todos.find((t) => t.title === "Analyze requirements")!;
      TodoService.markCompleted(db, firstTodo.id);

      const secondTodo = todos.find((t) => t.title === "Write implementation")!;
      TodoService.setInProgress(db, secondTodo.id);

      // Check progress
      expect(TodoService.count(db, session.id, "completed")).toBe(1);
      expect(TodoService.count(db, session.id, "in_progress")).toBe(1);
      expect(TodoService.count(db, session.id, "pending")).toBe(2);

      // Complete remaining tasks
      TodoService.markCompleted(db, secondTodo.id);
      const thirdTodo = todos.find((t) => t.title === "Add tests")!;
      TodoService.setInProgress(db, thirdTodo.id);
      TodoService.markCompleted(db, thirdTodo.id);
      const fourthTodo = todos.find((t) => t.title === "Update documentation")!;
      TodoService.setInProgress(db, fourthTodo.id);
      TodoService.markCompleted(db, fourthTodo.id);

      // All done
      expect(TodoService.count(db, session.id, "completed")).toBe(4);
      expect(TodoService.count(db, session.id, "pending")).toBe(0);
      expect(TodoService.getInProgress(db, session.id)).toBeNull();

      // Clean up completed
      const cleared = TodoService.clearCompleted(db, session.id);
      expect(cleared).toBe(4);
      expect(TodoService.count(db, session.id)).toBe(0);
    });
  });
});
