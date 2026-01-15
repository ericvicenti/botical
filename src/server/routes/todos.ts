/**
 * Todos API Routes
 *
 * REST API endpoints for managing task tracking within sessions.
 *
 * Session-scoped endpoints:
 * - GET /api/sessions/:sessionId/todos - List todos for session
 * - POST /api/sessions/:sessionId/todos - Create todo
 * - PUT /api/sessions/:sessionId/todos - Replace all todos (batch)
 *
 * Individual todo endpoints:
 * - GET /api/todos/:id - Get todo by ID
 * - PUT /api/todos/:id - Update todo
 * - DELETE /api/todos/:id - Delete todo
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#todos
 * See: docs/knowledge-base/03-api-reference.md#todos-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  TodoService,
  TodoCreateSchema,
  TodoUpdateSchema,
  TodoBatchSchema,
  type TodoStatus,
} from "@/services/todos.ts";
import { SessionService } from "@/services/sessions.ts";
import { ValidationError } from "@/utils/errors.ts";

// ============================================
// SESSION-SCOPED ROUTES
// ============================================

const sessionTodos = new Hono();

/**
 * Query parameters for listing todos
 */
const ListQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/sessions/:sessionId/todos
 * List todos for a session with pagination and filters
 */
sessionTodos.get("/:sessionId/todos", async (c) => {
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

  const todoList = TodoService.listBySession(db, sessionId, {
    status: status as TodoStatus | undefined,
    limit,
    offset,
  });

  const total = TodoService.count(db, sessionId, status as TodoStatus | undefined);

  return c.json({
    data: todoList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + todoList.length < total,
    },
  });
});

/**
 * POST /api/sessions/:sessionId/todos
 * Create a new todo
 */
sessionTodos.post("/:sessionId/todos", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = TodoCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const todo = TodoService.create(db, sessionId, result.data);

  return c.json(
    {
      data: todo,
    },
    201
  );
});

/**
 * Batch input schema for replacing all todos
 */
const BatchInputSchema = z.object({
  projectId: z.string().min(1),
  todos: z.array(TodoBatchSchema),
});

/**
 * PUT /api/sessions/:sessionId/todos
 * Replace all todos for a session (batch operation)
 */
sessionTodos.put("/:sessionId/todos", async (c) => {
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

  const todoList = TodoService.replaceBatch(db, sessionId, todos);

  return c.json({
    data: todoList,
    meta: {
      total: todoList.length,
    },
  });
});

/**
 * DELETE /api/sessions/:sessionId/todos/completed
 * Clear completed todos for a session
 */
sessionTodos.delete("/:sessionId/todos/completed", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const deleted = TodoService.clearCompleted(db, sessionId);

  return c.json({
    data: { cleared: deleted },
  });
});

// ============================================
// INDIVIDUAL TODO ROUTES
// ============================================

const todos = new Hono();

/**
 * GET /api/todos/:id
 * Get todo by ID
 */
todos.get("/:id", async (c) => {
  const todoId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const todo = TodoService.getByIdOrThrow(db, todoId);

  return c.json({
    data: todo,
  });
});

/**
 * PUT /api/todos/:id
 * Update todo
 */
todos.put("/:id", async (c) => {
  const todoId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = TodoUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const todo = TodoService.update(db, todoId, result.data);

  return c.json({
    data: todo,
  });
});

/**
 * DELETE /api/todos/:id
 * Delete todo (hard delete)
 */
todos.delete("/:id", async (c) => {
  const todoId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  TodoService.delete(db, todoId);

  return c.json({
    data: { deleted: true },
  });
});

export { sessionTodos, todos };
