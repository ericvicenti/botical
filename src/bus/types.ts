/**
 * Event Type Definitions
 *
 * Defines all events that flow through the event bus.
 * See: docs/knowledge-base/04-patterns.md#event-bus-pattern
 *
 * Events use Zod for runtime validation ensuring type safety across
 * the internal bus and WebSocket broadcasting.
 * See: docs/knowledge-base/01-architecture.md#zod
 *
 * Event naming convention: "{entity}.{action}" or "{entity}.{sub}.{action}"
 * Examples: "session.created", "message.text.delta", "file.updated"
 */

import { z } from "zod";

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

export const MessageReasoningDeltaEvent = z.object({
  type: z.literal("message.reasoning.delta"),
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

// Process Events
export const ProcessSpawnedEvent = z.object({
  type: z.literal("process.spawned"),
  payload: z.object({
    id: z.string(),
    projectId: z.string(),
    type: z.enum(["command", "service"]),
    command: z.string(),
    cwd: z.string(),
    status: z.string(),
  }),
});

export const ProcessOutputEvent = z.object({
  type: z.literal("process.output"),
  payload: z.object({
    id: z.string(),
    data: z.string(),
    stream: z.enum(["stdout", "stderr"]),
  }),
});

export const ProcessExitedEvent = z.object({
  type: z.literal("process.exited"),
  payload: z.object({
    id: z.string(),
    projectId: z.string(),
    exitCode: z.number(),
    status: z.string(),
  }),
});

export const ProcessKilledEvent = z.object({
  type: z.literal("process.killed"),
  payload: z.object({
    id: z.string(),
    projectId: z.string(),
  }),
});

// Git Events
export const GitStatusChangedEvent = z.object({
  type: z.literal("git.status.changed"),
  payload: z.object({
    projectId: z.string(),
  }),
});

export const GitBranchSwitchedEvent = z.object({
  type: z.literal("git.branch.switched"),
  payload: z.object({
    projectId: z.string(),
    branch: z.string(),
  }),
});

export const GitCommitCreatedEvent = z.object({
  type: z.literal("git.commit.created"),
  payload: z.object({
    projectId: z.string(),
    hash: z.string(),
    message: z.string(),
  }),
});

export const GitPushedEvent = z.object({
  type: z.literal("git.pushed"),
  payload: z.object({
    projectId: z.string(),
    remote: z.string(),
  }),
});

export const GitPulledEvent = z.object({
  type: z.literal("git.pulled"),
  payload: z.object({
    projectId: z.string(),
    remote: z.string(),
    files: z.array(z.string()),
  }),
});

export const GitSyncCompletedEvent = z.object({
  type: z.literal("git.sync.completed"),
  payload: z.object({
    projectId: z.string(),
    state: z.string(),
  }),
});

// Union of all event types
export const BoticalEvent = z.discriminatedUnion("type", [
  SessionCreatedEvent,
  SessionUpdatedEvent,
  SessionDeletedEvent,
  MessageCreatedEvent,
  MessageTextDeltaEvent,
  MessageReasoningDeltaEvent,
  MessageToolCallEvent,
  MessageToolResultEvent,
  MessageCompleteEvent,
  MessageErrorEvent,
  FileUpdatedEvent,
  FileDeletedEvent,
  ProjectCreatedEvent,
  ProjectUpdatedEvent,
  ProjectDeletedEvent,
  ProcessSpawnedEvent,
  ProcessOutputEvent,
  ProcessExitedEvent,
  ProcessKilledEvent,
  GitStatusChangedEvent,
  GitBranchSwitchedEvent,
  GitCommitCreatedEvent,
  GitPushedEvent,
  GitPulledEvent,
  GitSyncCompletedEvent,
]);

export type BoticalEvent = z.infer<typeof BoticalEvent>;

// Event type string literals
export type BoticalEventType = BoticalEvent["type"];

// Extract payload type for a specific event type
export type EventPayload<T extends BoticalEventType> = Extract<
  BoticalEvent,
  { type: T }
>["payload"];

// Event with metadata for internal tracking
export interface EventEnvelope {
  id: string;
  timestamp: number;
  projectId?: string;
  event: BoticalEvent;
}

// Subscriber callback type
export type EventSubscriber<T extends BoticalEventType = BoticalEventType> = (
  envelope: EventEnvelope & { event: Extract<BoticalEvent, { type: T }> }
) => void | Promise<void>;

// Pattern for event type matching (supports wildcards)
export type EventPattern = BoticalEventType | `${string}.*`;
