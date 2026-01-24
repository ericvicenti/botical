/**
 * Agent Query Definitions (Frontend)
 *
 * Queries for listing and getting agents.
 */

import type { Query } from "./types";

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
 * List all available agents
 */
export const agentsListQuery: Query<AgentQueryResult[], AgentsListParams> = {
  name: "agents.list",
  endpoint: "/api/agents",
  method: "GET",
  params: (params) => ({
    ...(params.mode && { mode: params.mode }),
    ...(params.includeHidden && { includeHidden: "true" }),
  }),
  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: (params) => {
      const keyParts = ["agents.list"];
      if (params.mode) keyParts.push(`mode:${params.mode}`);
      if (params.includeHidden) keyParts.push("hidden:true");
      return keyParts;
    },
  },
  description: "List all available agents",
};

/**
 * Get a single agent by name
 */
export const agentsGetQuery: Query<AgentQueryResult, AgentsGetParams> = {
  name: "agents.get",
  endpoint: (params) => `/api/agents/${encodeURIComponent(params.name)}`,
  method: "GET",
  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: (params) => ["agents.get", params.name],
  },
  description: "Get a single agent by name",
};
