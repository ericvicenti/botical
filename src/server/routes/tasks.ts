/**
 * Tasks API Routes
 *
 * REST API endpoints for managing task tracking within sessions.
 * Tasks are granular work units that can belong to missions or standalone sessions.
 * Evolved from Todos API with additional features.
 *
 * Session-scoped endpoints (backwards compatible with todos):
 * - GET /api/sessions/:sessionId/todos - List tasks for session
 * - POST /api/sessions/:sessionId/todos - Create task
 * - PUT /api/sessions/:sessionId/todos - Replace all tasks (batch)
 *
 * Project-scoped endpoints:
 * - GET /api/projects/:projectId/tasks - List all tasks in project
 * - POST /api/projects/:projectId/tasks - Create standalone task
 *
 * Individual task endpoints:
 * - GET /api/tasks/:id - Get task by ID
 * - PUT /api/tasks/:id - Update task
 * - POST /api/tasks/:id/start - Start task
 * - POST /api/tasks/:id/complete - Complete task
 * - POST /api/tasks/:id/block - Block task
 * - POST /api/tasks/:id/cancel - Cancel task
 * - DELETE /api/tasks/:id - Delete task
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/implementation-plan/10-missions-and-tasks.md
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  TaskService,
  TaskCreateSchema,
  TaskUpdateSchema,
  TaskBatchSchema,
  type TaskStatus,
} from "@/services/tasks.ts";
import { SessionService } from "@/services/sessions.ts";
import { ValidationError } from "@/utils/errors.ts";

// ============================================
// SESSION-SCOPED ROUTES (backwards compatible with todos)
// ============================================

const sessionTasks = new Hono();

/**
 * Query parameters for listing tasks
 */
const ListQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "blocked", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/sessions/:sessionId/todos
 * List tasks for a session with pagination and filters
 * Backwards compatible endpoint name
 */
sessionTasks.get("/:sessionId/todos", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const rawQuery = {
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { status, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const taskList = TaskService.listBySession(db, sessionId, {
    status: status as TaskStatus | undefined,
    limit,
    offset,
  });

  const total = TaskService.count(db, sessionId, status as TaskStatus | undefined);

  return c.json({
    data: taskList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + taskList.length < total,
    },
  });
});

/**
 * POST /api/sessions/:sessionId/todos
 * Create a new task
 * Backwards compatible endpoint name
 */
sessionTasks.post("/:sessionId/todos", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  // Support both "content" (legacy) and "title" (new)
  const taskInput = {
    ...body,
    title: body.title || body.content,
  };

  const result = TaskCreateSchema.safeParse(taskInput);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const task = TaskService.create(db, sessionId, result.data);

  // Return with "content" alias for backwards compatibility
  return c.json(
    {
      data: {
        ...task,
        content: task.title, // backwards compat alias
      },
    },
    201
  );
});

/**
 * Batch input schema for replacing all tasks
 */
const BatchInputSchema = z.object({
  projectId: z.string().min(1),
  todos: z.array(
    z.object({
      // Support both content (legacy) and title (new)
      content: z.string().min(1).max(2000).optional(),
      title: z.string().min(1).max(2000).optional(),
      activeForm: z.string().min(1).max(2000),
      status: z.enum(["pending", "in_progress", "completed"]),
    }).refine((data) => data.content || data.title, {
      message: "Either content or title is required",
    })
  ),
});

/**
 * PUT /api/sessions/:sessionId/todos
 * Replace all tasks for a session (batch operation)
 * Backwards compatible endpoint name
 */
sessionTasks.put("/:sessionId/todos", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json();

  const result = BatchInputSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const { projectId, todos } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  // Convert to task batch format (support both content and title)
  const taskBatch = todos.map((t) => ({
    title: t.title || t.content!,
    activeForm: t.activeForm,
    status: t.status,
  }));

  const taskList = TaskService.replaceBatch(db, sessionId, taskBatch);

  // Return with "content" alias for backwards compatibility
  return c.json({
    data: taskList.map((t) => ({ ...t, content: t.title })),
    meta: {
      total: taskList.length,
    },
  });
});

