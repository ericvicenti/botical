/**
 * Agent Service
 *
 * Manages custom agent configurations stored in project databases.
 * Custom agents extend the built-in agents with project-specific configurations.
 * See: docs/knowledge-base/02-data-model.md#agent
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";
import type { AgentConfig } from "@/agents/types.ts";

/**
 * Agent mode - determines where the agent can be used
 */
export const AgentModeSchema = z.enum(["primary", "subagent", "all"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

/**
 * Agent creation input schema
 */
export const AgentCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Name must start with a letter and contain only lowercase letters, numbers, and hyphens"
    ),
  description: z.string().max(500).nullable().optional(),
  mode: AgentModeSchema.default("subagent"),
  hidden: z.boolean().default(false),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxSteps: z.number().positive().nullable().optional(),
  prompt: z.string().nullable().optional(),
  tools: z.array(z.string()).default([]),
  options: z.record(z.unknown()).default({}),
  color: z.string().nullable().optional(),
});

export type AgentCreateInput = z.input<typeof AgentCreateSchema>;

/**
 * Agent update input schema
 */
export const AgentUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Name must start with a letter and contain only lowercase letters, numbers, and hyphens"
    )
    .optional(),
  description: z.string().max(500).nullable().optional(),
  mode: AgentModeSchema.optional(),
  hidden: z.boolean().optional(),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxSteps: z.number().positive().nullable().optional(),
  prompt: z.string().nullable().optional(),
  tools: z.array(z.string()).optional(),
  options: z.record(z.unknown()).optional(),
  color: z.string().nullable().optional(),
});

export type AgentUpdateInput = z.infer<typeof AgentUpdateSchema>;

/**
 * Custom agent entity (as stored in database)
 */
export interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  mode: AgentMode;
  hidden: boolean;
  providerId: string | null;
  modelId: string | null;
  temperature: number | null;
  topP: number | null;
  maxSteps: number | null;
  prompt: string | null;
  tools: string[];
  options: Record<string, unknown>;
  color: string | null;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Database row type
 */
interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  mode: string;
  hidden: number;
  provider_id: string | null;
  model_id: string | null;
  temperature: number | null;
  top_p: number | null;
  max_steps: number | null;
  prompt: string | null;
  options: string;
  color: string | null;
  is_builtin: number;
  created_at: number;
  updated_at: number;
}

/**
 * Convert database row to agent entity
 */
function rowToAgent(row: AgentRow): CustomAgent {
  const options = JSON.parse(row.options || "{}");
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mode: row.mode as AgentMode,
    hidden: row.hidden === 1,
    providerId: row.provider_id,
    modelId: row.model_id,
    temperature: row.temperature,
    topP: row.top_p,
    maxSteps: row.max_steps,
    prompt: row.prompt,
    tools: options.tools || [],
    options,
    color: row.color,
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert CustomAgent to AgentConfig format
 */
export function toAgentConfig(agent: CustomAgent): AgentConfig {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
    providerId: agent.providerId,
    modelId: agent.modelId,
    temperature: agent.temperature,
    topP: agent.topP,
    maxSteps: agent.maxSteps,
    prompt: agent.prompt,
    tools: agent.tools,
    isBuiltin: agent.isBuiltin,
  };
}

/**
 * Reserved agent names that cannot be used for custom agents
 */
const RESERVED_NAMES = new Set(["default", "explore", "plan", "system"]);

/**
 * Agent Service for managing custom agent configurations
 */
