/**
 * Agent Registry
 *
 * Provides unified access to both built-in and custom agents.
 * This is the primary interface for resolving agent configurations.
 * See: docs/knowledge-base/04-patterns.md
 */

import type { Database } from "bun:sqlite";
import type { AgentConfig } from "./types.ts";
import {
  BUILTIN_AGENTS,
  getBuiltinAgent,
  isBuiltinAgent,
  getAllBuiltinAgents,
} from "./builtin/index.ts";
import { AgentYamlService } from "@/config/agents.ts";
import { toAgentConfig } from "@/services/agents.ts";

export type AgentMode = "primary" | "subagent";

/**
 * Agent Registry provides unified access to all agents
 */
export class AgentRegistry {
  /**
   * Get an agent by name, checking built-in first, then custom
   *
   * @param db - Project database (for custom agents)
   * @param name - Agent name to look up
   * @returns Agent configuration or undefined if not found
   */
  static get(db: Database | null, name: string, projectPath?: string): AgentConfig | undefined {
    // Check built-in agents first
    const builtin = getBuiltinAgent(name);
    if (builtin) {
      return builtin;
    }

    // Check YAML agents if project path is provided
    if (projectPath) {
      const yamlAgent = AgentYamlService.getByName(projectPath, name);
      if (yamlAgent) {
        return toAgentConfig(yamlAgent);
      }
    }

    return undefined;
  }

  /**
   * Get an agent by name or throw error if not found
   */
  static getOrThrow(db: Database | null, name: string): AgentConfig {
    const agent = this.get(db, name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found`);
    }
    return agent;
  }

  /**
   * Check if an agent exists
   */
  static has(db: Database | null, name: string, projectPath?: string): boolean {
    if (isBuiltinAgent(name)) {
      return true;
    }
    if (projectPath) {
      return AgentYamlService.exists(projectPath, name);
    }
    return false;
  }

  /**
   * List all available agents (built-in + custom)
   *
   * @param db - Project database (for custom agents)
   * @param options - Filter options
   */
  static list(
    db: Database | null,
    options: {
      mode?: AgentMode;
      includeHidden?: boolean;
      builtinOnly?: boolean;
      customOnly?: boolean;
    } = {}
  ): AgentConfig[] {
    const agents: AgentConfig[] = [];

    // Add built-in agents (unless customOnly)
    if (!options.customOnly) {
      for (const agent of getAllBuiltinAgents()) {
        // Filter by mode
        if (options.mode && agent.mode !== options.mode && agent.mode !== "all") {
          continue;
        }
        // Filter hidden
        if (!options.includeHidden && agent.hidden) {
          continue;
        }
        agents.push(agent);
      }
    }

    // Add custom YAML agents (unless builtinOnly)
    // Note: projectPath must be passed in options for custom agents to appear
    if (!options.builtinOnly && (options as any).projectPath) {
      const yamlAgents = AgentYamlService.list((options as any).projectPath);
      for (const custom of yamlAgents) {
        if (options.mode && custom.mode !== options.mode && custom.mode !== "all") {
          continue;
        }
        if (!options.includeHidden && custom.hidden) {
          continue;
        }
        agents.push(toAgentConfig(custom));
      }
    }

    // Sort by name
    return agents.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get agents that can be used as primary agents (user-initiated)
   */
  static getPrimaryAgents(db: Database | null): AgentConfig[] {
    return this.list(db, { mode: "primary" });
  }

  /**
   * Get agents that can be used as subagents (spawned by other agents)
   */
  static getSubagents(db: Database | null): AgentConfig[] {
    return this.list(db, { mode: "subagent" });
  }

  /**
   * Get agent names for a given mode
   */
  static getNames(
    db: Database | null,
    mode?: AgentMode
  ): string[] {
    return this.list(db, { mode }).map((a) => a.name);
  }

  /**
   * Check if a name is reserved (built-in agent name)
   */
  static isReservedName(name: string): boolean {
    return isBuiltinAgent(name);
  }

  /**
   * Resolve tools for an agent, optionally filtering by available tools
   *
   * @param agent - The agent configuration
   * @param availableTools - List of available tool names (optional filter)
   * @returns Array of tool names the agent should have access to
   */
  static resolveTools(
    agent: AgentConfig,
    availableTools?: string[]
  ): string[] {
    if (!agent.tools.length) {
      // If no tools specified, return all available tools
      return availableTools ?? [];
    }

    if (availableTools) {
      // Filter to only tools that are both in agent config and available
      return agent.tools.filter((t) => availableTools.includes(t));
    }

    return agent.tools;
  }

  /**
   * Merge agent configurations (base + overrides)
   * Used when an agent needs to inherit from another
   */
  static merge(
    base: AgentConfig,
    overrides: Partial<AgentConfig>
  ): AgentConfig {
    return {
      ...base,
      ...overrides,
      // Arrays need special handling - override replaces base
      tools: overrides.tools ?? base.tools,
    };
  }

  /**
   * Get the default agent for new sessions
   */
  static getDefault(): AgentConfig {
    const agent = getBuiltinAgent("default");
    if (!agent) {
      throw new Error("Default agent not found - built-in agents not loaded");
    }
    return agent;
  }
}

// Re-export types and utilities
export { BUILTIN_AGENTS, isBuiltinAgent, getBuiltinAgent };
