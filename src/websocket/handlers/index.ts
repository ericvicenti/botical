/**
 * WebSocket Request Handler Registry
 *
 * Routes incoming WebSocket requests to appropriate handlers.
 * See: docs/implementation-plan/05-realtime-communication.md#request-handlers
 */

import type { RequestType, WSRequest } from "../protocol.ts";
import type { WSData } from "../connections.ts";
import { SessionHandlers } from "./sessions.ts";
import { MessageHandlers } from "./messages.ts";
import { ToolHandlers } from "./tools.ts";
import { SubscriptionHandlers } from "./subscriptions.ts";

/**
 * Handler function type
 */
type Handler = (payload: unknown, ctx: WSData) => Promise<unknown>;

/**
 * Registry of handlers by request type
 */
const handlers: Record<RequestType, Handler> = {
  // Session handlers
  "session.create": SessionHandlers.create,
  "session.list": SessionHandlers.list,
  "session.get": SessionHandlers.get,
  "session.delete": SessionHandlers.delete,

  // Message handlers
  "message.send": MessageHandlers.send,
  "message.cancel": MessageHandlers.cancel,
  "message.retry": MessageHandlers.retry,

  // Tool handlers
  "tool.approve": ToolHandlers.approve,
  "tool.reject": ToolHandlers.reject,

  // Subscription handlers
  subscribe: SubscriptionHandlers.subscribe,
  unsubscribe: SubscriptionHandlers.unsubscribe,

  // Ping handler
  ping: async () => ({ pong: Date.now() }),
};

/**
 * Handle a WebSocket request
 */
export async function handleRequest(
  request: WSRequest,
  ctx: WSData
): Promise<unknown> {
  const handler = handlers[request.type];

  if (!handler) {
    throw new Error(`Unknown request type: ${request.type}`);
  }

  return handler(request.payload, ctx);
}

// Re-export handlers for direct access if needed
export { SessionHandlers } from "./sessions.ts";
export { MessageHandlers } from "./messages.ts";
export { ToolHandlers, registerPendingApproval, removePendingApproval } from "./tools.ts";
export { SubscriptionHandlers } from "./subscriptions.ts";
