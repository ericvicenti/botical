/**
 * Unified Agent Service
 *
 * Combines agents from multiple sources:
 * 1. Built-in agents (default, explore, plan)
 * 2. YAML files in .iris/agents/ (primary, file-based)
 * 3. SQLite database (legacy, for backward compatibility)
 *
 * Priority: Built-in > YAML > Database
 */

import type { Database } from "bun:sqlite";
import {
  AgentService,
  type CustomAgent,
  type AgentCreateInput,
  type AgentUpdateInput,
  type AgentMode,
  toAgentConfig,
} from "./agents.ts";
import { AgentYamlService } from "@/config/agents.ts";
import { ProjectService } from "./projects.ts";
import { DatabaseManager } from "@/database/index.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";
import { isBuiltinAgent } from "@/agents/builtin/index.ts";
import type { AgentConfig } from "@/agents/types.ts";

/**
 * Source indicator for agents
 */
export type AgentSource = "builtin" | "yaml" | "database";

/**
 * Extended agent with source info
 */
export interface AgentWithSource extends CustomAgent {
  source: AgentSource;
}

/**
 * Reserved agent names that cannot be used for custom agents
 */
const RESERVED_NAMES = new Set(["default", "explore", "plan", "system"]);

/**
 * Unified Agent Service
 */
