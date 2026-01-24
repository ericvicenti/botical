/**
 * Workflow Query Definitions
 *
 * Queries and mutations for workflow operations.
 * Workflows are project-scoped (use project database).
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  WorkflowService,
  type WorkflowCreate,
  type WorkflowUpdate,
} from "../services/workflows.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";

// ============================================
// Query Result Types
// ============================================

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

// ============================================
// Query Parameters
// ============================================

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

// ============================================
// Mutation Parameters
// ============================================

export interface WorkflowsCreateParams {
  projectId: string;
  data: WorkflowCreate;
}

export interface WorkflowsUpdateParams {
  projectId: string;
  workflowId: string;
  data: WorkflowUpdate;
}

export interface WorkflowsDeleteParams {
  projectId: string;
  workflowId: string;
}

// ============================================
// Helper Functions
// ============================================

function toWorkflowQueryResult(workflow: WorkflowDefinition): WorkflowQueryResult {
  return {
    id: workflow.id,
    name: workflow.name,
    label: workflow.label,
    description: workflow.description,
    category: workflow.category,
    icon: workflow.icon ?? null,
    inputSchema: workflow.inputSchema,
    steps: workflow.steps as unknown[],
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List workflows for a project
 */
export const workflowsListQuery = defineQuery<WorkflowQueryResult[], WorkflowsListParams>({
  name: "workflows.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const workflows = WorkflowService.list(db, params.projectId, {
      category: params.category,
      limit: params.limit,
      offset: params.offset,
    });

    return workflows.map(toWorkflowQueryResult);
  },

  cache: {
    ttl: 60_000, // 1 minute
    scope: "project",
    key: (params) => {
      const keyParts = ["workflows.list", params.projectId];
      if (params.category) keyParts.push(`category:${params.category}`);
      if (params.limit) keyParts.push(`limit:${params.limit}`);
      if (params.offset) keyParts.push(`offset:${params.offset}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["workflow.created", "workflow.updated", "workflow.deleted"],
  },

  description: "List workflows for a project",
});

/**
 * Get a single workflow by ID
 */
export const workflowsGetQuery = defineQuery<WorkflowQueryResult, WorkflowsGetParams>({
  name: "workflows.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const workflow = WorkflowService.getByIdOrThrow(db, params.workflowId);
    return toWorkflowQueryResult(workflow);
  },

  cache: {
    ttl: 60_000, // 1 minute
    scope: "project",
    key: (params) => ["workflows.get", params.projectId, params.workflowId],
  },

  realtime: {
    events: ["workflow.updated", "workflow.deleted"],
  },

  description: "Get a single workflow by ID",
});

/**
 * Count workflows for a project
 */
export const workflowsCountQuery = defineQuery<number, WorkflowsCountParams>({
  name: "workflows.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return WorkflowService.count(db, params.projectId, {
      category: params.category,
    });
  },

  cache: {
    ttl: 60_000, // 1 minute
    scope: "project",
    key: (params) => {
      const keyParts = ["workflows.count", params.projectId];
      if (params.category) keyParts.push(`category:${params.category}`);
      return keyParts;
    },
  },

  description: "Count workflows for a project",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a workflow
 */
export const workflowsCreateMutation = defineMutation<WorkflowsCreateParams, WorkflowQueryResult>({
  name: "workflows.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const workflow = WorkflowService.create(db, params.projectId, params.data);
    return toWorkflowQueryResult(workflow);
  },

  invalidates: ["workflows.list", "workflows.count"],

  description: "Create a new workflow",
});

/**
 * Update a workflow
 */
export const workflowsUpdateMutation = defineMutation<WorkflowsUpdateParams, WorkflowQueryResult>({
  name: "workflows.update",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const workflow = WorkflowService.update(db, params.workflowId, params.data);
    return toWorkflowQueryResult(workflow);
  },

  invalidates: ["workflows.list"],
  invalidateKeys: (params) => [
    ["workflows.get", params.projectId, params.workflowId],
  ],

  description: "Update an existing workflow",
});

/**
 * Delete a workflow
 */
export const workflowsDeleteMutation = defineMutation<WorkflowsDeleteParams, { deleted: boolean }>({
  name: "workflows.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    WorkflowService.delete(db, params.workflowId);
    return { deleted: true };
  },

  invalidates: ["workflows.list", "workflows.count"],
  invalidateKeys: (params) => [
    ["workflows.get", params.projectId, params.workflowId],
  ],

  description: "Delete a workflow",
});