export class AgentService {
  /**
   * Create a new custom agent
   */
  static create(db: Database, input: AgentCreateInput): CustomAgent {
    const validated = AgentCreateSchema.parse(input);

    // Check for reserved names
    if (RESERVED_NAMES.has(validated.name)) {
      throw new ValidationError(
        `Agent name "${validated.name}" is reserved for built-in agents`
      );
    }

    // Check for duplicate names
    const existing = this.getByName(db, validated.name);
    if (existing) {
      throw new ValidationError(
        `Agent with name "${validated.name}" already exists`
      );
    }

    const now = Date.now();
    const id = generateId(IdPrefixes.agent);

    // Store tools in options JSON
    const options = {
      ...validated.options,
      tools: validated.tools,
    };

    db.prepare(
      `
      INSERT INTO agents (
        id, name, description, mode, hidden, provider_id, model_id,
        temperature, top_p, max_steps, prompt, options, color,
        is_builtin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      validated.name,
      validated.description ?? null,
      validated.mode,
      validated.hidden ? 1 : 0,
      validated.providerId ?? null,
      validated.modelId ?? null,
      validated.temperature ?? null,
      validated.topP ?? null,
      validated.maxSteps ?? null,
      validated.prompt ?? null,
      JSON.stringify(options),
      validated.color ?? null,
      0, // is_builtin = false for custom agents
      now,
      now
    );

    return {
      id,
      name: validated.name,
      description: validated.description ?? null,
      mode: validated.mode,
      hidden: validated.hidden,
      providerId: validated.providerId ?? null,
      modelId: validated.modelId ?? null,
      temperature: validated.temperature ?? null,
      topP: validated.topP ?? null,
      maxSteps: validated.maxSteps ?? null,
      prompt: validated.prompt ?? null,
      tools: validated.tools,
      options,
      color: validated.color ?? null,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get an agent by ID
   */
  static getById(db: Database, agentId: string): CustomAgent | null {
    const row = db
      .prepare("SELECT * FROM agents WHERE id = ?")
      .get(agentId) as AgentRow | undefined;

    if (!row) return null;
    return rowToAgent(row);
  }

  /**
   * Get an agent by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, agentId: string): CustomAgent {
    const agent = this.getById(db, agentId);
    if (!agent) {
      throw new NotFoundError("Agent", agentId);
    }
    return agent;
  }

  /**
   * Get an agent by name
   */
  static getByName(db: Database, name: string): CustomAgent | null {
    const row = db
      .prepare("SELECT * FROM agents WHERE name = ?")
      .get(name) as AgentRow | undefined;

    if (!row) return null;
    return rowToAgent(row);
  }

  /**
   * List all custom agents
   */
  static list(
    db: Database,
    options: {
      mode?: AgentMode;
      includeHidden?: boolean;
    } = {}
  ): CustomAgent[] {
    let query = "SELECT * FROM agents WHERE 1=1";
    const params: (string | number)[] = [];

    if (options.mode) {
      query += " AND (mode = ? OR mode = 'all')";
      params.push(options.mode);
    }

    if (!options.includeHidden) {
      query += " AND hidden = 0";
    }

    query += " ORDER BY name ASC";

    const rows = db.prepare(query).all(...params) as AgentRow[];
    return rows.map(rowToAgent);
  }

  /**
   * Update an agent
   */
  static update(
    db: Database,
    agentId: string,
    input: AgentUpdateInput
  ): CustomAgent {
    const existing = this.getByIdOrThrow(db, agentId);

    // Cannot update built-in agents
    if (existing.isBuiltin) {
      throw new ValidationError("Cannot update built-in agents");
    }

    const validated = AgentUpdateSchema.parse(input);
    const now = Date.now();

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (validated.name !== undefined) {
      // Check for reserved names
      if (RESERVED_NAMES.has(validated.name)) {
        throw new ValidationError(
          `Agent name "${validated.name}" is reserved for built-in agents`
        );
      }

      // Check for duplicate names (excluding current agent)
      const existingByName = this.getByName(db, validated.name);
      if (existingByName && existingByName.id !== agentId) {
        throw new ValidationError(
          `Agent with name "${validated.name}" already exists`
        );
      }

      updates.push("name = ?");
      params.push(validated.name);
    }

    if (validated.description !== undefined) {
      updates.push("description = ?");
      params.push(validated.description);
    }

    if (validated.mode !== undefined) {
      updates.push("mode = ?");
      params.push(validated.mode);
    }

    if (validated.hidden !== undefined) {
      updates.push("hidden = ?");
      params.push(validated.hidden ? 1 : 0);
    }

    if (validated.providerId !== undefined) {
      updates.push("provider_id = ?");
      params.push(validated.providerId);
    }

    if (validated.modelId !== undefined) {
      updates.push("model_id = ?");
      params.push(validated.modelId);
    }

    if (validated.temperature !== undefined) {
      updates.push("temperature = ?");
      params.push(validated.temperature);
    }

    if (validated.topP !== undefined) {
      updates.push("top_p = ?");
      params.push(validated.topP);
    }

    if (validated.maxSteps !== undefined) {
      updates.push("max_steps = ?");
      params.push(validated.maxSteps);
    }

    if (validated.prompt !== undefined) {
      updates.push("prompt = ?");
      params.push(validated.prompt);
    }

    if (validated.color !== undefined) {
      updates.push("color = ?");
      params.push(validated.color);
    }

    // Handle tools and options together
    if (validated.tools !== undefined || validated.options !== undefined) {
      const currentOptions = existing.options;
      const newOptions = {
        ...currentOptions,
        ...(validated.options || {}),
        tools: validated.tools ?? existing.tools,
      };
      updates.push("options = ?");
      params.push(JSON.stringify(newOptions));
    }

    params.push(agentId);

    db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params
    );

    return this.getByIdOrThrow(db, agentId);
  }

  /**
   * Delete an agent
   */
  static delete(db: Database, agentId: string): void {
    const existing = this.getByIdOrThrow(db, agentId);

    // Cannot delete built-in agents
    if (existing.isBuiltin) {
      throw new ValidationError("Cannot delete built-in agents");
    }

    db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
  }

  /**
   * Count custom agents
   */
  static count(db: Database): number {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM agents WHERE is_builtin = 0")
      .get() as { count: number };
    return result.count;
  }
}
