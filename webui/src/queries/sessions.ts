/**
 * Session Query Definitions (Frontend)
 *
 * Queries and mutations for session operations.
 * Sessions are project-scoped and support real-time updates.
 */

import type { Query, Mutation } from "./types";

/**
 * Session returned by queries
 */
export interface SessionQueryResult {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  status: "active" | "archived" | "deleted";
  agent: string;
  providerId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  messageCount: number;
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  shareUrl: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

// ============================================
// Query Parameters
// ============================================

export interface SessionsListParams {
  projectId: string;
  status?: "active" | "archived";
  parentId?: string | null;
  agent?: string;
  limit?: number;
  offset?: number;
}

export interface SessionsGetParams {
  projectId: string;
  sessionId: string;
}

export interface SessionsCountParams {
  projectId: string;
  status?: "active" | "archived";
}

// ============================================
// Mutation Parameters
// ============================================

export interface SessionsCreateParams {
  projectId: string;
  data: {
    slug?: string;
    parentId?: string | null;
    title?: string;
    agent?: string;
    providerId?: string | null;
    modelId?: string | null;
    systemPrompt?: string | null;
  };
}

export interface SessionsUpdateParams {
  projectId: string;
  sessionId: string;
  data: {
    slug?: string;
    parentId?: string | null;
    title?: string;
    status?: "active" | "archived" | "deleted";
    agent?: string;
    providerId?: string | null;
    modelId?: string | null;
    systemPrompt?: string | null;
    shareUrl?: string | null;
  };
}

export interface SessionsDeleteParams {
  projectId: string;
  sessionId: string;
}

export interface SessionsUpdateSystemPromptParams {
  projectId: string;
  sessionId: string;
  systemPrompt: string | null;
}

// ============================================
// Query Definitions
// ============================================

export const sessionsListQuery: Query<SessionQueryResult[], SessionsListParams> = {
  name: "sessions.list",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
    ...(params.parentId !== undefined && { parentId: params.parentId ?? "null" }),
    ...(params.agent && { agent: params.agent }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["sessions.list", params.projectId];
      if (params.status) keyParts.push(`status:${params.status}`);
      if (params.parentId !== undefined) keyParts.push(`parent:${params.parentId ?? "null"}`);
      if (params.agent) keyParts.push(`agent:${params.agent}`);
      return keyParts;
    },
  },
  realtime: {
    events: ["session.created", "session.updated", "session.deleted"],
  },
  description: "List sessions for a project",
};

export const sessionsGetQuery: Query<SessionQueryResult, SessionsGetParams> = {
  name: "sessions.get",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}`,
  method: "GET",
  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["sessions.get", params.projectId, params.sessionId],
  },
  realtime: {
    events: ["session.updated", "session.deleted"],
  },
  description: "Get a single session by ID",
};

export const sessionsCountQuery: Query<{ count: number }, SessionsCountParams> = {
  name: "sessions.count",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/count`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
  }),
  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["sessions.count", params.projectId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },
  description: "Count sessions for a project",
};

// ============================================
// Mutation Definitions
// ============================================

export const sessionsCreateMutation: Mutation<SessionsCreateParams, SessionQueryResult> = {
  name: "sessions.create",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions`,
  method: "POST",
  body: (params) => params.data,
  invalidates: ["sessions.list", "sessions.count"],
  description: "Create a new session",
};

export const sessionsUpdateMutation: Mutation<SessionsUpdateParams, SessionQueryResult> = {
  name: "sessions.update",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}`,
  method: "PUT",
  body: (params) => params.data,
  invalidates: ["sessions.list"],
  invalidateKeys: (params) => [
    ["sessions.get", params.projectId, params.sessionId],
  ],
  description: "Update an existing session",
};

export const sessionsDeleteMutation: Mutation<SessionsDeleteParams, { deleted: boolean }> = {
  name: "sessions.delete",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}`,
  method: "DELETE",
  invalidates: ["sessions.list", "sessions.count"],
  invalidateKeys: (params) => [
    ["sessions.get", params.projectId, params.sessionId],
  ],
  description: "Delete a session",
};

export const sessionsUpdateSystemPromptMutation: Mutation<SessionsUpdateSystemPromptParams, SessionQueryResult> = {
  name: "sessions.updateSystemPrompt",
  endpoint: (params) => `/api/sessions/${params.sessionId}/system-prompt`,
  method: "PATCH",
  body: (params) => ({ 
    projectId: params.projectId, 
    systemPrompt: params.systemPrompt 
  }),
  invalidateKeys: (params) => [
    ["sessions.get", params.projectId, params.sessionId],
  ],
  description: "Update the system prompt for a session",
};
