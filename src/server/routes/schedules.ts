/**
 * Schedules API Routes
 *
 * REST API endpoints for managing scheduled tasks within a project.
 *
 * Endpoints:
 * - GET /api/projects/:projectId/schedules - List schedules for a project
 * - POST /api/projects/:projectId/schedules - Create schedule
 * - GET /api/schedules/:id - Get schedule by ID
 * - PUT /api/schedules/:id - Update schedule
 * - DELETE /api/schedules/:id - Delete schedule
 * - POST /api/schedules/:id/enable - Enable schedule
 * - POST /api/schedules/:id/disable - Disable schedule
 * - POST /api/schedules/:id/run - Trigger immediate run
 * - GET /api/schedules/:id/runs - List run history
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  ScheduleService,
  ScheduleCreateSchema,
  ScheduleUpdateSchema,
} from "@/services/schedules.ts";
import { Scheduler } from "@/services/scheduler.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import type { AuthContext } from "@/auth/index.ts";

const projectSchedules = new Hono<{ Variables: AuthContext }>();
const schedules = new Hono<{ Variables: AuthContext }>();

/**
 * Query parameters for listing schedules
 */
const ListQuerySchema = z.object({
  enabled: z.enum(["true", "false"]).optional().transform((v) => v === "true" ? true : v === "false" ? false : undefined),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Query parameters for listing runs
 */
const RunsQuerySchema = z.object({
  status: z.enum(["pending", "running", "success", "failed", "timeout"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

/**
 * GET /api/projects/:projectId/schedules
 * List schedules for a project
 */
projectSchedules.get("/:projectId/schedules", async (c) => {
  const projectId = c.req.param("projectId");

  const rawQuery = {
    enabled: c.req.query("enabled"),
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

  const { enabled, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);
  const scheduleList = ScheduleService.list(db, projectId, { enabled, limit, offset });
  const total = ScheduleService.count(db, projectId, { enabled });

  return c.json({
    data: scheduleList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + scheduleList.length < total,
    },
  });
});

/**
 * POST /api/projects/:projectId/schedules
 * Create a new schedule
 */
projectSchedules.post("/:projectId/schedules", async (c) => {
  const projectId = c.req.param("projectId");
  const auth = c.get("auth");
  const userId = auth.userId;
  const body = await c.req.json();

  const result = ScheduleCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const schedule = ScheduleService.create(db, projectId, userId, result.data);

  return c.json({ data: schedule }, 201);
});

// ============================================
// INDIVIDUAL SCHEDULE ROUTES
// ============================================

/**
 * GET /api/schedules/:id
 * Get schedule by ID
 */
schedules.get("/:id", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const schedule = ScheduleService.getByIdOrThrow(db, scheduleId);

  return c.json({ data: schedule });
});

/**
 * PUT /api/schedules/:id
 * Update schedule
 */
schedules.put("/:id", async (c) => {
  const scheduleId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = ScheduleUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const schedule = ScheduleService.update(db, scheduleId, result.data);

  return c.json({ data: schedule });
});

/**
 * DELETE /api/schedules/:id
 * Delete schedule
 */
schedules.delete("/:id", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  ScheduleService.delete(db, scheduleId);

  return c.json({ data: { deleted: true } });
});

/**
 * POST /api/schedules/:id/enable
 * Enable schedule
 */
schedules.post("/:id/enable", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const schedule = ScheduleService.enable(db, scheduleId);

  return c.json({ data: schedule });
});

/**
 * POST /api/schedules/:id/disable
 * Disable schedule
 */
schedules.post("/:id/disable", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const schedule = ScheduleService.disable(db, scheduleId);

  return c.json({ data: schedule });
});

/**
 * POST /api/schedules/:id/run
 * Trigger immediate run
 */
schedules.post("/:id/run", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const { runId } = await Scheduler.triggerNow(projectId, scheduleId);

  return c.json({
    data: {
      triggered: true,
      runId,
    },
  });
});

/**
 * GET /api/schedules/:id/runs
 * List run history
 */
schedules.get("/:id/runs", async (c) => {
  const scheduleId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const rawQuery = {
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = RunsQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { status, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);
  const runs = ScheduleService.listRuns(db, scheduleId, { status, limit, offset });

  return c.json({
    data: runs,
    meta: {
      limit,
      offset,
      hasMore: runs.length === limit,
    },
  });
});

/**
 * POST /api/schedules/validate-cron
 * Validate a cron expression
 */
schedules.post("/validate-cron", async (c) => {
  const { expression } = await c.req.json();

  if (!expression || typeof expression !== "string") {
    throw new ValidationError("expression is required");
  }

  const result = ScheduleService.validateCronExpression(expression);

  return c.json({
    data: {
      valid: result.valid,
      error: result.error,
      nextRun: result.valid ? ScheduleService.calculateNextRun(expression, "UTC") : null,
    },
  });
});

export { projectSchedules, schedules };
