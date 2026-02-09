/**
 * Unified Agent Service
 *
 * Combines agents from multiple sources:
 * 1. Built-in agents (default, explore, plan)
 * 2. YAML files in agents/{name}/agent.yaml (filesystem-based)
 *
 * Priority: Built-in > YAML
 */

import type { Database } from "bun:sqlite";
import {
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
export type AgentSource = "builtin" | "yaml";

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
   * List all custom agents from YAML files
   */
  list(
    _db: Database,
    projectPath: string,
    options: {
      mode?: AgentMode;
      includeHidden?: boolean;
    } = {}
  ): AgentWithSource[] {
    const { mode, includeHidden = false } = options;

    let agents = AgentYamlService.list(projectPath).map((a) => ({
      ...a,
      source: "yaml" as AgentSource,
    }));

    if (mode) {
      agents = agents.filter((a) => a.mode === mode || a.mode === "all");
    }
    if (!includeHidden) {
      agents = agents.filter((a) => !a.hidden);
    }

    return agents.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Count custom agents
   */
  count(_db: Database, projectPath: string): number {
    return AgentYamlService.count(projectPath);
  },

  /**
   * Get agent by ID
   */
  getById(
    _db: Database,
    projectPath: string,
    agentId: string
  ): AgentWithSource | null {
    if (agentId.startsWith("agent_yaml_")) {
      const name = agentId.replace("agent_yaml_", "");
      const agent = AgentYamlService.getByName(projectPath, name);
      if (agent) {
        return { ...agent, source: "yaml" };
      }
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
   * Get custom agent by name
   */
  getByName(
    _db: Database,
    projectPath: string,
    name: string
  ): AgentWithSource | null {
    const agent = AgentYamlService.getByName(projectPath, name);
    if (agent) {
      return { ...agent, source: "yaml" };
    }
    return null;
  },

  /**
   * Create an agent (always saves as YAML)
   */
  create(
    db: Database,
    projectPath: string,
    input: AgentCreateInput,
    _saveToYaml: boolean = true
  ): AgentWithSource {
    if (this.isReservedName(input.name)) {
      throw new ValidationError(
        `Agent name "${input.name}" is reserved for built-in agents`
      );
    }

    const existing = this.getByName(db, projectPath, input.name);
    if (existing) {
      throw new ConflictError(`Agent with name "${input.name}" already exists`, {
        agentName: input.name,
      });
    }

    const now = Date.now();
    const agent: CustomAgent = {
      id: `agent_yaml_${input.name}`,
      name: input.name,
      description: input.description ?? null,
      mode: input.mode ?? "all",
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
  },

  /**
   * Update an agent
   */
  update(
    db: Database,
    projectPath: string,
    agentId: string,
    input: AgentUpdateInput
  ): AgentWithSource {
    const existing = this.getByIdOrThrow(db, projectPath, agentId);

    if (existing.isBuiltin) {
      throw new ValidationError("Cannot update built-in agents");
    }

    if (input.name && this.isReservedName(input.name)) {
      throw new ValidationError(
        `Agent name "${input.name}" is reserved for built-in agents`
      );
    }

    if (input.name && input.name !== existing.name) {
      const nameExists = this.getByName(db, projectPath, input.name);
      if (nameExists) {
        throw new ConflictError(
          `Agent with name "${input.name}" already exists`,
          { agentName: input.name }
        );
      }
    }

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

    if (input.name && input.name !== existing.name) {
      AgentYamlService.delete(projectPath, existing.name);
      updated.id = `agent_yaml_${input.name}`;
    }

    AgentYamlService.save(projectPath, updated);
    return { ...updated, source: "yaml" };
  },

  /**
   * Delete an agent
   */
  delete(_db: Database, projectPath: string, agentId: string): void {
    const name = agentId.replace("agent_yaml_", "");
    const exists = AgentYamlService.exists(projectPath, name);
    if (!exists) {
      throw new NotFoundError("Agent", agentId);
    }
    AgentYamlService.delete(projectPath, name);
  },

  /**
   * Convert to AgentConfig format
   */
  toAgentConfig(agent: AgentWithSource): AgentConfig {
    return toAgentConfig(agent);
  },
};
