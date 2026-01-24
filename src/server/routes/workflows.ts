/**
 * Workflows API Routes
 *
 * REST API endpoints for managing workflows within a project.
 *
 * Endpoints:
 * - GET /api/workflows - List workflows for a project
 * - POST /api/workflows - Create workflow
 * - GET /api/workflows/:id - Get workflow by ID
 * - PUT /api/workflows/:id - Update workflow
 * - DELETE /api/workflows/:id - Delete workflow
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  WorkflowService,
  WorkflowCreateSchema,
  WorkflowUpdateSchema,
} from "@/services/workflows.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import { ProjectService } from "@/services/projects.ts";

const workflows = new Hono();

/**
 * Query parameters for listing workflows
 */
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/workflows
 * List workflows for a project
 */
workflows.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    category: c.req.query("category"),
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

  const { projectId, category, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const workflowList = WorkflowService.list(db, projectId, {
    category,
    limit,
    offset,
  });

  const total = WorkflowService.count(db, projectId, { category });

  return c.json({
    data: workflowList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + workflowList.length < total,
    },
  });
});

/**
 * POST /api/workflows
 * Create a new workflow
 */
workflows.post("/", async (c) => {
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = WorkflowCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const workflow = WorkflowService.create(db, projectId, result.data);

  return c.json({ data: workflow }, 201);
});

/**
 * GET /api/workflows/:id
 * Get workflow by ID
 *
 * If projectId is provided, looks in that project's database.
 * Otherwise, searches all projects to find the workflow.
 */
workflows.get("/:id", async (c) => {
  const workflowId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (projectId) {
    // Fast path: projectId is known
    const db = DatabaseManager.getProjectDb(projectId);
    const workflow = WorkflowService.getByIdOrThrow(db, workflowId);
    return c.json({ data: workflow });
  }

  // Slow path: search all projects for this workflow
  const rootDb = DatabaseManager.getRootDb();
  const projects = ProjectService.list(rootDb, { limit: 100 });

  for (const project of projects) {
    try {
      const db = DatabaseManager.getProjectDb(project.id);
      const workflow = WorkflowService.getById(db, workflowId);
      if (workflow) {
        return c.json({ data: workflow });
      }
    } catch {
      // Project database might not exist, skip
    }
  }

  throw new NotFoundError("Workflow", workflowId);
});

/**
 * PUT /api/workflows/:id
 * Update workflow
 */
workflows.put("/:id", async (c) => {
  const workflowId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const result = WorkflowUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const workflow = WorkflowService.update(db, workflowId, result.data);

  return c.json({ data: workflow });
});

/**
 * DELETE /api/workflows/:id
 * Delete workflow
 */
workflows.delete("/:id", async (c) => {
  const workflowId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  WorkflowService.delete(db, workflowId);

  return c.json({ data: { deleted: true } });
});

export { workflows };
