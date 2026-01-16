/**
 * WebSocket Protocol Schemas
 *
 * Defines all message types for WebSocket communication.
 * See: docs/implementation-plan/05-realtime-communication.md#protocol-design
 *
 * Message types:
 * - Request: Client -> Server (with ID for request/response matching)
 * - Response: Server -> Client (matches request ID)
 * - Event: Server -> Client (unprompted, for real-time updates)
 */

import { z } from "zod";

// ============================================================================
// Request Types
// ============================================================================

/**
 * All possible request types that clients can send
 */
export const RequestType = z.enum([
  // Session operations
  "session.create",
  "session.list",
  "session.get",
  "session.delete",

  // Messaging
  "message.send",
  "message.cancel",
  "message.retry",

  // Tool operations
  "tool.approve",
  "tool.reject",

  // Subscriptions
  "subscribe",
  "unsubscribe",

  // Process operations
  "process.write",
  "process.resize",
  "process.kill",

  // Ping/pong
  "ping",
]);

export type RequestType = z.infer<typeof RequestType>;

// ============================================================================
// Request Payloads
// ============================================================================

export const SessionCreatePayload = z.object({
  title: z.string().optional(),
  agent: z.string().optional(),
  parentId: z.string().nullable().optional(),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
});

export const SessionListPayload = z.object({
  status: z.enum(["active", "archived", "deleted"]).optional(),
  agent: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const SessionGetPayload = z.object({
  sessionId: z.string(),
});

export const SessionDeletePayload = z.object({
  sessionId: z.string(),
});

export const MessageSendPayload = z.object({
  sessionId: z.string(),
  content: z.string(),
});

export const MessageCancelPayload = z.object({
  sessionId: z.string(),
});

export const MessageRetryPayload = z.object({
  sessionId: z.string(),
  messageId: z.string(),
});

export const ToolApprovePayload = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
});

export const ToolRejectPayload = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  reason: z.string().optional(),
});

export const SubscribePayload = z.object({
  channel: z.string(),
});

export const UnsubscribePayload = z.object({
  channel: z.string(),
});

export const PingPayload = z.object({}).optional();

export const ProcessWritePayload = z.object({
  id: z.string(),
  data: z.string(),
});

export const ProcessResizePayload = z.object({
  id: z.string(),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
});

export const ProcessKillPayload = z.object({
  id: z.string(),
});

// ============================================================================
// Request Message
// ============================================================================

/**
 * Base request structure from client
 */
export const WSRequest = z.object({
  id: z.string(),
  type: RequestType,
  payload: z.unknown().optional(),
});

export type WSRequest = z.infer<typeof WSRequest>;

// ============================================================================
// Response Message
// ============================================================================

/**
 * Response error structure
 */
export const WSError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type WSError = z.infer<typeof WSError>;

/**
 * Response from server to client
 */
export const WSResponse = z.object({
  id: z.string(),
  type: z.literal("response"),
  success: z.boolean(),
  payload: z.unknown().optional(),
  error: WSError.optional(),
});

export type WSResponse = z.infer<typeof WSResponse>;

// ============================================================================
// Event Message
// ============================================================================

/**
 * Event types that the server pushes to clients
 */
export const EventType = z.enum([
  // Connection events
  "connected",
  "disconnected",

  // Session events
  "session.created",
  "session.updated",
  "session.deleted",
  "session.sync",

  // Message streaming events
  "message.created",
  "message.text.delta",
  "message.text.complete",
  "message.reasoning.delta",
  "message.tool.call",
  "message.tool.result",
  "message.tool.error",
  "message.complete",
  "message.error",

  // Tool approval events
  "tool.approval.required",
  "tool.approval.resolved",

  // File events
  "file.created",
  "file.updated",
  "file.deleted",

  // Mission events
  "mission.created",
  "mission.updated",
  "mission.plan.updated",
  "mission.started",
  "mission.paused",
  "mission.resumed",
  "mission.completed",
  "mission.failed",

  // Task events
  "task.created",
  "task.updated",
  "task.started",
  "task.completed",

  // Process events
  "process.spawned",
  "process.output",
  "process.exited",
  "process.killed",
]);

export type EventType = z.infer<typeof EventType>;

/**
 * Event message pushed from server to client
 */
export const WSEvent = z.object({
  type: EventType,
  payload: z.unknown(),
});

export type WSEvent = z.infer<typeof WSEvent>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a success response
 */
export function createResponse(id: string, payload?: unknown): WSResponse {
  return {
    id,
    type: "response",
    success: true,
    payload,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  id: string,
  code: string,
  message: string,
  details?: unknown
): WSResponse {
  return {
    id,
    type: "response",
    success: false,
    error: { code, message, details },
  };
}

/**
 * Create an event message
 */
export function createEvent(type: EventType, payload: unknown): WSEvent {
  return { type, payload };
}
