import type { QueryClient } from "@tanstack/react-query";

interface WSEvent {
  type: string;
  payload: Record<string, unknown>;
}

export function handleWebSocketEvent(event: WSEvent, queryClient: QueryClient) {
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

    // Message events
    case "message.created":
    case "message.text.delta":
    case "message.complete":
      if (event.payload.sessionId) {
        queryClient.invalidateQueries({
          queryKey: ["sessions", event.payload.sessionId, "messages"],
        });
      }
      break;
  }
}
