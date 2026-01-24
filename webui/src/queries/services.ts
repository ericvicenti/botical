/**
 * Service Query Definitions (Frontend)
 *
 * Queries and mutations for service configuration operations.
 */

import type { Query, Mutation } from "./types";

/**
 * Service configuration returned by queries
 */
export interface ServiceQueryResult {
  id: string;
  projectId: string;
  name: string;
  command: string;
  cwd: string | null;
  env: Record<string, string> | null;
  autoStart: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServicesListParams {
  projectId: string;
  autoStart?: boolean;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface ServicesGetParams {
  projectId: string;
  serviceId: string;
}

export interface ServicesCountParams {
  projectId: string;
  autoStart?: boolean;
  enabled?: boolean;
}

export interface ServicesCreateParams {
  data: {
    projectId: string;
    name: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    autoStart?: boolean;
    enabled?: boolean;
    createdBy: string;
  };
}

export interface ServicesUpdateParams {
  projectId: string;
  serviceId: string;
  data: {
    name?: string;
    command?: string;
    cwd?: string | null;
    env?: Record<string, string> | null;
    autoStart?: boolean;
    enabled?: boolean;
  };
}

export interface ServicesDeleteParams {
  projectId: string;
  serviceId: string;
}

// ============================================
// Query Definitions
// ============================================

export const servicesListQuery: Query<ServiceQueryResult[], ServicesListParams> = {
  name: "services.list",
  endpoint: (params) => `/api/projects/${params.projectId}/services`,
  method: "GET",
  params: (params) => ({
    ...(params.autoStart !== undefined && { autoStart: String(params.autoStart) }),
    ...(params.enabled !== undefined && { enabled: String(params.enabled) }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 30_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["services.list", params.projectId];
      if (params.autoStart !== undefined) keyParts.push(`autoStart:${params.autoStart}`);
      if (params.enabled !== undefined) keyParts.push(`enabled:${params.enabled}`);
      return keyParts;
    },
  },
  realtime: {
    events: ["service.created", "service.updated", "service.deleted"],
  },
  description: "List services for a project",
};

export const servicesGetQuery: Query<ServiceQueryResult, ServicesGetParams> = {
  name: "services.get",
  endpoint: (params) => `/api/projects/${params.projectId}/services/${params.serviceId}`,
  method: "GET",
  cache: {
    ttl: 30_000,
    scope: "project",
    key: (params) => ["services.get", params.projectId, params.serviceId],
  },
  realtime: {
    events: ["service.updated", "service.deleted"],
  },
  description: "Get a single service by ID",
};

export const servicesCountQuery: Query<{ count: number }, ServicesCountParams> = {
  name: "services.count",
  endpoint: (params) => `/api/projects/${params.projectId}/services/count`,
  method: "GET",
  params: (params) => ({
    ...(params.autoStart !== undefined && { autoStart: String(params.autoStart) }),
    ...(params.enabled !== undefined && { enabled: String(params.enabled) }),
  }),
  cache: {
    ttl: 30_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["services.count", params.projectId];
      if (params.autoStart !== undefined) keyParts.push(`autoStart:${params.autoStart}`);
      if (params.enabled !== undefined) keyParts.push(`enabled:${params.enabled}`);
      return keyParts;
    },
  },
  description: "Count services for a project",
};

// ============================================
// Mutation Definitions
// ============================================

export const servicesCreateMutation: Mutation<ServicesCreateParams, ServiceQueryResult> = {
  name: "services.create",
  endpoint: (params) => `/api/projects/${params.data.projectId}/services`,
  method: "POST",
  body: (params) => params.data,
  invalidates: ["services.list", "services.count"],
  description: "Create a new service configuration",
};

export const servicesUpdateMutation: Mutation<ServicesUpdateParams, ServiceQueryResult> = {
  name: "services.update",
  endpoint: (params) => `/api/projects/${params.projectId}/services/${params.serviceId}`,
  method: "PUT",
  body: (params) => params.data,
  invalidates: ["services.list"],
  invalidateKeys: (params) => [
    ["services.get", params.projectId, params.serviceId],
  ],
  description: "Update an existing service configuration",
};

export const servicesDeleteMutation: Mutation<ServicesDeleteParams, { deleted: boolean }> = {
  name: "services.delete",
  endpoint: (params) => `/api/projects/${params.projectId}/services/${params.serviceId}`,
  method: "DELETE",
  invalidates: ["services.list", "services.count"],
  invalidateKeys: (params) => [
    ["services.get", params.projectId, params.serviceId],
  ],
  description: "Delete a service configuration",
};
