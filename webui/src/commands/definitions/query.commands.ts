/**
 * Query Commands
 *
 * Commands for manually running queries through the command palette.
 */

import type { Command } from "../types";
import { apiClient } from "@/lib/api/client";

/**
 * Query definition for generating commands
 */
interface QueryDefinition {
  name: string;
  label: string;
  description: string;
  endpoint: (projectId: string) => string;
  requiresProject: boolean;
}

/**
 * Available queries that can be run manually
 */
const QUERY_DEFINITIONS: QueryDefinition[] = [
  // Project queries
  {
    name: "projects.list",
    label: "List Projects",
    description: "Get all projects",
    endpoint: () => "/api/projects",
    requiresProject: false,
  },

  // Workflow queries
  {
    name: "workflows.list",
    label: "List Workflows",
    description: "Get all workflows for the current project",
    endpoint: (projectId) => `/api/workflows?projectId=${projectId}`,
    requiresProject: true,
  },

  // Session queries
  {
    name: "sessions.list",
    label: "List Sessions",
    description: "Get all sessions for the current project",
    endpoint: (projectId) => `/api/sessions?projectId=${projectId}`,
    requiresProject: true,
  },

  // Service queries
  {
    name: "services.list",
    label: "List Services",
    description: "Get all service configurations for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/services`,
    requiresProject: true,
  },

  // Agent queries
  {
    name: "agents.list",
    label: "List Agents",
    description: "Get all available agents",
    endpoint: () => "/api/agents",
    requiresProject: false,
  },

  // Tool queries
  {
    name: "tools.core",
    label: "List Core Tools",
    description: "Get all core tools",
    endpoint: () => "/api/tools/core",
    requiresProject: false,
  },
  {
    name: "tools.actions",
    label: "List Backend Actions",
    description: "Get all backend actions",
    endpoint: () => "/api/tools/actions",
    requiresProject: false,
  },

  // Git queries
  {
    name: "git.status",
    label: "Git Status",
    description: "Get git status for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/git/status`,
    requiresProject: true,
  },
  {
    name: "git.branches",
    label: "Git Branches",
    description: "List git branches for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/git/branches`,
    requiresProject: true,
  },
  {
    name: "git.log",
    label: "Git Log",
    description: "Get recent commits for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/git/log?limit=20`,
    requiresProject: true,
  },

  // Process queries
  {
    name: "processes.list",
    label: "List Processes",
    description: "Get all processes for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/processes`,
    requiresProject: true,
  },

  // Mission queries
  {
    name: "missions.list",
    label: "List Missions",
    description: "Get all missions for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/missions`,
    requiresProject: true,
  },
  {
    name: "missions.active",
    label: "Active Missions",
    description: "Get currently active missions",
    endpoint: (projectId) => `/api/projects/${projectId}/missions?status=running`,
    requiresProject: true,
  },

  // File queries
  {
    name: "files.list",
    label: "List Files",
    description: "Get all tracked files for the current project",
    endpoint: (projectId) => `/api/projects/${projectId}/files`,
    requiresProject: true,
  },
];

/**
 * Convert a query definition to a Command
 */
function queryToCommand(query: QueryDefinition): Command {
  return {
    id: `query:${query.name}`,
    label: `Query: ${query.label}`,
    description: query.description,
    category: "query",
    when: query.requiresProject ? (ctx) => !!ctx.selectedProjectId : undefined,
    execute: async (ctx) => {
      try {
        const projectId = ctx.selectedProjectId || "";
        const endpoint = query.endpoint(projectId);

        const result = await apiClient<unknown>(endpoint);

        // Format the result as pretty JSON
        const formattedResult = JSON.stringify(result, null, 2);

        // Show result in dialog
        ctx.feedback.showResult(
          `${query.label} Results`,
          formattedResult,
          "success"
        );
      } catch (err) {
        console.error(`Query ${query.name} failed:`, err);
        ctx.feedback.showToast(
          `Query failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          "error"
        );
      }
    },
  };
}

/**
 * Generate all query commands
 */
export function getQueryCommands(): Command[] {
  return QUERY_DEFINITIONS.map(queryToCommand);
}

/**
 * Custom Query command - allows running any endpoint
 */
export const runCustomQueryCommand: Command = {
  id: "query:custom",
  label: "Query: Run Custom Query",
  description: "Run a custom API query by specifying the endpoint",
  category: "query",
  args: [
    {
      name: "endpoint",
      type: "string",
      label: "API Endpoint",
      placeholder: "/api/projects or /api/agents",
      required: true,
    },
  ],
  execute: async (ctx, args) => {
    const endpoint = args.endpoint as string;

    if (!endpoint) {
      ctx.feedback.showToast("Please provide an endpoint", "error");
      return;
    }

    // Auto-prefix with /api if not present
    let normalizedEndpoint = endpoint;
    if (!normalizedEndpoint.startsWith("/api") && !normalizedEndpoint.startsWith("http")) {
      normalizedEndpoint = `/api/${normalizedEndpoint.replace(/^\//, "")}`;
    }

    // Replace {projectId} placeholder if present
    if (ctx.selectedProjectId) {
      normalizedEndpoint = normalizedEndpoint.replace("{projectId}", ctx.selectedProjectId);
    }

    try {
      const result = await apiClient<unknown>(normalizedEndpoint);
      const formattedResult = JSON.stringify(result, null, 2);

      ctx.feedback.showResult(
        `Query: ${normalizedEndpoint}`,
        formattedResult,
        "success"
      );
    } catch (err) {
      console.error(`Custom query failed:`, err);
      ctx.feedback.showToast(
        `Query failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  },
};
