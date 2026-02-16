/**
 * Task Service
 *
 * Manages task tracking for agent sessions and missions within a project database.
 * Tasks are granular work units that can belong to missions or standalone sessions.
 * Evolved from TodoService with additional features for mission support.
 *
 * See: docs/implementation-plan/10-missions-and-tasks.md
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Task status enumeration
 */
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

/**
 * Task creator/assignee type
 */
export type TaskActor = "agent" | "user";

/**
 * Type guard for TaskActor
 */
function isTaskActor(value: string | null): value is TaskActor {
  return value === "agent" || value === "user";
}

/**
 * Task entity
 */
export interface Task {
  id: string;
  sessionId: string;
  missionId: string | null;
  title: string;
  activeForm: string;
  status: TaskStatus;
  position: number;
  createdBy: TaskActor;
  assignedTo: TaskActor;
  parentTaskId: string | null;
  description: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

/**
 * Database row type
 */
interface TaskRow {
  id: string;
  session_id: string;
  mission_id: string | null;
  title: string;
  active_form: string;
  status: string;
  position: number;
  created_by: string | null;
  assigned_to: string | null;
  parent_task_id: string | null;
  description: string | null;
  result: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
}

/**
 * Task creation input schema
 */
export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(2000),
  activeForm: z.string().min(1).max(2000),
  status: z.enum(["pending", "in_progress"]).optional().default("pending"),
  missionId: z.string().nullable().optional(),
  createdBy: z.enum(["agent", "user"]).optional().default("agent"),
  assignedTo: z.enum(["agent", "user"]).optional().default("agent"),
  parentTaskId: z.string().nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
});

export type TaskCreateInput = z.input<typeof TaskCreateSchema>;

/**
 * Task update input schema
 */
export const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  activeForm: z.string().min(1).max(2000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "blocked", "cancelled"]).optional(),
  position: z.number().int().min(0).optional(),
  assignedTo: z.enum(["agent", "user"]).optional(),
  description: z.string().max(10000).nullable().optional(),
  result: z.string().max(10000).nullable().optional(),
});

export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

/**
 * Batch task input schema (for replaceBatch - backwards compat)
 */
export const TaskBatchSchema = z.object({
  title: z.string().min(1).max(2000),
  activeForm: z.string().min(1).max(2000),
  status: z.enum(["pending", "in_progress", "completed"]),
});

// Alias for backwards compatibility
export const TodoBatchSchema = TaskBatchSchema;

export type TaskBatchInput = z.infer<typeof TaskBatchSchema>;

/**
 * Task list options
 */
export interface TaskListOptions {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

/**
 * Task filter options for advanced queries
 */
export interface TaskFilters extends TaskListOptions {
  sessionId?: string;
  missionId?: string;
  createdBy?: TaskActor;
  assignedTo?: TaskActor;
}

/**
 * Convert database row to task entity
 */
function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    sessionId: row.session_id,
    missionId: row.mission_id,
    title: row.title,
    activeForm: row.active_form,
    status: row.status as TaskStatus, // Safe: database enum constraint
    position: row.position,
    createdBy: isTaskActor(row.created_by) ? row.created_by : "agent",
    assignedTo: isTaskActor(row.assigned_to) ? row.assigned_to : "agent",
    parentTaskId: row.parent_task_id,
    description: row.description,
    result: row.result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Task Service for managing task tracking
 */
export class TaskService {
  /**
   * Create a new task
   */
  static create(db: Database, sessionId: string, input: TaskCreateInput): Task {
    const validated = TaskCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.task, { descending: true });

    // Get next position for this session
    const maxPosition = db
      .prepare("SELECT MAX(position) as max_pos FROM tasks WHERE session_id = ?")
      .get(sessionId) as { max_pos: number | null };

    const position = (maxPosition?.max_pos ?? -1) + 1;

    // If setting to in_progress, ensure no other task is in_progress in the same session
    if (validated.status === "in_progress") {
      db.prepare(
        "UPDATE tasks SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress'"
      ).run(now, sessionId);
    }

    const startedAt = validated.status === "in_progress" ? now : null;

