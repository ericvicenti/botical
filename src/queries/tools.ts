/**
 * Tool Query Definitions
 *
 * Queries for listing core tools and backend actions.
 */

import { defineQuery } from "./define.ts";
import type { QueryContext } from "./types.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { ActionRegistry } from "../actions/registry.ts";

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
 *
 * Returns the list of built-in tools available to agents.
 */
export const toolsCoreQuery = defineQuery<CoreTool[], void>({
  name: "tools.core",

  fetch: async (_params, _context: QueryContext) => {
    const tools = ToolRegistry.getAll();

    return tools.map((registered) => ({
      name: registered.definition.name,
      description: registered.definition.description,
      category: registered.category,
      requiresCodeExecution: registered.requiresCodeExecution,
    }));
  },

  cache: {
    ttl: Infinity, // Static data, never changes during runtime
    scope: "global",
    key: () => ["tools.core"],
  },

  description: "List core tools available to agents",
});

/**
 * List backend actions
 *
 * Returns actions that can be invoked from the command palette.
 */
export const toolsActionsQuery = defineQuery<BackendAction[], void>({
  name: "tools.actions",

  fetch: async (_params, _context: QueryContext) => {
    const actions = ActionRegistry.getAll();

    return actions.map((registered) => ({
      id: registered.definition.id,
      label: registered.definition.label,
      description: registered.definition.description,
      category: registered.definition.category,
    }));
  },

  cache: {
    ttl: Infinity, // Static data
    scope: "global",
    key: () => ["tools.actions"],
  },

  description: "List backend actions for command palette",
});
