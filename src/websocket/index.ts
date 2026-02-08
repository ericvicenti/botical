/**
 * WebSocket Module
 *
 * Real-time communication layer for Botical.
 * See: docs/implementation-plan/05-realtime-communication.md
 *
 * This module provides:
 * - WebSocket connection management
 * - Room/channel subscriptions
 * - Event bus integration for real-time updates
 * - State synchronization for reconnection
 */

// Core components
export {
  ConnectionManager,
  type WebSocketConnection,
  type ConnectionInfo,
  type WSData,
} from "./connections.ts";

export {
  RoomManager,
  getProjectRoom,
  getSessionRoom,
} from "./rooms.ts";

// Protocol types
export {
  WSRequest,
  WSResponse,
  WSEvent,
  WSError,
  RequestType,
  EventType,
  createResponse,
  createErrorResponse,
  createEvent,
} from "./protocol.ts";

// Handlers
export { handleRequest } from "./handlers/index.ts";
export { SessionHandlers } from "./handlers/sessions.ts";
export { MessageHandlers } from "./handlers/messages.ts";
export {
  ToolHandlers,
  registerPendingApproval,
  removePendingApproval,
} from "./handlers/tools.ts";
export { SubscriptionHandlers } from "./handlers/subscriptions.ts";

// Event bus bridge
export {
  setupBusBridge,
  teardownBusBridge,
  getBridgeSubscriptionCount,
} from "./bus-bridge.ts";

// State sync
export { StateSync, type SessionState, type MessageWithParts } from "./sync.ts";

// Handler setup
export { createWebSocketHandler } from "./handler.ts";
