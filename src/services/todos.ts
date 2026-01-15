/**
 * Todo Service
 *
 * Manages task tracking for agent sessions within a project database.
 * See: docs/knowledge-base/02-data-model.md#todos
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Todo status enumeration
 */
export type TodoStatus = "pending" | "in_progress" | "completed";

/**
 * Todo entity
 */
export interface Todo {
  id: string;
  sessionId: string;
  content: string;
  activeForm: string;
  status: TodoStatus;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Database row type
 */
interface TodoRow {
  id: string;
  session_id: string;
  content: string;
  active_form: string;
  status: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/**
 * Todo creation input schema
 */
export const TodoCreateSchema = z.object({
  content: z.string().min(1).max(2000),
  activeForm: z.string().min(1).max(2000),
  status: z.enum(["pending", "in_progress"]).optional().default("pending"),
});

export type TodoCreateInput = z.input<typeof TodoCreateSchema>;

/**
 * Todo update input schema
 */
export const TodoUpdateSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  activeForm: z.string().min(1).max(2000).optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  position: z.number().int().min(0).optional(),
});

export type TodoUpdateInput = z.infer<typeof TodoUpdateSchema>;

/**
 * Batch todo input schema (for replaceBatch)
 */
export const TodoBatchSchema = z.object({
  content: z.string().min(1).max(2000),
  activeForm: z.string().min(1).max(2000),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export type TodoBatchInput = z.infer<typeof TodoBatchSchema>;

/**
 * Todo list options
 */
export interface TodoListOptions {
  status?: TodoStatus;
  limit?: number;
  offset?: number;
}

/**
 * Convert database row to todo entity
 */
function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    activeForm: row.active_form,
    status: row.status as TodoStatus,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Todo Service for managing task tracking
 */
export class TodoService {
  /**
   * Create a new todo
   */
  static create(db: Database, sessionId: string, input: TodoCreateInput): Todo {
    const validated = TodoCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.todo, { descending: true });

    // Get next position for this session
    const maxPosition = db
      .prepare("SELECT MAX(position) as max_pos FROM todos WHERE session_id = ?")
      .get(sessionId) as { max_pos: number | null };

    const position = (maxPosition?.max_pos ?? -1) + 1;

    // If setting to in_progress, ensure no other todo is in_progress
    if (validated.status === "in_progress") {
      db.prepare(
        "UPDATE todos SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress'"
      ).run(now, sessionId);
    }

    db.prepare(
      `
      INSERT INTO todos (
        id, session_id, content, active_form, status, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      sessionId,
      validated.content,
      validated.activeForm,
      validated.status,
      position,
      now,
      now
    );

    return {
      id,
      sessionId,
      content: validated.content,
      activeForm: validated.activeForm,
      status: validated.status,
      position,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get a todo by ID
   */
  static getById(db: Database, todoId: string): Todo | null {
    const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(todoId) as TodoRow | undefined;

    if (!row) return null;
    return rowToTodo(row);
  }

  /**
   * Get a todo by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, todoId: string): Todo {
    const todo = this.getById(db, todoId);
    if (!todo) {
      throw new NotFoundError("Todo", todoId);
    }
    return todo;
  }

  /**
   * List todos for a session
   */
  static listBySession(
    db: Database,
    sessionId: string,
    options: TodoListOptions = {}
  ): Todo[] {
    let query = "SELECT * FROM todos WHERE session_id = ?";
    const params: (string | number)[] = [sessionId];

    if (options.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    query += " ORDER BY position ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as TodoRow[];
    return rows.map(rowToTodo);
  }

  /**
   * Update a todo
   */
  static update(db: Database, todoId: string, input: TodoUpdateInput): Todo {
    const todo = this.getByIdOrThrow(db, todoId);
    const validated = TodoUpdateSchema.parse(input);
    const now = Date.now();

    // If setting to in_progress, ensure no other todo is in_progress in the same session
    if (validated.status === "in_progress" && todo.status !== "in_progress") {
      db.prepare(
        "UPDATE todos SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress' AND id != ?"
      ).run(now, todo.sessionId, todoId);
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number)[] = [now];

    if (validated.content !== undefined) {
      updates.push("content = ?");
      params.push(validated.content);
    }

    if (validated.activeForm !== undefined) {
      updates.push("active_form = ?");
      params.push(validated.activeForm);
    }

    if (validated.status !== undefined) {
      updates.push("status = ?");
      params.push(validated.status);
    }

    if (validated.position !== undefined) {
      updates.push("position = ?");
      params.push(validated.position);
    }

    params.push(todoId);

    db.prepare(`UPDATE todos SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, todoId);
  }

  /**
   * Delete a todo (hard delete)
   */
  static delete(db: Database, todoId: string): void {
    this.getByIdOrThrow(db, todoId);

    db.prepare("DELETE FROM todos WHERE id = ?").run(todoId);
  }

  /**
   * Count todos for a session
   */
  static count(db: Database, sessionId: string, status?: TodoStatus): number {
    let query = "SELECT COUNT(*) as count FROM todos WHERE session_id = ?";
    const params: (string | number)[] = [sessionId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Replace all todos for a session (batch operation)
   * Used by TodoWrite tool to sync the entire todo list
   */
  static replaceBatch(db: Database, sessionId: string, todos: TodoBatchInput[]): Todo[] {
    const now = Date.now();

    // Validate all inputs first
    const validatedTodos = todos.map((todo) => TodoBatchSchema.parse(todo));

    // Check that at most one todo is in_progress
    const inProgressCount = validatedTodos.filter((t) => t.status === "in_progress").length;
    if (inProgressCount > 1) {
      throw new ValidationError("Only one todo can be in_progress at a time");
    }

    // Delete all existing todos for this session
    db.prepare("DELETE FROM todos WHERE session_id = ?").run(sessionId);

    // Insert new todos
    const insertStmt = db.prepare(
      `
      INSERT INTO todos (
        id, session_id, content, active_form, status, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    const result: Todo[] = [];

    for (let i = 0; i < validatedTodos.length; i++) {
      const todo = validatedTodos[i]!;
      const id = generateId(IdPrefixes.todo, { descending: true });

      insertStmt.run(id, sessionId, todo.content, todo.activeForm, todo.status, i, now, now);

      result.push({
        id,
        sessionId,
        content: todo.content,
        activeForm: todo.activeForm,
        status: todo.status,
        position: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    return result;
  }

  /**
   * Clear completed todos for a session
   */
  static clearCompleted(db: Database, sessionId: string): number {
    const result = db
      .prepare("DELETE FROM todos WHERE session_id = ? AND status = 'completed'")
      .run(sessionId);

    return result.changes;
  }

  /**
   * Get the currently in-progress todo for a session
   */
  static getInProgress(db: Database, sessionId: string): Todo | null {
    const row = db
      .prepare("SELECT * FROM todos WHERE session_id = ? AND status = 'in_progress'")
      .get(sessionId) as TodoRow | undefined;

    if (!row) return null;
    return rowToTodo(row);
  }

  /**
   * Set a todo to in_progress and demote any current in_progress todo
   */
  static setInProgress(db: Database, todoId: string): Todo {
    const todo = this.getByIdOrThrow(db, todoId);
    const now = Date.now();

    // Demote any current in_progress todo
    db.prepare(
      "UPDATE todos SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress'"
    ).run(now, todo.sessionId);

    // Set this todo to in_progress
    db.prepare("UPDATE todos SET status = 'in_progress', updated_at = ? WHERE id = ?").run(
      now,
      todoId
    );

    return this.getByIdOrThrow(db, todoId);
  }

  /**
   * Mark a todo as completed
   */
  static markCompleted(db: Database, todoId: string): Todo {
    const now = Date.now();

    db.prepare("UPDATE todos SET status = 'completed', updated_at = ? WHERE id = ?").run(
      now,
      todoId
    );

    return this.getByIdOrThrow(db, todoId);
  }
}
