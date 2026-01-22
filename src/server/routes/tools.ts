/**
 * Tools API Routes
 *
 * REST API endpoints for managing custom tools within a project.
 *
 * Endpoints:
 * - GET /api/tools - List tools
 * - POST /api/tools - Create tool
 * - GET /api/tools/:id - Get tool by ID
 * - PUT /api/tools/:id - Update tool
 * - DELETE /api/tools/:id - Delete tool (soft delete)
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#tools
 * See: docs/knowledge-base/03-api-reference.md#tools-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  ToolService,
  ToolCreateSchema,
  ToolUpdateSchema,
  type ToolType,
} from "@/services/tools.ts";
import { ValidationError } from "@/utils/errors.ts";
import { ToolRegistry } from "@/tools/registry.ts";

const tools = new Hono();

/**
 * GET /api/tools/core
 * List built-in/core tools from the registry
 */
tools.get("/core", async (c) => {
  const registeredTools = ToolRegistry.getAll();

  const coreTools = registeredTools.map(tool => ({
    name: tool.definition.name,
    description: tool.definition.description,
    category: tool.category,
    requiresCodeExecution: tool.requiresCodeExecution,
  }));

  return c.json({
    data: coreTools,
  });
});

/**
 * Query parameters for listing tools
 */
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["code", "mcp", "http"]).optional(),
  enabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/tools
 * List tools for a project with pagination and filters
 */
tools.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    type: c.req.query("type"),
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

  const { projectId, type, enabled, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const toolList = ToolService.list(db, {
    type: type as ToolType | undefined,
    enabled,
    limit,
    offset,
  });

  const total = ToolService.count(db, {
    type: type as ToolType | undefined,
    enabled,
  });

  return c.json({
    data: toolList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + toolList.length < total,
    },
  });
});

/**
 * POST /api/tools
 * Create a new tool
 */
tools.post("/", async (c) => {
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = ToolCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const tool = ToolService.create(db, result.data);

  return c.json(
    {
      data: tool,
    },
    201
  );
});

/**
 * GET /api/tools/:id
 * Get tool by ID
 */
tools.get("/:id", async (c) => {
  const toolId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const tool = ToolService.getByIdOrThrow(db, toolId);

  return c.json({
    data: tool,
  });
});

/**
 * PUT /api/tools/:id
 * Update tool
 */
tools.put("/:id", async (c) => {
  const toolId = c.req.param("id");
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = ToolUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const tool = ToolService.update(db, toolId, result.data);

  return c.json({
    data: tool,
  });
});

/**
 * DELETE /api/tools/:id
 * Soft delete tool (set enabled=0)
 */
tools.delete("/:id", async (c) => {
  const toolId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  ToolService.delete(db, toolId);

  return c.json({
    data: { deleted: true },
  });
});

export { tools };
