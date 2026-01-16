/**
 * Processes API Routes
 *
 * REST API endpoints for managing shell commands and services with PTY support.
 * Handles process lifecycle, I/O, and output retrieval.
 *
 * Project-scoped endpoints:
 * - POST /api/projects/:projectId/processes - Spawn process
 * - GET /api/projects/:projectId/processes - List processes
 *
 * Process endpoints:
 * - GET /api/processes/:id - Get process details
 * - GET /api/processes/:id/output - Get output history
 * - POST /api/processes/:id/write - Write to stdin
 * - POST /api/processes/:id/resize - Resize PTY
 * - POST /api/processes/:id/kill - Kill process
 * - DELETE /api/processes/:id - Delete process record
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/implementation-plan/11-process-management.md
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import {
  ProcessService,
  SpawnProcessSchema,
  type ProcessType,
  type ProcessStatus,
} from "@/services/processes.ts";
import { ValidationError } from "@/utils/errors.ts";

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

const projectProcesses = new Hono();

/**
 * Query parameters for listing processes
 */
const ListQuerySchema = z.object({
  type: z.enum(["command", "service"]).optional(),
  status: z
    .enum(["starting", "running", "completed", "failed", "killed"])
    .optional(),
  scope: z.enum(["task", "mission", "project"]).optional(),
  scopeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * POST /api/projects/:projectId/processes
 * Spawn a new process
 */
projectProcesses.post("/:projectId/processes", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();

  const input = {
    ...body,
    projectId,
  };

  const result = SpawnProcessSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const projectPath = Config.getProjectDir(projectId);
  const process = ProcessService.spawn(db, result.data, projectPath);

  return c.json({ data: process }, 201);
});

/**
 * GET /api/projects/:projectId/processes
 * List processes for a project
 */
projectProcesses.get("/:projectId/processes", async (c) => {
  const projectId = c.req.param("projectId");

  const rawQuery = {
    type: c.req.query("type"),
    status: c.req.query("status"),
    scope: c.req.query("scope"),
    scopeId: c.req.query("scopeId"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const queryResult = ListQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    throw new ValidationError(
      queryResult.error.errors[0]?.message || "Invalid query parameters",
      queryResult.error.errors
    );
  }

  const query = queryResult.data;
  const db = DatabaseManager.getProjectDb(projectId);
  const processes = ProcessService.listByProject(db, projectId, {
    type: query.type as ProcessType | undefined,
    status: query.status as ProcessStatus | undefined,
    scope: query.scope,
    scopeId: query.scopeId,
    limit: query.limit,
    offset: query.offset,
  });

  const total = ProcessService.count(db, projectId, {
    type: query.type as ProcessType | undefined,
    status: query.status as ProcessStatus | undefined,
  });

  return c.json({
    data: processes,
    meta: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + processes.length < total,
    },
  });
});

// ============================================
// PROCESS ROUTES
// ============================================

const processes = new Hono();

/**
 * Schema for process ID validation
 */
const ProcessIdSchema = z.string().startsWith("proc_");

/**
 * Validate process ID parameter
 */
function validateProcessId(id: string): void {
  if (!ProcessIdSchema.safeParse(id).success) {
    throw new ValidationError("Invalid process ID format");
  }
}

/**
 * Helper to get project DB from process
 */
function getDbForProcess(processId: string): ReturnType<typeof DatabaseManager.getProjectDb> {
  // Process IDs encode the project, but for now we'll need to search
  // This is a limitation - in production we'd want to encode project in the ID or URL
  const projectDbs = DatabaseManager.getOpenProjectIds();
  for (const projectId of projectDbs) {
    const db = DatabaseManager.getProjectDb(projectId);
    const process = ProcessService.getById(db, processId);
    if (process) {
      return db;
    }
  }
  throw new ValidationError("Process not found in any project");
}

/**
 * GET /api/processes/:id
 * Get process details
 */
processes.get("/:id", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const db = getDbForProcess(processId);
  const process = ProcessService.getByIdOrThrow(db, processId);

  return c.json({ data: process });
});

/**
 * GET /api/processes/:id/output
 * Get process output history
 */
processes.get("/:id/output", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");
  const sinceParam = c.req.query("since");

  const options = {
    limit: limitParam ? parseInt(limitParam, 10) : 1000,
    offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    since: sinceParam ? parseInt(sinceParam, 10) : undefined,
  };

  const db = getDbForProcess(processId);
  const output = ProcessService.getOutput(db, processId, options);

  return c.json({
    data: output,
    meta: {
      count: output.length,
    },
  });
});

/**
 * POST /api/processes/:id/write
 * Write to process stdin
 */
processes.post("/:id/write", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const body = await c.req.json();
  const dataSchema = z.object({
    data: z.string(),
  });

  const result = dataSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  const db = getDbForProcess(processId);
  ProcessService.write(db, processId, result.data.data);

  return c.json({ success: true });
});

/**
 * POST /api/processes/:id/resize
 * Resize PTY terminal
 */
processes.post("/:id/resize", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const body = await c.req.json();
  const resizeSchema = z.object({
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  });

  const result = resizeSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  const db = getDbForProcess(processId);
  ProcessService.resize(db, processId, result.data.cols, result.data.rows);

  return c.json({ success: true });
});

/**
 * POST /api/processes/:id/kill
 * Kill a running process
 */
processes.post("/:id/kill", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const db = getDbForProcess(processId);
  ProcessService.kill(db, processId);

  return c.json({ success: true });
});

/**
 * DELETE /api/processes/:id
 * Delete a process record
 */
processes.delete("/:id", async (c) => {
  const processId = c.req.param("id");
  validateProcessId(processId);

  const db = getDbForProcess(processId);
  ProcessService.delete(db, processId);

  return c.json({ success: true });
});

export { projectProcesses, processes };
