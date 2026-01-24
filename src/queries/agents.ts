/**
 * Agent Query Definitions
 *
 * Queries for listing and getting agents.
 */

import { defineQuery } from "./define.ts";
import type { QueryContext } from "./types.ts";
import { AgentRegistry } from "../agents/registry.ts";
import type { AgentConfig } from "../agents/types.ts";

/**
 * Query result for agent configuration
 */
export interface AgentQueryResult {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  tools: string[];
  mode: "all" | "primary" | "subagent";
  modelId: string | null;
  maxSteps: number | null;
  temperature: number | null;
  isBuiltin: boolean;
  hidden: boolean;
}

/**
 * Parameters for listing agents
 */
export interface AgentsListParams {
  mode?: "primary" | "subagent";
  includeHidden?: boolean;
}

/**
 * Parameters for getting a single agent
 */
export interface AgentsGetParams {
  name: string;
}

/**
 * Convert AgentConfig to query result format
 */
function toAgentQueryResult(agent: AgentConfig): AgentQueryResult {
  return {
    id: agent.name,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    tools: agent.tools ?? [],
    mode: agent.mode ?? "all",
    modelId: agent.modelId,
    maxSteps: agent.maxSteps,
    temperature: agent.temperature,
    isBuiltin: agent.isBuiltin,
    hidden: agent.hidden,
  };
}

/**
 * List all available agents
 *
 * Returns built-in agents, optionally filtered by mode.
 * Custom agents require a database connection in the context.
 */
export const agentsListQuery = defineQuery<AgentQueryResult[], AgentsListParams>({
  name: "agents.list",

  fetch: async (params, context: QueryContext) => {
    // AgentRegistry.list expects null for no database, not undefined
    const db = context.db ?? null;
    const agents = AgentRegistry.list(db, {
      mode: params.mode,
      includeHidden: params.includeHidden,
    });

    return agents.map(toAgentQueryResult);
  },

  cache: {
    ttl: Infinity, // Static data, never expires
    scope: "global",
    key: (params) => {
      const keyParts = ["agents.list"];
      if (params.mode) keyParts.push(`mode:${params.mode}`);
      if (params.includeHidden) keyParts.push("hidden:true");
      return keyParts;
    },
  },

  description: "List all available agents",
});

/**
 * Get a single agent by name
 */
export const agentsGetQuery = defineQuery<AgentQueryResult, AgentsGetParams>({
  name: "agents.get",

  fetch: async (params, context: QueryContext) => {
    const db = context.db ?? null;
    const agent = AgentRegistry.getOrThrow(db, params.name);
    return toAgentQueryResult(agent);
  },

  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: (params) => ["agents.get", params.name],
  },

  description: "Get a single agent by name",
});
