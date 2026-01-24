/**
 * Tool Query Definitions (Frontend)
 *
 * Queries for listing core tools and backend actions.
 */

import type { Query } from "./types";

/**
 * Core tool information
 */
export interface CoreTool {
  name: string;
  description: string;
  category: string;
  requiresCodeExecution: boolean;
}

/**
 * Backend action (for command palette)
 */
export interface BackendAction {
  id: string;
  label: string;
  description: string;
  category: string;
}

/**
 * List core tools
 */
export const toolsCoreQuery: Query<CoreTool[], void> = {
  name: "tools.core",
  endpoint: "/api/tools/core",
  method: "GET",
  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: () => ["tools.core"],
  },
  description: "List core tools available to agents",
};

/**
 * List backend actions
 */
export const toolsActionsQuery: Query<BackendAction[], void> = {
  name: "tools.actions",
  endpoint: "/api/tools/actions",
  method: "GET",
  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: () => ["tools.actions"],
  },
  description: "List backend actions for command palette",
};
