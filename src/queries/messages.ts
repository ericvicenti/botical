/**
 * Message Query Definitions
 *
 * Queries and mutations for message operations.
 * Messages are project-scoped and support real-time streaming.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  MessageService,
  MessagePartService,
  type Message,
  type MessagePart,
  type MessageCreateInput,
} from "../services/messages.ts";

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
  data: MessageCreateInput;
}

export interface MessagesDeleteParams {
  projectId: string;
  messageId: string;
}

// ============================================
// Helper Functions
// ============================================

function toMessageQueryResult(message: Message): MessageQueryResult {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    parentId: message.parentId,
    providerId: message.providerId,
    modelId: message.modelId,
    agent: message.agent,
    finishReason: message.finishReason,
    cost: message.cost,
    tokensInput: message.tokensInput,
    tokensOutput: message.tokensOutput,
    tokensReasoning: message.tokensReasoning,
    tokensCacheRead: message.tokensCacheRead,
    tokensCacheWrite: message.tokensCacheWrite,
    errorType: message.errorType,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt,
    completedAt: message.completedAt,
  };
}

function toMessagePartQueryResult(part: MessagePart): MessagePartQueryResult {
  return {
    id: part.id,
    messageId: part.messageId,
    sessionId: part.sessionId,
    type: part.type,
    content: part.content,
    toolName: part.toolName,
    toolCallId: part.toolCallId,
    toolStatus: part.toolStatus,
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List messages for a session
 */
export const messagesListQuery = defineQuery<MessageQueryResult[], MessagesListParams>({
  name: "messages.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const messages = MessageService.listBySession(db, params.sessionId, {
      limit: params.limit,
      offset: params.offset,
    });

    return messages.map(toMessageQueryResult);
  },

  cache: {
    ttl: 5_000, // 5 seconds - messages stream frequently
    scope: "project",
    key: (params) => ["messages.list", params.projectId, params.sessionId],
  },

  realtime: {
    events: ["message.created", "message.updated", "message.completed"],
  },

  description: "List messages for a session",
});

/**
 * Get a single message with its parts
 */
export const messagesGetQuery = defineQuery<MessageWithPartsQueryResult, MessagesGetParams>({
  name: "messages.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const message = MessageService.getByIdOrThrow(db, params.messageId);
    const parts = MessagePartService.listByMessage(db, params.messageId);

    return {
      ...toMessageQueryResult(message),
      parts: parts.map(toMessagePartQueryResult),
    };
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["messages.get", params.projectId, params.messageId],
  },

  realtime: {
    events: ["message.updated", "message.completed", "message.part.created", "message.part.updated"],
  },

  description: "Get a single message with its parts",
});

/**
 * List message parts for a message
 */
export const messagePartsListQuery = defineQuery<MessagePartQueryResult[], MessagePartsListParams>({
  name: "messages.parts.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const parts = MessagePartService.listByMessage(db, params.messageId);
    return parts.map(toMessagePartQueryResult);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["messages.parts.list", params.projectId, params.messageId],
  },

  realtime: {
    events: ["message.part.created", "message.part.updated"],
  },

  description: "List message parts for a message",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a message
 */
export const messagesCreateMutation = defineMutation<MessagesCreateParams, MessageQueryResult>({
  name: "messages.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const message = MessageService.create(db, params.data);
    return toMessageQueryResult(message);
  },

  invalidates: ["messages.list"],

  description: "Create a new message",
});

/**
 * Delete a message
 */
export const messagesDeleteMutation = defineMutation<MessagesDeleteParams, { deleted: boolean }>({
  name: "messages.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    MessageService.delete(db, params.messageId);
    return { deleted: true };
  },

  invalidates: ["messages.list"],
  invalidateKeys: (params) => [
    ["messages.get", params.projectId, params.messageId],
    ["messages.parts.list", params.projectId, params.messageId],
  ],

  description: "Delete a message",
});
