/**
 * Agents API Routes
 *
 * REST API endpoints for managing agent configurations.
 * Lists both built-in agents and custom project-specific agents.
 *
 * Endpoints:
 * - GET /api/agents - List all available agents (built-in + custom)
 * - POST /api/agents - Create a custom agent
 * - GET /api/agents/:name - Get agent config by name
 * - PUT /api/agents/:name - Update custom agent
 * - DELETE /api/agents/:name - Delete custom agent
 *
 * See: docs/knowledge-base/02-data-model.md#agent
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  AgentService,
  AgentCreateSchema,
  AgentUpdateSchema,
  toAgentConfig,
} from "@/services/agents.ts";
import { AgentRegistry } from "@/agents/registry.ts";
import { ValidationError, ForbiddenError } from "@/utils/errors.ts";

const agents = new Hono();

/**
 * Query parameters for listing agents
 */
const ListQuerySchema = z.object({
  projectId: z.string().optional(),
  mode: z.enum(["primary", "subagent"]).optional(),
  includeHidden: z.coerce.boolean().default(false),
  builtinOnly: z.coerce.boolean().default(false),
  customOnly: z.coerce.boolean().default(false),
});

/**
 * GET /api/agents
 * List all available agents (built-in + custom)
 */
agents.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    mode: c.req.query("mode"),
    includeHidden: c.req.query("includeHidden"),
    builtinOnly: c.req.query("builtinOnly"),
    customOnly: c.req.query("customOnly"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { projectId, mode, includeHidden, builtinOnly, customOnly } =
    result.data;

  // Get project database if projectId provided (for custom agents)
  const db = projectId ? DatabaseManager.getProjectDb(projectId) : null;

  const agentsList = AgentRegistry.list(db, {
    mode,
    includeHidden,
    builtinOnly,
    customOnly,
  });

  return c.json({
    data: agentsList,
    meta: {
      total: agentsList.length,
      builtinCount: agentsList.filter((a) => a.isBuiltin).length,
      customCount: agentsList.filter((a) => !a.isBuiltin).length,
    },
  });
});

/**
 * POST /api/agents
 * Create a custom agent
 */
agents.post("/", async (c) => {
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Validate the rest of the input
  const result = AgentCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  // Check if name conflicts with built-in agent
  if (AgentRegistry.isReservedName(result.data.name)) {
    throw new ValidationError(
      `Agent name "${result.data.name}" is reserved for built-in agents`
    );
  }

  const agent = AgentService.create(db, result.data);

  return c.json(
    {
      data: toAgentConfig(agent),
    },
    201
  );
});

/**
 * GET /api/agents/:name
 * Get agent config by name
 */
agents.get("/:name", async (c) => {
  const name = c.req.param("name");
  const projectId = c.req.query("projectId");

  // Get project database if provided
  const db = projectId ? DatabaseManager.getProjectDb(projectId) : null;

  const agent = AgentRegistry.get(db, name);
  if (!agent) {
    throw new ValidationError(`Agent "${name}" not found`);
  }

  return c.json({
    data: agent,
  });
});

/**
 * PUT /api/agents/:name
 * Update custom agent
 */
agents.put("/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  // Check if trying to update built-in agent
  if (AgentRegistry.isReservedName(name)) {
    throw new ForbiddenError("Cannot update built-in agents");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get existing agent
  const existing = AgentService.getByName(db, name);
  if (!existing) {
    throw new ValidationError(`Agent "${name}" not found`);
  }

  const result = AgentUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  // If changing name, check if new name conflicts with built-in
  if (result.data.name && AgentRegistry.isReservedName(result.data.name)) {
    throw new ValidationError(
      `Agent name "${result.data.name}" is reserved for built-in agents`
    );
  }

  const agent = AgentService.update(db, existing.id, result.data);

  return c.json({
    data: toAgentConfig(agent),
  });
});

/**
 * DELETE /api/agents/:name
 * Delete custom agent
 */
agents.delete("/:name", async (c) => {
  const name = c.req.param("name");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  // Check if trying to delete built-in agent
  if (AgentRegistry.isReservedName(name)) {
    throw new ForbiddenError("Cannot delete built-in agents");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get existing agent
  const existing = AgentService.getByName(db, name);
  if (!existing) {
    throw new ValidationError(`Agent "${name}" not found`);
  }

  AgentService.delete(db, existing.id);

  return c.json({
    data: { deleted: true },
  });
});

export { agents };
