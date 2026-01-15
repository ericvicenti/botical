/**
 * Sessions API Routes
 *
 * REST API endpoints for managing conversation sessions.
 * Sessions store conversation history, agent context, and cost tracking.
 *
 * Endpoints:
 * - GET /api/sessions - List sessions with pagination and filters
 * - POST /api/sessions - Create a new session
 * - GET /api/sessions/:id - Get session by ID
 * - PUT /api/sessions/:id - Update session
 * - DELETE /api/sessions/:id - Delete session (soft delete)
 * - GET /api/sessions/:id/messages - List messages in session
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#session
 * See: docs/knowledge-base/03-api-reference.md#sessions-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  SessionService,
  SessionCreateSchema,
  SessionUpdateSchema,
} from "@/services/sessions.ts";
import { MessageService } from "@/services/messages.ts";
import { ValidationError } from "@/utils/errors.ts";
import type { SessionStatus } from "@/agents/types.ts";

const sessions = new Hono();

/**
 * Query parameters for listing sessions
 */
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  agent: z.string().optional(),
  parentId: z.string().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/sessions
 * List sessions with pagination and filters
 */
sessions.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    status: c.req.query("status"),
    agent: c.req.query("agent"),
    parentId: c.req.query("parentId"),
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

  const { projectId, status, agent, parentId, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const sessions = SessionService.list(db, {
    status: status as SessionStatus | undefined,
    agent,
    parentId: parentId === "null" ? null : parentId,
    limit,
    offset,
  });

  const total = SessionService.count(db, status as SessionStatus | undefined);

  return c.json({
    data: sessions,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + sessions.length < total,
    },
  });
});

/**
 * POST /api/sessions
 * Create a new session
 */
sessions.post("/", async (c) => {
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Validate the rest of the input
  const result = SessionCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const session = SessionService.create(db, result.data);

  return c.json(
    {
      data: session,
    },
    201
  );
});

/**
 * GET /api/sessions/:id
 * Get session by ID
 */
sessions.get("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const session = SessionService.getByIdOrThrow(db, sessionId);

  return c.json({
    data: session,
  });
});

/**
 * PUT /api/sessions/:id
 * Update session
 */
sessions.put("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  const result = SessionUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const session = SessionService.update(db, sessionId, result.data);

  return c.json({
    data: session,
  });
});

/**
 * DELETE /api/sessions/:id
 * Delete session (soft delete)
 */
sessions.delete("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  SessionService.delete(db, sessionId);

  return c.json({
    data: { deleted: true },
  });
});

/**
 * GET /api/sessions/:id/messages
 * List messages in session
 */
sessions.get("/:id/messages", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const rawQuery = {
    role: c.req.query("role"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const QuerySchema = z.object({
    role: z.enum(["user", "assistant", "system"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  const result = QuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { role, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const messages = MessageService.listBySession(db, sessionId, {
    role: role as "user" | "assistant" | "system" | undefined,
    limit,
    offset,
  });

  const total = MessageService.countBySession(db, sessionId);

  return c.json({
    data: messages,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + messages.length < total,
    },
  });
});

export { sessions };
