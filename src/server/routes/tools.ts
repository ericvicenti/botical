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
import { ActionRegistry } from "@/actions/index.ts";

const tools = new Hono();

/**
 * GET /api/tools/core
 * List built-in/core tools from the registry (including actions)
 */
tools.get("/core", async (c) => {
  const registeredTools = ToolRegistry.getAll();
  const registeredActions = ActionRegistry.getAll();

  const coreTools = registeredTools.map(tool => ({
    name: tool.definition.name,
    description: tool.definition.description,
    category: tool.category,
    requiresCodeExecution: tool.requiresCodeExecution,
  }));

  // Add actions as tools (actions are always safe - no code execution)
  const actionTools = registeredActions.map(action => ({
    name: action.definition.id.replace(/\./g, "_"),
    description: action.definition.description,
    category: action.definition.category,
    requiresCodeExecution: false,
  }));

  return c.json({
    data: [...coreTools, ...actionTools],
  });
});

/**
 * GET /api/actions
 * List all registered actions with full metadata for command palette
 */
tools.get("/actions", async (c) => {
  const registeredActions = ActionRegistry.getAll();

  const actions = registeredActions.map(action => {
    const def = action.definition;

    // Extract param info from Zod schema (casting to access internal Zod structure)
    // Note: This requires `any` casting to access Zod's internal structure
    const shape = (def.params as any)._def?.shape?.();
    const params: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
      options?: string[];
    }> = [];

    if (shape) {
      for (const [name, fieldSchema] of Object.entries(shape)) {
        // Note: Zod schema introspection requires any casting
        const field = fieldSchema as any;
        const typeName = field._def?.typeName;
        const isOptional = typeName === "ZodOptional" || typeName === "ZodDefault";
        const innerType = isOptional ? field._def?.innerType : field;
        const innerTypeName = innerType?._def?.typeName;

        let type = "string";
        if (innerTypeName === "ZodNumber") type = "number";
        else if (innerTypeName === "ZodBoolean") type = "boolean";
        else if (innerTypeName === "ZodEnum") type = "enum";

        const param: any = {
          name,
          type,
          required: !isOptional,
          description: field._def?.description || field.description,
        };

        if (innerTypeName === "ZodEnum" && innerType._def?.values) {
          param.options = innerType._def.values;
        }

        params.push(param);
      }
    }

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      icon: def.icon,
      params,
    };
  });

  return c.json({ data: actions });
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

/**
 * POST /api/tools/actions/execute
 * Execute a backend action (for command palette)
 */
tools.post("/actions/execute", async (c) => {
  const body = await c.req.json();
  const { actionId, params } = body;

  if (!actionId) {
    throw new ValidationError("actionId is required");
  }

  const action = ActionRegistry.get(actionId);
  if (!action) {
    return c.json({ type: "error", message: `Action "${actionId}" not found` }, 404);
  }

  // Build context
  let projectPath = process.cwd();

  if (params?.projectId) {
    try {
      const { ProjectService } = await import("@/services/projects.ts");
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.getById(rootDb, params.projectId);
      if (project?.path) {
        projectPath = project.path;
      }
    } catch {
      // Project not found, use cwd
    }
  }

  const context = {
    projectPath,
    projectId: params?.projectId,
  };

  const result = await ActionRegistry.execute(actionId, params || {}, context);

  return c.json(result);
});

export { tools };
