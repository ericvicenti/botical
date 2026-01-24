/**
 * Project Query Definitions
 *
 * Queries and mutations for project operations.
 * Projects use the root database (global scope).
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  ProjectService,
  type Project,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "../services/projects.ts";

// ============================================
// Query Result Types
// ============================================

/**
 * Project returned by queries
 */
export interface ProjectQueryResult {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  type: "local" | "remote";
  path: string | null;
  gitRemote: string | null;
  iconUrl: string | null;
  color: string | null;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

// ============================================
// Query Parameters
// ============================================

export interface ProjectsListParams {
  ownerId?: string;
  memberId?: string;
  type?: "local" | "remote";
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProjectsGetParams {
  projectId: string;
}

export interface ProjectsCountParams {
  ownerId?: string;
  memberId?: string;
  includeArchived?: boolean;
}

// ============================================
// Mutation Parameters
// ============================================

export type ProjectsCreateParams = ProjectCreateInput;

export interface ProjectsUpdateParams {
  projectId: string;
  data: ProjectUpdateInput;
}

export interface ProjectsDeleteParams {
  projectId: string;
  permanent?: boolean;
}

// ============================================
// Helper Functions
// ============================================

function toProjectQueryResult(project: Project): ProjectQueryResult {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    type: project.type,
    path: project.path,
    gitRemote: project.gitRemote,
    iconUrl: project.iconUrl,
    color: project.color,
    settings: project.settings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List projects
 */
export const projectsListQuery = defineQuery<ProjectQueryResult[], ProjectsListParams>({
  name: "projects.list",

  fetch: async (params, _context: QueryContext) => {
    const rootDb = DatabaseManager.getRootDb();
    const projects = ProjectService.list(rootDb, {
      ownerId: params.ownerId,
      memberId: params.memberId,
      type: params.type,
      includeArchived: params.includeArchived,
      limit: params.limit,
      offset: params.offset,
    });

    return projects.map(toProjectQueryResult);
  },

  cache: {
    ttl: 30_000, // 30 seconds
    scope: "global",
    key: (params) => {
      const keyParts = ["projects.list"];
      if (params.ownerId) keyParts.push(`owner:${params.ownerId}`);
      if (params.memberId) keyParts.push(`member:${params.memberId}`);
      if (params.type) keyParts.push(`type:${params.type}`);
      if (params.includeArchived) keyParts.push("archived:true");
      if (params.limit) keyParts.push(`limit:${params.limit}`);
      if (params.offset) keyParts.push(`offset:${params.offset}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["project.created", "project.updated", "project.deleted"],
  },

  description: "List projects with optional filters",
});

/**
 * Get a single project by ID
 */
export const projectsGetQuery = defineQuery<ProjectQueryResult, ProjectsGetParams>({
  name: "projects.get",

  fetch: async (params, _context: QueryContext) => {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getByIdOrThrow(rootDb, params.projectId);
    return toProjectQueryResult(project);
  },

  cache: {
    ttl: 60_000, // 1 minute
    scope: "global",
    key: (params) => ["projects.get", params.projectId],
  },

  realtime: {
    events: ["project.updated", "project.deleted"],
  },

  description: "Get a single project by ID",
});

/**
 * Count projects
 */
export const projectsCountQuery = defineQuery<number, ProjectsCountParams>({
  name: "projects.count",

  fetch: async (params, _context: QueryContext) => {
    const rootDb = DatabaseManager.getRootDb();
    return ProjectService.count(rootDb, {
      ownerId: params.ownerId,
      memberId: params.memberId,
      includeArchived: params.includeArchived,
    });
  },

  cache: {
    ttl: 30_000, // 30 seconds
    scope: "global",
    key: (params) => {
      const keyParts = ["projects.count"];
      if (params.ownerId) keyParts.push(`owner:${params.ownerId}`);
      if (params.memberId) keyParts.push(`member:${params.memberId}`);
      if (params.includeArchived) keyParts.push("archived:true");
      return keyParts;
    },
  },

  description: "Count projects with optional filters",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a project
 */
export const projectsCreateMutation = defineMutation<ProjectsCreateParams, ProjectQueryResult>({
  name: "projects.create",

  execute: async (params, _context: MutationContext) => {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.create(rootDb, params);
    return toProjectQueryResult(project);
  },

  invalidates: ["projects.list", "projects.count"],

  description: "Create a new project",
});

/**
 * Update a project
 */
export const projectsUpdateMutation = defineMutation<ProjectsUpdateParams, ProjectQueryResult>({
  name: "projects.update",

  execute: async (params, _context: MutationContext) => {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.update(rootDb, params.projectId, params.data);
    return toProjectQueryResult(project);
  },

  invalidates: ["projects.list"],
  invalidateKeys: (params) => [["projects.get", params.projectId]],

  description: "Update an existing project",
});

/**
 * Delete (archive) a project
 */
export const projectsDeleteMutation = defineMutation<ProjectsDeleteParams, { deleted: boolean }>({
  name: "projects.delete",

  execute: async (params, _context: MutationContext) => {
    const rootDb = DatabaseManager.getRootDb();

    if (params.permanent) {
      ProjectService.permanentDelete(rootDb, params.projectId);
    } else {
      ProjectService.delete(rootDb, params.projectId);
    }

    return { deleted: true };
  },

  invalidates: ["projects.list", "projects.count"],
  invalidateKeys: (params) => [["projects.get", params.projectId]],

  description: "Delete (archive) a project",
});
