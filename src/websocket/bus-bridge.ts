/**
 * Event Bus Bridge
 *
 * Bridges internal EventBus events to WebSocket clients.
 * See: docs/implementation-plan/05-realtime-communication.md#event-bus-integration
 *
 * Event routing:
 * - session.* events → project room (all connections for that project)
 * - message.* events → session room (connections subscribed to that session)
 * - file.* events → project room
 * - project.* events → project room
 */

import { EventBus, type Subscription } from "@/bus/index.ts";
import { ConnectionManager } from "./connections.ts";
import { RoomManager, getProjectRoom, getSessionRoom } from "./rooms.ts";
import { createEvent, type EventType } from "./protocol.ts";

// Track active subscriptions for cleanup
const subscriptions: Subscription[] = [];

/**
 * Map internal event type to WebSocket event type
 */
function mapEventType(internalType: string): EventType | null {
  // Direct mappings for known event types
  const mappings: Record<string, EventType> = {
    "session.created": "session.created",
    "session.updated": "session.updated",
    "session.deleted": "session.deleted",
    "message.created": "message.created",
    "message.text.delta": "message.text.delta",
    "message.tool.call": "message.tool.call",
    "message.tool.result": "message.tool.result",
    "message.complete": "message.complete",
    "message.error": "message.error",
    "file.updated": "file.updated",
    "file.deleted": "file.deleted",
    "process.spawned": "process.spawned",
    "process.output": "process.output",
    "process.exited": "process.exited",
    "process.killed": "process.killed",
  };

  return mappings[internalType] ?? null;
}

/**
 * Set up the event bus bridge
 *
 * Subscribes to all internal events and routes them to appropriate
 * WebSocket rooms based on event type and context.
 */
export function setupBusBridge(): void {
  // Subscribe to session events → broadcast to project room
  const sessionSub = EventBus.subscribe("session.*", (envelope) => {
    const { projectId, event } = envelope;
    if (!projectId) return;

    const wsEventType = mapEventType(event.type);
    if (!wsEventType) return;

    const wsEvent = createEvent(wsEventType, event.payload);
    RoomManager.broadcast(getProjectRoom(projectId), wsEvent);
  });
  subscriptions.push(sessionSub);

  // Subscribe to message events → broadcast to session room
  const messageSub = EventBus.subscribe("message.*", (envelope) => {
    const { projectId, event } = envelope;
    if (!projectId) return;

    const wsEventType = mapEventType(event.type);
    if (!wsEventType) return;

    // Extract sessionId from payload
    const payload = event.payload as { sessionId?: string };
    if (!payload.sessionId) return;

    const wsEvent = createEvent(wsEventType, event.payload);

    // Broadcast to session subscribers
    RoomManager.broadcast(getSessionRoom(payload.sessionId), wsEvent);

    // Also broadcast to project room for clients that want all events
    RoomManager.broadcast(getProjectRoom(projectId), wsEvent);
  });
  subscriptions.push(messageSub);

  // Subscribe to file events → broadcast to project room
  const fileSub = EventBus.subscribe("file.*", (envelope) => {
    const { projectId, event } = envelope;
    if (!projectId) return;

    const wsEventType = mapEventType(event.type);
    if (!wsEventType) return;

    const wsEvent = createEvent(wsEventType, event.payload);
    RoomManager.broadcast(getProjectRoom(projectId), wsEvent);
  });
  subscriptions.push(fileSub);

  // Subscribe to project events → broadcast to project room
  const projectSub = EventBus.subscribe("project.*", (envelope) => {
    const { event } = envelope;

    // Extract projectId from payload for project events
    const payload = event.payload as { projectId?: string };
    if (!payload.projectId) return;

    // For now we don't have a specific WebSocket event type for project events
    // They could be added to the protocol if needed
  });
  subscriptions.push(projectSub);

  // Subscribe to process events → broadcast to project room
  const processSub = EventBus.subscribe("process.*", (envelope) => {
    const { projectId, event } = envelope;
    if (!projectId) return;

    const wsEventType = mapEventType(event.type);
    if (!wsEventType) return;

    const wsEvent = createEvent(wsEventType, event.payload);
    RoomManager.broadcast(getProjectRoom(projectId), wsEvent);
  });
  subscriptions.push(processSub);

  console.log("[WebSocket] Event bus bridge initialized");
}

/**
 * Tear down the event bus bridge
 *
 * Unsubscribes from all events. Useful for testing or graceful shutdown.
 */
export function teardownBusBridge(): void {
  for (const sub of subscriptions) {
    sub.unsubscribe();
  }
  subscriptions.length = 0;

  console.log("[WebSocket] Event bus bridge torn down");
}

/**
 * Get count of active bridge subscriptions
 */
export function getBridgeSubscriptionCount(): number {
  return subscriptions.length;
}
