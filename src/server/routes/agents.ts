/**
 * Agents API Routes
 *
 * REST API endpoints for managing agent configurations.
 * Lists both built-in agents and custom project-specific agents.
 * Custom agents can come from YAML files (.botical/agents/) or SQLite database.
 *
 * Endpoints:
 * - GET /api/agents - List all available agents (built-in + custom)
 * - POST /api/agents - Create a custom agent
 * - GET /api/agents/:name - Get agent config by name
 * - PUT /api/agents/:name - Update custom agent
 * - DELETE /api/agents/:name - Delete custom agent
 *
 * Built-in agents (default, explore, plan) cannot be modified or deleted.
 * Custom agents are stored per-project in the project database or YAML files.
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#agent
 * See: docs/knowledge-base/03-api-reference.md#agents-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  AgentCreateSchema,
  AgentUpdateSchema,
  toAgentConfig,
} from "@/services/agents.ts";
import { UnifiedAgentService } from "@/services/agents-unified.ts";
import { AgentRegistry } from "@/agents/registry.ts";
import { getAllBuiltinAgents } from "@/agents/builtin/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { ValidationError, ForbiddenError, NotFoundError } from "@/utils/errors.ts";
import { validateProviderCredentials } from "@/utils/provider-validation.ts";
import type { ProviderId } from "@/agents/types.ts";
import { ProviderIds } from "@/agents/types.ts";

const agents = new Hono();

/**
 * Get project path from project ID
 */
function getProjectPath(projectId: string): string | null {
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }
  return project.path;
}

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

  // Get project database and path if projectId provided (for custom agents)
  const db = projectId ? DatabaseManager.getProjectDb(projectId) : null;
  const projectPath = projectId ? getProjectPath(projectId) : null;

  // Build agents list from built-in + unified sources (YAML + DB)
  let agentsList: ReturnType<typeof AgentRegistry.list>;

  if (projectPath && db) {
    // Use UnifiedAgentService to get custom agents from both YAML and DB
    const builtins = customOnly ? [] : getAllBuiltinAgents().filter((a) => {
      if (mode && a.mode !== mode && a.mode !== "all") return false;
      if (!includeHidden && a.hidden) return false;
      return true;
    });

    const custom = builtinOnly ? [] : UnifiedAgentService.list(db, projectPath, {
      mode,
      includeHidden,
    }).map((a) => toAgentConfig(a));

    agentsList = [...builtins, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Fallback to registry (no project context)
    agentsList = AgentRegistry.list(db, {
      mode,
      includeHidden,
      builtinOnly,
      customOnly,
    });
  }

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
 *
 * Set saveToYaml=true in body to save as YAML file (recommended)
 */
agents.post("/", async (c) => {
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const projectPath = getProjectPath(projectId);

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

  if (!projectPath) {
    throw new ValidationError("Project has no path configured");
  }

  // Validate provider credentials if specified
  const auth = c.get("auth") as { userId: string } | undefined;
  const userId = auth?.userId || "anonymous";
  
  if (result.data.providerId) {
    // Validate that the providerId is actually a valid ProviderId
    const validProviderIds = Object.values(ProviderIds);
    if (!validProviderIds.includes(result.data.providerId as any)) {
      throw new ValidationError(`Invalid provider ID: ${result.data.providerId}`);
    }
    
    const validation = validateProviderCredentials(
      userId,
      result.data.providerId as ProviderId,
      result.data.name
    );
    
    if (!validation.isValid) {
      // Return a warning but allow creation
      console.warn(`[agents] Creating agent "${result.data.name}" with unconfigured provider "${result.data.providerId}": ${validation.error}`);
    }
  }

  const agent = UnifiedAgentService.create(
    db,
    projectPath,
    result.data,
    true // always save as YAML files
  );

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
  const singleProjectPath = projectId ? getProjectPath(projectId) : null;

  // Try unified service first (checks YAML + DB), fall back to registry
  let agent;
  if (singleProjectPath && db) {
    const unified = UnifiedAgentService.getByName(db, singleProjectPath, name);
    agent = unified ? toAgentConfig(unified) : AgentRegistry.get(db, name);
  } else {
    agent = AgentRegistry.get(db, name);
  }
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
  const projectPath = getProjectPath(projectId);

  // Get existing agent
  const existing = UnifiedAgentService.getByName(db, projectPath || "", name);
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

  // Validate provider credentials if specified
  const auth = c.get("auth") as { userId: string } | undefined;
  const userId = auth?.userId || "anonymous";
  
  if (result.data.providerId) {
    // Validate that the providerId is actually a valid ProviderId
    const validProviderIds = Object.values(ProviderIds);
    if (!validProviderIds.includes(result.data.providerId as any)) {
      throw new ValidationError(`Invalid provider ID: ${result.data.providerId}`);
    }
    
    const validation = validateProviderCredentials(
      userId,
      result.data.providerId as ProviderId,
      result.data.name || name
    );
    
    if (!validation.isValid) {
      // Return a warning but allow update
      console.warn(`[agents] Updating agent "${result.data.name || name}" with unconfigured provider "${result.data.providerId}": ${validation.error}`);
    }
  }

  const agent = UnifiedAgentService.update(
    db,
    projectPath || "",
    existing.id,
    result.data
  );

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
  const projectPath = getProjectPath(projectId);

  // Get existing agent
  const existing = UnifiedAgentService.getByName(db, projectPath || "", name);
  if (!existing) {
    throw new ValidationError(`Agent "${name}" not found`);
  }

  UnifiedAgentService.delete(db, projectPath || "", existing.id);

  return c.json({
    data: { deleted: true },
  });
});

export { agents };
