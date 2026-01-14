import { z } from "zod";

/**
 * Event Type Definitions
 *
 * All events have a type identifier and typed payload.
 * Events are used for internal communication and WebSocket broadcasting.
 */

// Session Events
export const SessionCreatedEvent = z.object({
  type: z.literal("session.created"),
  payload: z.object({
    sessionId: z.string(),
    title: z.string(),
    agent: z.string(),
    parentId: z.string().optional(),
  }),
});

export const SessionUpdatedEvent = z.object({
  type: z.literal("session.updated"),
  payload: z.object({
    sessionId: z.string(),
    changes: z.record(z.unknown()),
  }),
});

export const SessionDeletedEvent = z.object({
  type: z.literal("session.deleted"),
  payload: z.object({
    sessionId: z.string(),
  }),
});

// Message Events
export const MessageCreatedEvent = z.object({
  type: z.literal("message.created"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    role: z.enum(["user", "assistant", "system"]),
  }),
});

export const MessageTextDeltaEvent = z.object({
  type: z.literal("message.text.delta"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    delta: z.string(),
  }),
});

export const MessageToolCallEvent = z.object({
  type: z.literal("message.tool.call"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    toolName: z.string(),
    toolCallId: z.string(),
    args: z.unknown(),
  }),
});

export const MessageToolResultEvent = z.object({
  type: z.literal("message.tool.result"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    partId: z.string(),
    toolCallId: z.string(),
    result: z.unknown(),
  }),
});

export const MessageCompleteEvent = z.object({
  type: z.literal("message.complete"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    finishReason: z.string().optional(),
  }),
});

export const MessageErrorEvent = z.object({
  type: z.literal("message.error"),
  payload: z.object({
    sessionId: z.string(),
    messageId: z.string(),
    errorType: z.string(),
    errorMessage: z.string(),
  }),
});

// File Events
export const FileUpdatedEvent = z.object({
  type: z.literal("file.updated"),
  payload: z.object({
    fileId: z.string(),
    path: z.string(),
    sessionId: z.string().optional(),
    messageId: z.string().optional(),
  }),
});

export const FileDeletedEvent = z.object({
  type: z.literal("file.deleted"),
  payload: z.object({
    fileId: z.string(),
    path: z.string(),
  }),
});

// Project Events (global)
export const ProjectCreatedEvent = z.object({
  type: z.literal("project.created"),
  payload: z.object({
    projectId: z.string(),
    name: z.string(),
    ownerId: z.string(),
  }),
});

export const ProjectUpdatedEvent = z.object({
  type: z.literal("project.updated"),
  payload: z.object({
    projectId: z.string(),
    changes: z.record(z.unknown()),
  }),
});

export const ProjectDeletedEvent = z.object({
  type: z.literal("project.deleted"),
  payload: z.object({
    projectId: z.string(),
  }),
});

// Union of all event types
export const IrisEvent = z.discriminatedUnion("type", [
  SessionCreatedEvent,
  SessionUpdatedEvent,
  SessionDeletedEvent,
  MessageCreatedEvent,
  MessageTextDeltaEvent,
  MessageToolCallEvent,
  MessageToolResultEvent,
  MessageCompleteEvent,
  MessageErrorEvent,
  FileUpdatedEvent,
  FileDeletedEvent,
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectDeletedEvent,
]);

export type IrisEvent = z.infer<typeof IrisEvent>;

// Event type string literals
export type IrisEventType = IrisEvent["type"];

// Extract payload type for a specific event type
export type EventPayload<T extends IrisEventType> = Extract<
  IrisEvent,
  { type: T }
>["payload"];

// Event with metadata for internal tracking
export interface EventEnvelope {
  id: string;
  timestamp: number;
  projectId?: string;
  event: IrisEvent;
}

// Subscriber callback type
export type EventSubscriber<T extends IrisEventType = IrisEventType> = (
  envelope: EventEnvelope & { event: Extract<IrisEvent, { type: T }> }
) => void | Promise<void>;

// Pattern for event type matching (supports wildcards)
export type EventPattern = IrisEventType | `${string}.*`;
