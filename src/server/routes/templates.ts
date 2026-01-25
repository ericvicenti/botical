/**
 * Templates API Routes
 *
 * REST API endpoints for managing task templates within a project.
 * Templates are stored as YAML files in .iris/templates/
 *
 * Endpoints:
 * - GET /api/templates - List templates for a project
 * - GET /api/templates/:id - Get template by ID
 * - POST /api/templates - Create template
 * - PUT /api/templates/:id - Update template
 * - DELETE /api/templates/:id - Delete template
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { TemplateService } from "@/services/templates.ts";
import { ProjectService } from "@/services/projects.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";

const templates = new Hono();

/**
 * Get project path from project ID
 */
function getProjectPath(projectId: string): string {
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }
  if (!project.path) {
    throw new ValidationError("Project has no local path");
  }
  return project.path;
}

/**
 * Query parameters for listing templates
 */
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
});

/**
 * GET /api/templates
 * List templates for a project
 */
templates.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { projectId } = result.data;
  const projectPath = getProjectPath(projectId);
  const templateList = await TemplateService.list(projectPath);

  return c.json({
    data: templateList,
  });
});

/**
 * GET /api/templates/:id
 * Get template by ID
 */
templates.get("/:id", async (c) => {
  const templateId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const projectPath = getProjectPath(projectId);
  const template = await TemplateService.get(projectPath, templateId);

  if (!template) {
    throw new NotFoundError("Template", templateId);
  }

  return c.json({ data: template });
});

/**
 * POST /api/templates
 * Create a new template
 */
const CreateTemplateSchema = z.object({
  projectId: z.string().min(1),
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agentClass: z.string().default("medium"),
  tools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
});

templates.post("/", async (c) => {
  const body = await c.req.json();

  const result = CreateTemplateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const { projectId, id: templateId, ...data } = result.data;
  const projectPath = getProjectPath(projectId);

  const template = await TemplateService.create(projectPath, templateId, data);

  return c.json({ data: template }, 201);
});

/**
 * PUT /api/templates/:id
 * Update template
 */
const UpdateTemplateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  agentClass: z.string().optional(),
  tools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
});

templates.put("/:id", async (c) => {
  const templateId = c.req.param("id");
  const body = await c.req.json();

  const result = UpdateTemplateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const { projectId, ...data } = result.data;
  const projectPath = getProjectPath(projectId);

  const template = await TemplateService.update(projectPath, templateId, data);

  return c.json({ data: template });
});

/**
 * DELETE /api/templates/:id
 * Delete template
 */
templates.delete("/:id", async (c) => {
  const templateId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const projectPath = getProjectPath(projectId);
  await TemplateService.delete(projectPath, templateId);

  return c.json({ data: { deleted: true } });
});

export { templates };