    db.prepare(
      `
      INSERT INTO tasks (
        id, session_id, mission_id, title, active_form, status, position,
        created_by, assigned_to, parent_task_id, description,
        created_at, updated_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      sessionId,
      validated.missionId ?? null,
      validated.title,
      validated.activeForm,
      validated.status,
      position,
      validated.createdBy,
      validated.assignedTo,
      validated.parentTaskId ?? null,
      validated.description ?? null,
      now,
      now,
      startedAt
    );

    return {
      id,
      sessionId,
      missionId: validated.missionId ?? null,
      title: validated.title,
      activeForm: validated.activeForm,
      status: validated.status,
      position,
      createdBy: validated.createdBy,
      assignedTo: validated.assignedTo,
      parentTaskId: validated.parentTaskId ?? null,
      description: validated.description ?? null,
      result: null,
      createdAt: now,
      updatedAt: now,
      startedAt,
      completedAt: null,
    };
  }

  /**
   * Get a task by ID
   */
  static getById(db: Database, taskId: string): Task | null {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskRow | undefined;

    if (!row) return null;
    return rowToTask(row);
  }

  /**
   * Get a task by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, taskId: string): Task {
    const task = this.getById(db, taskId);
    if (!task) {
      throw new NotFoundError("Task", taskId);
    }
    return task;
  }

  /**
   * List tasks for a session (backwards compatible with TodoService)
   */
  static listBySession(
    db: Database,
    sessionId: string,
    options: TaskListOptions = {}
  ): Task[] {
    let query = "SELECT * FROM tasks WHERE session_id = ?";
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

    const rows = db.prepare(query).all(...params) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * List tasks for a mission
   */
  static listByMission(
    db: Database,
    missionId: string,
    options: TaskListOptions = {}
  ): Task[] {
    let query = "SELECT * FROM tasks WHERE mission_id = ?";
    const params: (string | number)[] = [missionId];

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

    const rows = db.prepare(query).all(...params) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * List tasks with advanced filters
   */
  static list(db: Database, filters: TaskFilters = {}): Task[] {
    let query = "SELECT * FROM tasks WHERE 1=1";
    const params: (string | number)[] = [];

    if (filters.sessionId) {
      query += " AND session_id = ?";
      params.push(filters.sessionId);
    }

    if (filters.missionId) {
      query += " AND mission_id = ?";
      params.push(filters.missionId);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    if (filters.createdBy) {
      query += " AND created_by = ?";
      params.push(filters.createdBy);
    }

    if (filters.assignedTo) {
      query += " AND assigned_to = ?";
      params.push(filters.assignedTo);
    }

    query += " ORDER BY position ASC";

    if (filters.limit) {
      query += " LIMIT ?";
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += " OFFSET ?";
      params.push(filters.offset);
    }

    const rows = db.prepare(query).all(...params) as TaskRow[];
    return rows.map(rowToTask);
  }

  /**
   * Update a task
   */
  static update(db: Database, taskId: string, input: TaskUpdateInput): Task {
    const task = this.getByIdOrThrow(db, taskId);
    const validated = TaskUpdateSchema.parse(input);
    const now = Date.now();

    // If setting to in_progress, ensure no other task is in_progress in the same session
    if (validated.status === "in_progress" && task.status !== "in_progress") {
      db.prepare(
        "UPDATE tasks SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress' AND id != ?"
      ).run(now, task.sessionId, taskId);
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (validated.title !== undefined) {
      updates.push("title = ?");
      params.push(validated.title);
    }

    if (validated.activeForm !== undefined) {
      updates.push("active_form = ?");
      params.push(validated.activeForm);
    }

    if (validated.status !== undefined) {
      updates.push("status = ?");
      params.push(validated.status);

      // Track started_at
      if (validated.status === "in_progress" && !task.startedAt) {
        updates.push("started_at = ?");
        params.push(now);
      }

      // Track completed_at
      if (
        (validated.status === "completed" || validated.status === "cancelled") &&
        !task.completedAt
      ) {
        updates.push("completed_at = ?");
        params.push(now);
      }
    }

    if (validated.position !== undefined) {
      updates.push("position = ?");
      params.push(validated.position);
    }

    if (validated.assignedTo !== undefined) {
      updates.push("assigned_to = ?");
      params.push(validated.assignedTo);
    }

    if (validated.description !== undefined) {
      updates.push("description = ?");
      params.push(validated.description);
    }

    if (validated.result !== undefined) {
      updates.push("result = ?");
      params.push(validated.result);
    }

    params.push(taskId);

    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, taskId);
  }

  /**
   * Delete a task (hard delete)
   */
  static delete(db: Database, taskId: string): void {
    this.getByIdOrThrow(db, taskId);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
  }

  /**
   * Count tasks for a session
   */
  static count(db: Database, sessionId: string, status?: TaskStatus): number {
    let query = "SELECT COUNT(*) as count FROM tasks WHERE session_id = ?";
    const params: (string | number)[] = [sessionId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Count tasks for a mission
   */
  static countByMission(db: Database, missionId: string, status?: TaskStatus): number {
    let query = "SELECT COUNT(*) as count FROM tasks WHERE mission_id = ?";
    const params: (string | number)[] = [missionId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Replace all tasks for a session (batch operation)
   * Used by TodoWrite tool to sync the entire task list
   * Backwards compatible with TodoService.replaceBatch
   */
  static replaceBatch(db: Database, sessionId: string, tasks: TaskBatchInput[]): Task[] {
    const now = Date.now();

    // Validate all inputs first
    const validatedTasks = tasks.map((task) => TaskBatchSchema.parse(task));

    // Check that at most one task is in_progress
    const inProgressCount = validatedTasks.filter((t) => t.status === "in_progress").length;
    if (inProgressCount > 1) {
      throw new ValidationError("Only one task can be in_progress at a time");
    }

    // Delete all existing tasks for this session (but not mission-specific tasks)
    db.prepare("DELETE FROM tasks WHERE session_id = ? AND mission_id IS NULL").run(sessionId);

    // Insert new tasks
    const insertStmt = db.prepare(
      `
      INSERT INTO tasks (
        id, session_id, title, active_form, status, position,
        created_by, assigned_to, created_at, updated_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    const result: Task[] = [];

    for (let i = 0; i < validatedTasks.length; i++) {
      const task = validatedTasks[i]!;
      const id = generateId(IdPrefixes.task, { descending: true });
      const startedAt = task.status === "in_progress" ? now : null;

      insertStmt.run(
        id,
        sessionId,
        task.title,
        task.activeForm,
        task.status,
        i,
        "agent",
        "agent",
        now,
        now,
        startedAt
      );

      result.push({
        id,
        sessionId,
        missionId: null,
        title: task.title,
        activeForm: task.activeForm,
        status: task.status,
        position: i,
        createdBy: "agent",
        assignedTo: "agent",
        parentTaskId: null,
        description: null,
        result: null,
        createdAt: now,
        updatedAt: now,
        startedAt,
        completedAt: null,
      });
    }

    return result;
  }

  /**
   * Clear completed tasks for a session
   * Backwards compatible with TodoService.clearCompleted
   */
  static clearCompleted(db: Database, sessionId: string): number {
    const result = db
      .prepare("DELETE FROM tasks WHERE session_id = ? AND status = 'completed'")
      .run(sessionId);

    return result.changes;
  }

  /**
   * Get the currently in-progress task for a session
   * Backwards compatible with TodoService.getInProgress
   */
  static getInProgress(db: Database, sessionId: string): Task | null {
    const row = db
      .prepare("SELECT * FROM tasks WHERE session_id = ? AND status = 'in_progress'")
      .get(sessionId) as TaskRow | undefined;

    if (!row) return null;
    return rowToTask(row);
  }

  /**
   * Set a task to in_progress and demote any current in_progress task
   * Backwards compatible with TodoService.setInProgress
   */
  static setInProgress(db: Database, taskId: string): Task {
    const task = this.getByIdOrThrow(db, taskId);
    const now = Date.now();

    // Demote any current in_progress task
    db.prepare(
      "UPDATE tasks SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'in_progress'"
    ).run(now, task.sessionId);

    // Set this task to in_progress
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', updated_at = ?, started_at = COALESCE(started_at, ?) WHERE id = ?"
    ).run(now, now, taskId);

    return this.getByIdOrThrow(db, taskId);
  }