export const UnifiedAgentService = {
  /**
   * Get project path from project ID
   */
  getProjectPath(projectId: string): string {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getById(rootDb, projectId);
    if (!project) {
      throw new NotFoundError("Project", projectId);
    }
    if (!project.path) {
      throw new ValidationError("Project has no path configured");
    }
    return project.path;
  },

  /**
   * Check if a name is reserved (built-in agent name)
   */
  isReservedName(name: string): boolean {
    return RESERVED_NAMES.has(name) || isBuiltinAgent(name);
  },

  /**
   * List all custom agents from all sources (excluding built-in)
   */
  list(
    db: Database,
    projectPath: string,
    options: {
      mode?: AgentMode;
      includeHidden?: boolean;
    } = {}
  ): AgentWithSource[] {
    const { mode, includeHidden = false } = options;

    // Get YAML agents
    const yamlAgents = AgentYamlService.list(projectPath).map((a) => ({
      ...a,
      source: "yaml" as AgentSource,
    }));

    // Get database agents
    const dbAgents = AgentService.list(db, { mode, includeHidden }).map((a) => ({
      ...a,
      source: "database" as AgentSource,
    }));

    // Merge: YAML takes precedence over database for same name
    const yamlNames = new Set(yamlAgents.map((a) => a.name));
    const combined = [
      ...yamlAgents,
      ...dbAgents.filter((a) => !yamlNames.has(a.name)),
    ];

    // Apply filters to YAML agents (DB already filtered)
    let filtered = combined;
    if (mode) {
      filtered = filtered.filter((a) => a.mode === mode || a.mode === "all");
    }
    if (!includeHidden) {
      filtered = filtered.filter((a) => !a.hidden);
    }

    // Sort by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Count custom agents from all sources
   */
  count(db: Database, projectPath: string): number {
    return this.list(db, projectPath, { includeHidden: true }).length;
  },

  /**
   * Get agent by ID
   */
  getById(
    db: Database,
    projectPath: string,
    agentId: string
  ): AgentWithSource | null {
    // Check if it's a YAML agent ID
    if (agentId.startsWith("agent_yaml_")) {
      const name = agentId.replace("agent_yaml_", "");
      const agent = AgentYamlService.getByName(projectPath, name);
      if (agent) {
        return { ...agent, source: "yaml" };
      }
    }

    // Check database
    const agent = AgentService.getById(db, agentId);
    if (agent) {
      return { ...agent, source: "database" };
    }

    return null;
  },

  /**
   * Get agent by ID or throw
   */
  getByIdOrThrow(
    db: Database,
    projectPath: string,
    agentId: string
  ): AgentWithSource {
    const agent = this.getById(db, projectPath, agentId);
    if (!agent) {
      throw new NotFoundError("Agent", agentId);
    }
    return agent;
  },

  /**
   * Get custom agent by name (excluding built-in)
   */
  getByName(
    db: Database,
    projectPath: string,
    name: string
  ): AgentWithSource | null {
    // YAML takes precedence
    const yamlAgent = AgentYamlService.getByName(projectPath, name);
    if (yamlAgent) {
      return { ...yamlAgent, source: "yaml" };
    }

    // Check database
    const dbAgent = AgentService.getByName(db, name);
    if (dbAgent) {
      return { ...dbAgent, source: "database" };
    }

    return null;
  },

  /**
   * Create an agent
   * - If saveToYaml is true, saves to YAML file
   * - Otherwise saves to database (legacy behavior)
   */
  create(
    db: Database,
    projectPath: string,
    input: AgentCreateInput,
    saveToYaml: boolean = false
  ): AgentWithSource {
    // Check for reserved names
    if (this.isReservedName(input.name)) {
      throw new ValidationError(
        `Agent name "${input.name}" is reserved for built-in agents`
      );
    }

    // Check for existing agent with same name
    const existing = this.getByName(db, projectPath, input.name);
    if (existing) {
      throw new ConflictError(`Agent with name "${input.name}" already exists`, {
        agentName: input.name,
      });
    }

    if (saveToYaml) {
      // Create YAML agent
      const now = Date.now();
      const agent: CustomAgent = {
        id: `agent_yaml_${input.name}`,
        name: input.name,
        description: input.description ?? null,
        mode: input.mode ?? "subagent",
        hidden: input.hidden ?? false,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        temperature: input.temperature ?? null,
        topP: input.topP ?? null,
        maxSteps: input.maxSteps ?? null,
        prompt: input.prompt ?? null,
        tools: input.tools ?? [],
        options: input.options ?? {},
        color: input.color ?? null,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      };
      AgentYamlService.save(projectPath, agent);
      return { ...agent, source: "yaml" };
    } else {
      // Create database agent
      const agent = AgentService.create(db, input);
      return { ...agent, source: "database" };
    }
  },

  /**
   * Update an agent
   * - YAML agents are updated by saving the file
   * - Database agents use the standard service
   */
  update(
    db: Database,
    projectPath: string,
    agentId: string,
    input: AgentUpdateInput
  ): AgentWithSource {
    const existing = this.getByIdOrThrow(db, projectPath, agentId);

    // Cannot update built-in agents
    if (existing.isBuiltin) {
      throw new ValidationError("Cannot update built-in agents");
    }

    // Check for reserved names if name is being changed
    if (input.name && this.isReservedName(input.name)) {
      throw new ValidationError(
        `Agent name "${input.name}" is reserved for built-in agents`
      );
    }

    // Check for duplicate name if name is being updated
    if (input.name && input.name !== existing.name) {
      const nameExists = this.getByName(db, projectPath, input.name);
      if (nameExists) {
        throw new ConflictError(
          `Agent with name "${input.name}" already exists`,
          { agentName: input.name }
        );
      }
    }

    if (existing.source === "yaml") {
      // Update YAML agent
      const now = Date.now();
      const updated: CustomAgent = {
        ...existing,
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        mode: input.mode ?? existing.mode,
        hidden: input.hidden ?? existing.hidden,
        providerId: input.providerId !== undefined ? input.providerId : existing.providerId,
        modelId: input.modelId !== undefined ? input.modelId : existing.modelId,
        temperature: input.temperature !== undefined ? input.temperature : existing.temperature,
        topP: input.topP !== undefined ? input.topP : existing.topP,
        maxSteps: input.maxSteps !== undefined ? input.maxSteps : existing.maxSteps,
        prompt: input.prompt !== undefined ? input.prompt : existing.prompt,
        tools: input.tools ?? existing.tools,
        options: input.options !== undefined
          ? { ...existing.options, ...input.options }
          : existing.options,
        color: input.color !== undefined ? input.color : existing.color,
        updatedAt: now,
      };

      // If name changed, delete old file and create new
      if (input.name && input.name !== existing.name) {
        AgentYamlService.delete(projectPath, existing.name);
        updated.id = `agent_yaml_${input.name}`;
      }

      AgentYamlService.save(projectPath, updated);
      return { ...updated, source: "yaml" };
    } else {
      // Update database agent
      const agent = AgentService.update(db, agentId, input);
      return { ...agent, source: "database" };
    }
  },

  /**
   * Delete an agent
   */
  delete(db: Database, projectPath: string, agentId: string): void {
    const existing = this.getByIdOrThrow(db, projectPath, agentId);

    // Cannot delete built-in agents
    if (existing.isBuiltin) {
      throw new ValidationError("Cannot delete built-in agents");
    }

    if (existing.source === "yaml") {
      AgentYamlService.delete(projectPath, existing.name);
    } else {
      AgentService.delete(db, agentId);
    }
  },

  /**
   * Convert to AgentConfig format for use with the agent system
   */
  toAgentConfig(agent: AgentWithSource): AgentConfig {
    return toAgentConfig(agent);
  },
};
