/**
 * Service Query Definitions
 *
 * Queries and mutations for service configuration operations.
 * Services are project-scoped (use project database).
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  ServiceConfigService,
  type Service,
  type ServiceCreateInput,
  type ServiceUpdateInput,
} from "../services/service-config.ts";

// ============================================
// Query Result Types
// ============================================

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

// ============================================
// Query Parameters
// ============================================

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

// ============================================
// Mutation Parameters
// ============================================

export interface ServicesCreateParams {
  data: ServiceCreateInput;
}

export interface ServicesUpdateParams {
  projectId: string;
  serviceId: string;
  data: ServiceUpdateInput;
}

export interface ServicesDeleteParams {
  projectId: string;
  serviceId: string;
}

// ============================================
// Helper Functions
// ============================================

function toServiceQueryResult(service: Service): ServiceQueryResult {
  return {
    id: service.id,
    projectId: service.projectId,
    name: service.name,
    command: service.command,
    cwd: service.cwd,
    env: service.env,
    autoStart: service.autoStart,
    enabled: service.enabled,
    createdBy: service.createdBy,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List services for a project
 */
export const servicesListQuery = defineQuery<ServiceQueryResult[], ServicesListParams>({
  name: "services.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const services = ServiceConfigService.listByProject(db, params.projectId, {
      autoStart: params.autoStart,
      enabled: params.enabled,
      limit: params.limit,
      offset: params.offset,
    });

    return services.map(toServiceQueryResult);
  },

  cache: {
    ttl: 30_000, // 30 seconds
    scope: "project",
    key: (params) => {
      const keyParts = ["services.list", params.projectId];
      if (params.autoStart !== undefined) keyParts.push(`autoStart:${params.autoStart}`);
      if (params.enabled !== undefined) keyParts.push(`enabled:${params.enabled}`);
      if (params.limit) keyParts.push(`limit:${params.limit}`);
      if (params.offset) keyParts.push(`offset:${params.offset}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["service.created", "service.updated", "service.deleted"],
  },

  description: "List services for a project",
});

/**
 * Get a single service by ID
 */
export const servicesGetQuery = defineQuery<ServiceQueryResult, ServicesGetParams>({
  name: "services.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const service = ServiceConfigService.getByIdOrThrow(db, params.serviceId);
    return toServiceQueryResult(service);
  },

  cache: {
    ttl: 30_000, // 30 seconds
    scope: "project",
    key: (params) => ["services.get", params.projectId, params.serviceId],
  },

  realtime: {
    events: ["service.updated", "service.deleted"],
  },

  description: "Get a single service by ID",
});

/**
 * Count services for a project
 */
export const servicesCountQuery = defineQuery<number, ServicesCountParams>({
  name: "services.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return ServiceConfigService.count(db, params.projectId, {
      autoStart: params.autoStart,
      enabled: params.enabled,
    });
  },

  cache: {
    ttl: 30_000, // 30 seconds
    scope: "project",
    key: (params) => {
      const keyParts = ["services.count", params.projectId];
      if (params.autoStart !== undefined) keyParts.push(`autoStart:${params.autoStart}`);
      if (params.enabled !== undefined) keyParts.push(`enabled:${params.enabled}`);
      return keyParts;
    },
  },

  description: "Count services for a project",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a service
 */
export const servicesCreateMutation = defineMutation<ServicesCreateParams, ServiceQueryResult>({
  name: "services.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.data.projectId);
    const service = ServiceConfigService.create(db, params.data);
    return toServiceQueryResult(service);
  },

  invalidates: ["services.list", "services.count"],

  description: "Create a new service configuration",
});

/**
 * Update a service
 */
export const servicesUpdateMutation = defineMutation<ServicesUpdateParams, ServiceQueryResult>({
  name: "services.update",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const service = ServiceConfigService.update(db, params.serviceId, params.data);
    return toServiceQueryResult(service);
  },

  invalidates: ["services.list"],
  invalidateKeys: (params) => [
    ["services.get", params.projectId, params.serviceId],
  ],

  description: "Update an existing service configuration",
});

/**
 * Delete a service
 */
export const servicesDeleteMutation = defineMutation<ServicesDeleteParams, { deleted: boolean }>({
  name: "services.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    ServiceConfigService.delete(db, params.serviceId);
    return { deleted: true };
  },

  invalidates: ["services.list", "services.count"],
  invalidateKeys: (params) => [
    ["services.get", params.projectId, params.serviceId],
  ],

  description: "Delete a service configuration",
});