  /**
   * Mark a task as completed
   * Backwards compatible with TodoService.markCompleted
   */
  static markCompleted(db: Database, taskId: string, result?: string): Task {
    const now = Date.now();

    const updates = ["status = 'completed'", "updated_at = ?", "completed_at = ?"];
    const params: (string | number | null)[] = [now, now];

    if (result !== undefined) {
      updates.push("result = ?");
      params.push(result);
    }

    params.push(taskId);

    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, taskId);
  }

  /**
   * Start a task (set to in_progress)
   */
  static start(db: Database, taskId: string): Task {
    return this.setInProgress(db, taskId);
  }

  /**
   * Complete a task with optional result
   */
  static complete(db: Database, taskId: string, result?: string): Task {
    return this.markCompleted(db, taskId, result);
  }

  /**
   * Block a task with optional reason
   */
  static block(db: Database, taskId: string, reason?: string): Task {
    const now = Date.now();

    db.prepare(
      `
      UPDATE tasks SET
        status = 'blocked',
        updated_at = ?,
        result = COALESCE(?, result)
      WHERE id = ?
    `
    ).run(now, reason ?? null, taskId);

    return this.getByIdOrThrow(db, taskId);
  }

  /**
   * Cancel a task
   */
  static cancel(db: Database, taskId: string): Task {
    const now = Date.now();

    db.prepare(
      `
      UPDATE tasks SET
        status = 'cancelled',
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `
    ).run(now, now, taskId);

    return this.getByIdOrThrow(db, taskId);
  }
}

// Backwards compatibility aliases
export { TaskService as TodoService };
export type { Task as Todo };
export type { TaskCreateInput as TodoCreateInput };
export type { TaskUpdateInput as TodoUpdateInput };
export type { TaskBatchInput as TodoBatchInput };
export type { TaskListOptions as TodoListOptions };
export type { TaskStatus as TodoStatus };

// Re-export schemas with aliases
export const TodoCreateSchema = TaskCreateSchema;
export const TodoUpdateSchema = TaskUpdateSchema;