/**
 * DELETE /api/sessions/:sessionId/todos/completed
 * Clear completed tasks for a session
 * Backwards compatible endpoint name
 */
sessionTasks.delete("/:sessionId/todos/completed", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const deleted = TaskService.clearCompleted(db, sessionId);

  return c.json({
    data: { cleared: deleted },
  });
});

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

const projectTasks = new Hono();

/**
 * GET /api/projects/:projectId/tasks
 * List all tasks in a project
 */
projectTasks.get("/:projectId/tasks", async (c) => {
  const projectId = c.req.param("projectId");

  const rawQuery = {
    status: c.req.query("status"),
    sessionId: c.req.query("sessionId"),
    missionId: c.req.query("missionId"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const ProjectTaskListSchema = z.object({
    status: z.enum(["pending", "in_progress", "completed", "blocked", "cancelled"]).optional(),
    sessionId: z.string().optional(),
    missionId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  const result = ProjectTaskListSchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { status, sessionId, missionId, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const taskList = TaskService.list(db, {
    status: status as TaskStatus | undefined,
    sessionId,
    missionId,
    limit,
    offset,
  });

  return c.json({
    data: taskList,
    meta: {
      limit,
      offset,
      hasMore: taskList.length === limit,
    },
  });
});

/**
 * POST /api/projects/:projectId/tasks
 * Create a standalone task (requires sessionId in body)
 */
projectTasks.post("/:projectId/tasks", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();

  const sessionId = body.sessionId;
  if (!sessionId) {
    throw new ValidationError("sessionId is required");
  }

  // Support both "content" (legacy) and "title" (new)
  const taskInput = {
    ...body,
    title: body.title || body.content,
  };

  const result = TaskCreateSchema.safeParse(taskInput);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const task = TaskService.create(db, sessionId, result.data);

  return c.json(
    {
      data: task,
    },
    201
  );
});

// ============================================
// INDIVIDUAL TASK ROUTES
// ============================================

const tasks = new Hono();

/**
 * GET /api/tasks/:id
 * Get task by ID
 */
tasks.get("/:id", async (c) => {
  const taskId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.getByIdOrThrow(db, taskId);

  // Return with "content" alias for backwards compatibility
  return c.json({
    data: {
      ...task,
      content: task.title, // backwards compat alias
    },
  });
});

/**
 * PUT /api/tasks/:id
 * Update task
 */
tasks.put("/:id", async (c) => {
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  // Support both "content" (legacy) and "title" (new)
  const taskInput = {
    ...body,
    title: body.title || body.content,
  };

  const result = TaskUpdateSchema.safeParse(taskInput);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.update(db, taskId, result.data);

  // Return with "content" alias for backwards compatibility
  return c.json({
    data: {
      ...task,
      content: task.title, // backwards compat alias
    },
  });
});

/**
 * POST /api/tasks/:id/start
 * Start a task (set to in_progress)
 */
tasks.post("/:id/start", async (c) => {
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.start(db, taskId);

  return c.json({
    data: task,
  });
});

/**
 * POST /api/tasks/:id/complete
 * Complete a task
 */
tasks.post("/:id/complete", async (c) => {
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = body.result;

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.complete(db, taskId, result);

  return c.json({
    data: task,
  });
});

/**
 * POST /api/tasks/:id/block
 * Block a task
 */
tasks.post("/:id/block", async (c) => {
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const reason = body.reason;

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.block(db, taskId, reason);

  return c.json({
    data: task,
  });
});

/**
 * POST /api/tasks/:id/cancel
 * Cancel a task
 */
tasks.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const task = TaskService.cancel(db, taskId);

  return c.json({
    data: task,
  });
});

/**
 * DELETE /api/tasks/:id
 * Delete task (hard delete)
 */
tasks.delete("/:id", async (c) => {
  const taskId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  TaskService.delete(db, taskId);

  return c.json({
    data: { deleted: true },
  });
});

// Legacy aliases - export both old and new names
export { sessionTasks, sessionTasks as sessionTodos };
export { tasks, tasks as todos };
export { projectTasks };
