import type { QueryClient } from "@tanstack/react-query";

export interface WSEvent {
  type: string;
  payload: Record<string, unknown>;
}

// Debug logging
const DEBUG = true;
function log(message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[WebSocket:events]`, message, data !== undefined ? data : "");
  }
}

// Custom event emitter for streaming events
type StreamingEventHandler = (event: WSEvent) => void;
const streamingHandlers = new Set<StreamingEventHandler>();

export function subscribeToStreamingEvents(handler: StreamingEventHandler): () => void {
  streamingHandlers.add(handler);
  return () => streamingHandlers.delete(handler);
}

function emitStreamingEvent(event: WSEvent) {
  for (const handler of streamingHandlers) {
    handler(event);
  }
}

export function handleWebSocketEvent(event: WSEvent, queryClient: QueryClient) {
  log(`Received event: ${event.type}`, event.payload);

  switch (event.type) {
    // Session events
    case "session.created":
    case "session.updated":
    case "session.deleted":
      if (event.payload.projectId) {
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "sessions"],
        });
      }
      if (event.payload.sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["sessions", event.payload.sessionId],
        });
      }
      break;

    // Mission events
    case "mission.created":
    case "mission.updated":
    case "mission.started":
    case "mission.paused":
    case "mission.completed":
    case "mission.failed":
      if (event.payload.projectId) {
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "missions"],
        });
      }
      if (event.payload.id) {
        queryClient.invalidateQueries({
          queryKey: ["missions", event.payload.id],
        });
      }
      break;

    // Task events
    case "task.created":
    case "task.updated":
    case "task.completed":
      if (event.payload.missionId) {
        queryClient.invalidateQueries({
          queryKey: ["missions", event.payload.missionId, "tasks"],
        });
      }
      if (event.payload.sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["sessions", event.payload.sessionId, "tasks"],
        });
      }
      break;

    // Process events
    case "process.spawned":
    case "process.output":
    case "process.exited":
    case "process.killed":
      if (event.payload.projectId) {
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "processes"],
        });
      }
      if (event.payload.id) {
        queryClient.invalidateQueries({
          queryKey: ["processes", event.payload.id],
        });
      }
      break;

    // Message streaming events - forward to streaming handlers
    case "message.created":
      log(`Message created: ${event.payload.messageId}, role: ${event.payload.role}`);
      emitStreamingEvent(event);
      break;

    case "message.text.delta":
      log(`Text delta for message: ${event.payload.messageId}`, { delta: event.payload.delta });
      emitStreamingEvent(event);
      break;

    case "message.tool.call":
    case "message.tool.result":
      log(`Tool event: ${event.type}`, event.payload);
      emitStreamingEvent(event);
      break;

    case "message.complete":
      log(`Message complete: ${event.payload.messageId}`);
      emitStreamingEvent(event);
      // Refetch messages when complete
      if (event.payload.sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["sessions", event.payload.sessionId, "messages"],
        });
      }
      break;

    case "message.error":
      log(`Message error: ${event.payload.messageId}`, event.payload);
      emitStreamingEvent(event);
      if (event.payload.sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["sessions", event.payload.sessionId, "messages"],
        });
      }
      break;

    default:
      log(`Unhandled event type: ${event.type}`);
  }
}
