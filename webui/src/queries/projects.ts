/**
 * Project Query Definitions (Frontend)
 *
 * Queries and mutations for project operations.
 */

import type { Query, Mutation } from "./types";

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

export interface ProjectsCreateParams {
  name: string;
  ownerId: string;
  type?: "local" | "remote";
  description?: string;
  path?: string;
  gitRemote?: string;
  iconUrl?: string;
  color?: string;
  settings?: Record<string, unknown>;
}

export interface ProjectsUpdateParams {
  projectId: string;
  data: {
    name?: string;
    description?: string | null;
    path?: string | null;
    gitRemote?: string | null;
    iconUrl?: string | null;
    color?: string | null;
    settings?: Record<string, unknown>;
  };
}

export interface ProjectsDeleteParams {
  projectId: string;
  permanent?: boolean;
}

// ============================================
// Query Definitions
// ============================================

export const projectsListQuery: Query<ProjectQueryResult[], ProjectsListParams> = {
  name: "projects.list",
  endpoint: "/api/projects",
  method: "GET",
  params: (params) => ({
    ...(params.ownerId && { ownerId: params.ownerId }),
    ...(params.memberId && { memberId: params.memberId }),
    ...(params.type && { type: params.type }),
    ...(params.includeArchived && { includeArchived: "true" }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 30_000,
    scope: "global",
    key: (params) => {
      const keyParts = ["projects.list"];
      if (params.ownerId) keyParts.push(`owner:${params.ownerId}`);
      if (params.memberId) keyParts.push(`member:${params.memberId}`);
      if (params.type) keyParts.push(`type:${params.type}`);
      if (params.includeArchived) keyParts.push("archived:true");
      return keyParts;
    },
  },
  realtime: {
    events: ["project.created", "project.updated", "project.deleted"],
  },
  description: "List projects with optional filters",
};

export const projectsGetQuery: Query<ProjectQueryResult, ProjectsGetParams> = {
  name: "projects.get",
  endpoint: (params) => `/api/projects/${params.projectId}`,
  method: "GET",
  cache: {
    ttl: 60_000,
    scope: "global",
    key: (params) => ["projects.get", params.projectId],
  },
  realtime: {
    events: ["project.updated", "project.deleted"],
  },
  description: "Get a single project by ID",
};

export const projectsCountQuery: Query<{ count: number }, ProjectsCountParams> = {
  name: "projects.count",
  endpoint: "/api/projects/count",
  method: "GET",
  params: (params) => ({
    ...(params.ownerId && { ownerId: params.ownerId }),
    ...(params.memberId && { memberId: params.memberId }),
    ...(params.includeArchived && { includeArchived: "true" }),
  }),
  cache: {
    ttl: 30_000,
    scope: "global",
    key: (params) => {
      const keyParts = ["projects.count"];
      if (params.ownerId) keyParts.push(`owner:${params.ownerId}`);
      if (params.memberId) keyParts.push(`member:${params.memberId}`);
      return keyParts;
    },
  },
  description: "Count projects with optional filters",
};

// ============================================
// Mutation Definitions
// ============================================

export const projectsCreateMutation: Mutation<ProjectsCreateParams, ProjectQueryResult> = {
  name: "projects.create",
  endpoint: "/api/projects",
  method: "POST",
  body: (params) => params,
  invalidates: ["projects.list", "projects.count"],
  description: "Create a new project",
};

export const projectsUpdateMutation: Mutation<ProjectsUpdateParams, ProjectQueryResult> = {
  name: "projects.update",
  endpoint: (params) => `/api/projects/${params.projectId}`,
  method: "PUT",
  body: (params) => params.data,
  invalidates: ["projects.list"],
  invalidateKeys: (params) => [["projects.get", params.projectId]],
  description: "Update an existing project",
};

export const projectsDeleteMutation: Mutation<ProjectsDeleteParams, { deleted: boolean }> = {
  name: "projects.delete",
  endpoint: (params) => `/api/projects/${params.projectId}${params.permanent ? "?permanent=true" : ""}`,
  method: "DELETE",
  invalidates: ["projects.list", "projects.count"],
  invalidateKeys: (params) => [["projects.get", params.projectId]],
  description: "Delete (archive) a project",
};
