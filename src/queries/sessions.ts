/**
 * Session Query Definitions
 *
 * Queries and mutations for session operations.
 * Sessions are project-scoped and support real-time updates.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  SessionService,
  type Session,
  type SessionCreateInput,
  type SessionUpdateInput,
} from "../services/sessions.ts";

// ============================================
// Query Result Types
// ============================================

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
  data: SessionCreateInput;
}

export interface SessionsUpdateParams {
  projectId: string;
  sessionId: string;
  data: SessionUpdateInput;
}

export interface SessionsDeleteParams {
  projectId: string;
  sessionId: string;
}

// ============================================
// Helper Functions
// ============================================

function toSessionQueryResult(session: Session): SessionQueryResult {
  return {
    id: session.id,
    slug: session.slug,
    parentId: session.parentId,
    title: session.title,
    status: session.status,
    agent: session.agent,
    providerId: session.providerId,
    modelId: session.modelId,
    messageCount: session.messageCount,
    totalCost: session.totalCost,
    totalTokensInput: session.totalTokensInput,
    totalTokensOutput: session.totalTokensOutput,
    shareUrl: session.shareUrl,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archivedAt: session.archivedAt,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List sessions for a project
 */
export const sessionsListQuery = defineQuery<SessionQueryResult[], SessionsListParams>({
  name: "sessions.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const sessions = SessionService.list(db, {
      status: params.status,
      parentId: params.parentId,
      agent: params.agent,
      limit: params.limit,
      offset: params.offset,
    });

    return sessions.map(toSessionQueryResult);
  },

  cache: {
    ttl: 10_000, // 10 seconds - sessions update frequently
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
});

/**
 * Get a single session by ID
 */
export const sessionsGetQuery = defineQuery<SessionQueryResult, SessionsGetParams>({
  name: "sessions.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const session = SessionService.getByIdOrThrow(db, params.sessionId);
    return toSessionQueryResult(session);
  },

  cache: {
    ttl: 10_000, // 10 seconds
    scope: "project",
    key: (params) => ["sessions.get", params.projectId, params.sessionId],
  },

  realtime: {
    events: ["session.updated", "session.deleted"],
  },

  description: "Get a single session by ID",
});

/**
 * Count sessions for a project
 */
export const sessionsCountQuery = defineQuery<number, SessionsCountParams>({
  name: "sessions.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return SessionService.count(db, params.status);
  },

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
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a session
 */
export const sessionsCreateMutation = defineMutation<SessionsCreateParams, SessionQueryResult>({
  name: "sessions.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const session = SessionService.create(db, params.data);
    return toSessionQueryResult(session);
  },

  invalidates: ["sessions.list", "sessions.count"],

  description: "Create a new session",
});

/**
 * Update a session
 */
export const sessionsUpdateMutation = defineMutation<SessionsUpdateParams, SessionQueryResult>({
  name: "sessions.update",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const session = SessionService.update(db, params.sessionId, params.data);
    return toSessionQueryResult(session);
  },

  invalidates: ["sessions.list"],
  invalidateKeys: (params) => [
    ["sessions.get", params.projectId, params.sessionId],
  ],

  description: "Update an existing session",
});

/**
 * Delete a session
 */
export const sessionsDeleteMutation = defineMutation<SessionsDeleteParams, { deleted: boolean }>({
  name: "sessions.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    SessionService.delete(db, params.sessionId);
    return { deleted: true };
  },

  invalidates: ["sessions.list", "sessions.count"],
  invalidateKeys: (params) => [
    ["sessions.get", params.projectId, params.sessionId],
  ],

  description: "Delete a session",
});
