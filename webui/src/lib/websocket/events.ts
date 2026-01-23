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

// Custom event emitter for process events
type ProcessEventHandler = (event: WSEvent) => void;
const processHandlers = new Set<ProcessEventHandler>();

export function subscribeToProcessEvents(handler: ProcessEventHandler): () => void {
  processHandlers.add(handler);
  return () => processHandlers.delete(handler);
}

function emitProcessEvent(event: WSEvent) {
  for (const handler of processHandlers) {
    handler(event);
  }
}

// Custom event emitter for UI action events (from AI agent tools)
export interface UIActionPayload {
  action: string;
  value: unknown;
  message?: string;
}
type UIActionEventHandler = (payload: UIActionPayload) => void;
const uiActionHandlers = new Set<UIActionEventHandler>();

export function subscribeToUIActionEvents(handler: UIActionEventHandler): () => void {
  uiActionHandlers.add(handler);
  return () => uiActionHandlers.delete(handler);
}

function emitUIActionEvent(payload: UIActionPayload) {
  for (const handler of uiActionHandlers) {
    handler(payload);
  }
}

// Custom event emitter for navigation events (from AI agent tools)
export interface NavigatePayload {
  pageId: string;
  params: Record<string, unknown>;
}
type NavigateEventHandler = (payload: NavigatePayload) => void;
const navigateHandlers = new Set<NavigateEventHandler>();

export function subscribeToNavigateEvents(handler: NavigateEventHandler): () => void {
  navigateHandlers.add(handler);
  return () => navigateHandlers.delete(handler);
}

function emitNavigateEvent(payload: NavigatePayload) {
  for (const handler of navigateHandlers) {
    handler(payload);
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
    case "process.exited":
    case "process.killed":
      log(`Process event: ${event.type}`, event.payload);
      emitProcessEvent(event);
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

    case "process.output":
      // Stream output to handlers without invalidating queries (too frequent)
      emitProcessEvent(event);
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

    case "message.reasoning.delta":
      log(`Reasoning delta for message: ${event.payload.messageId}`, { delta: event.payload.delta });
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

    // Git events - invalidate git-related queries
    case "git.status.changed":
    case "git.commit.created":
    case "git.pushed":
    case "git.pulled":
    case "git.sync.completed":
      log(`Git event: ${event.type}`, event.payload);
      if (event.payload.projectId) {
        // Invalidate git status and log
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "git", "status"],
        });
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "git", "log"],
        });
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "git", "sync"],
        });
        // Also invalidate files since they may have changed
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "files"],
        });
      }
      break;

    case "git.branch.switched":
      log(`Branch switched: ${event.payload.branch}`, event.payload);
      if (event.payload.projectId) {
        // Invalidate all git-related queries
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "git"],
        });
        // Invalidate files since branch change affects working tree
        queryClient.invalidateQueries({
          queryKey: ["projects", event.payload.projectId, "files"],
        });
      }
      break;

    // UI action events from AI agent tools
    case "ui.action":
      log(`UI action: ${event.payload.action}`, event.payload);
      emitUIActionEvent(event.payload as unknown as UIActionPayload);
      break;

    // Navigation events from AI agent tools
    case "ui.navigate":
      log(`Navigate: ${event.payload.pageId}`, event.payload);
      emitNavigateEvent(event.payload as unknown as NavigatePayload);
      break;

    default:
      log(`Unhandled event type: ${event.type}`);
  }
}
