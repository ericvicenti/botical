/**
 * Message Query Definitions (Frontend)
 *
 * Queries and mutations for message operations.
 * Messages are project-scoped and support real-time streaming.
 */

import type { Query, Mutation } from "./types";

// ============================================
// Query Result Types
// ============================================

/**
 * Message returned by queries
 */
export interface MessageQueryResult {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  parentId: string | null;
  providerId: string | null;
  modelId: string | null;
  agent: string | null;
  finishReason: "stop" | "tool-calls" | "length" | "error" | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
}

/**
 * Message part returned by queries
 */
export interface MessagePartQueryResult {
  id: string;
  messageId: string;
  sessionId: string;
  type: "text" | "reasoning" | "tool-call" | "tool-result" | "file" | "step-start" | "step-finish";
  content: unknown;
  toolName: string | null;
  toolCallId: string | null;
  toolStatus: "pending" | "running" | "completed" | "error" | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Message with its parts
 */
export interface MessageWithPartsQueryResult extends MessageQueryResult {
  parts: MessagePartQueryResult[];
}

// ============================================
// Query Parameters
// ============================================

export interface MessagesListParams {
  projectId: string;
  sessionId: string;
  limit?: number;
  offset?: number;
}

export interface MessagesGetParams {
  projectId: string;
  messageId: string;
}

export interface MessagePartsListParams {
  projectId: string;
  messageId: string;
}

// ============================================
// Mutation Parameters
// ============================================

export interface MessagesCreateParams {
  projectId: string;
  data: {
    sessionId: string;
    role: "user" | "assistant" | "system";
    parentId?: string | null;
    providerId?: string | null;
    modelId?: string | null;
    agent?: string | null;
  };
}

export interface MessagesDeleteParams {
  projectId: string;
  messageId: string;
}

// ============================================
// Query Definitions
// ============================================

export const messagesListQuery: Query<MessageQueryResult[], MessagesListParams> = {
  name: "messages.list",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}/messages`,
  method: "GET",
  params: (params) => ({
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["messages.list", params.projectId, params.sessionId],
  },
  realtime: {
    events: ["message.created", "message.updated", "message.completed"],
  },
  description: "List messages for a session",
};

export const messagesGetQuery: Query<MessageWithPartsQueryResult, MessagesGetParams> = {
  name: "messages.get",
  endpoint: (params) => `/api/projects/${params.projectId}/messages/${params.messageId}`,
  method: "GET",
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["messages.get", params.projectId, params.messageId],
  },
  realtime: {
    events: ["message.updated", "message.completed", "message.part.created", "message.part.updated"],
  },
  description: "Get a single message with its parts",
};

export const messagePartsListQuery: Query<MessagePartQueryResult[], MessagePartsListParams> = {
  name: "messages.parts.list",
  endpoint: (params) => `/api/projects/${params.projectId}/messages/${params.messageId}/parts`,
  method: "GET",
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["messages.parts.list", params.projectId, params.messageId],
  },
  realtime: {
    events: ["message.part.created", "message.part.updated"],
  },
  description: "List message parts for a message",
};

// ============================================
// Mutation Definitions
// ============================================

export const messagesCreateMutation: Mutation<MessagesCreateParams, MessageQueryResult> = {
  name: "messages.create",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.data.sessionId}/messages`,
  method: "POST",
  body: (params) => params.data,
  invalidates: ["messages.list"],
  description: "Create a new message",
};

export const messagesDeleteMutation: Mutation<MessagesDeleteParams, { deleted: boolean }> = {
  name: "messages.delete",
  endpoint: (params) => `/api/projects/${params.projectId}/messages/${params.messageId}`,
  method: "DELETE",
  invalidates: ["messages.list"],
  invalidateKeys: (params) => [
    ["messages.get", params.projectId, params.messageId],
    ["messages.parts.list", params.projectId, params.messageId],
  ],
  description: "Delete a message",
};
