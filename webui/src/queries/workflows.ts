/**
 * Workflow Query Definitions (Frontend)
 *
 * Queries and mutations for workflow operations.
 */

import type { Query, Mutation } from "./types";

/**
 * Workflow returned by queries
 */
export interface WorkflowQueryResult {
  id: string;
  name: string;
  label: string;
  description: string;
  category: string;
  icon: string | null;
  inputSchema: {
    fields: Array<{
      name: string;
      type: "string" | "number" | "boolean" | "enum";
      label: string;
      description?: string;
      required?: boolean;
      default?: unknown;
      options?: string[];
    }>;
  };
  steps: unknown[];
}

export interface WorkflowsListParams {
  projectId: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface WorkflowsGetParams {
  projectId: string;
  workflowId: string;
}

export interface WorkflowsCountParams {
  projectId: string;
  category?: string;
}

export interface WorkflowsCreateParams {
  projectId: string;
  data: {
    name: string;
    label: string;
    description?: string;
    category?: string;
    icon?: string;
    inputSchema?: { fields: unknown[] };
    steps?: unknown[];
  };
}

export interface WorkflowsUpdateParams {
  projectId: string;
  workflowId: string;
  data: {
    name?: string;
    label?: string;
    description?: string;
    category?: string;
    icon?: string | null;
    inputSchema?: { fields: unknown[] };
    steps?: unknown[];
  };
}

export interface WorkflowsDeleteParams {
  projectId: string;
  workflowId: string;
}

// ============================================
// Query Definitions
// ============================================

export const workflowsListQuery: Query<WorkflowQueryResult[], WorkflowsListParams> = {
  name: "workflows.list",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows`,
  method: "GET",
  params: (params) => ({
    ...(params.category && { category: params.category }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 60_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["workflows.list", params.projectId];
      if (params.category) keyParts.push(`category:${params.category}`);
      return keyParts;
    },
  },
  realtime: {
    events: ["workflow.created", "workflow.updated", "workflow.deleted"],
  },
  description: "List workflows for a project",
};

export const workflowsGetQuery: Query<WorkflowQueryResult, WorkflowsGetParams> = {
  name: "workflows.get",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows/${params.workflowId}`,
  method: "GET",
  cache: {
    ttl: 60_000,
    scope: "project",
    key: (params) => ["workflows.get", params.projectId, params.workflowId],
  },
  realtime: {
    events: ["workflow.updated", "workflow.deleted"],
  },
  description: "Get a single workflow by ID",
};

export const workflowsCountQuery: Query<{ count: number }, WorkflowsCountParams> = {
  name: "workflows.count",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows/count`,
  method: "GET",
  params: (params) => ({
    ...(params.category && { category: params.category }),
  }),
  cache: {
    ttl: 60_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["workflows.count", params.projectId];
      if (params.category) keyParts.push(`category:${params.category}`);
      return keyParts;
    },
  },
  description: "Count workflows for a project",
};

// ============================================
// Mutation Definitions
// ============================================

export const workflowsCreateMutation: Mutation<WorkflowsCreateParams, WorkflowQueryResult> = {
  name: "workflows.create",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows`,
  method: "POST",
  body: (params) => params.data,
  invalidates: ["workflows.list", "workflows.count"],
  description: "Create a new workflow",
};

export const workflowsUpdateMutation: Mutation<WorkflowsUpdateParams, WorkflowQueryResult> = {
  name: "workflows.update",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows/${params.workflowId}`,
  method: "PUT",
  body: (params) => params.data,
  invalidates: ["workflows.list"],
  invalidateKeys: (params) => [
    ["workflows.get", params.projectId, params.workflowId],
  ],
  description: "Update an existing workflow",
};

export const workflowsDeleteMutation: Mutation<WorkflowsDeleteParams, { deleted: boolean }> = {
  name: "workflows.delete",
  endpoint: (params) => `/api/projects/${params.projectId}/workflows/${params.workflowId}`,
  method: "DELETE",
  invalidates: ["workflows.list", "workflows.count"],
  invalidateKeys: (params) => [
    ["workflows.get", params.projectId, params.workflowId],
  ],
  description: "Delete a workflow",
};
