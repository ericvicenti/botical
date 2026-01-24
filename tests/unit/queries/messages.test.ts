/**
 * Message Queries Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DatabaseManager } from "../../../src/database/index.ts";
import {
  MessageService,
  MessagePartService,
  type Message,
  type MessagePart,
} from "../../../src/services/messages.ts";
import {
  messagesListQuery,
  messagesGetQuery,
  messagePartsListQuery,
  messagesCreateMutation,
  messagesDeleteMutation,
} from "../../../src/queries/messages.ts";
import type { QueryContext, MutationContext } from "../../../src/queries/types.ts";

// Mock data
const mockMessage: Message = {
  id: "msg-1",
  sessionId: "session-1",
  role: "assistant",
  parentId: null,
  providerId: "anthropic",
  modelId: "claude-3",
  agent: "default",
  finishReason: "stop",
  cost: 0.005,
  tokensInput: 500,
  tokensOutput: 200,
  tokensReasoning: 0,
  tokensCacheRead: 100,
  tokensCacheWrite: 50,
  errorType: null,
  errorMessage: null,
  createdAt: Date.now(),
  completedAt: Date.now(),
};

const mockMessages: Message[] = [
  mockMessage,
  {
    ...mockMessage,
    id: "msg-2",
    role: "user",
    providerId: null,
    modelId: null,
    finishReason: null,
  },
];

const mockMessagePart: MessagePart = {
  id: "part-1",
  messageId: "msg-1",
  sessionId: "session-1",
  type: "text",
  content: "Hello, world!",
  toolName: null,
  toolCallId: null,
  toolStatus: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockMessageParts: MessagePart[] = [
  mockMessagePart,
  {
    ...mockMessagePart,
    id: "part-2",
    type: "tool-call",
    toolName: "read_file",
    toolCallId: "tool-1",
    toolStatus: "completed",
  },
];

describe("Message Queries", () => {
  const mockDb = { prepare: () => ({}) } as any;
  const mockContext: QueryContext = { projectId: "test-project" };
  const mockMutationContext: MutationContext = { projectId: "test-project" };

  let getProjectDbSpy: ReturnType<typeof spyOn>;
  let listBySessionSpy: ReturnType<typeof spyOn>;
  let getByIdOrThrowSpy: ReturnType<typeof spyOn>;
  let listByMessageSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb);
    listBySessionSpy = spyOn(MessageService, "listBySession").mockReturnValue(mockMessages);
    getByIdOrThrowSpy = spyOn(MessageService, "getByIdOrThrow").mockReturnValue(mockMessage);
    listByMessageSpy = spyOn(MessagePartService, "listByMessage").mockReturnValue(mockMessageParts);
    createSpy = spyOn(MessageService, "create").mockReturnValue(mockMessage);
    deleteSpy = spyOn(MessageService, "delete").mockReturnValue(undefined);
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
    listBySessionSpy.mockRestore();
    getByIdOrThrowSpy.mockRestore();
    listByMessageSpy.mockRestore();
    createSpy.mockRestore();
    deleteSpy.mockRestore();
  });

  describe("messagesListQuery", () => {
    test("has correct name", () => {
      expect(messagesListQuery.name).toBe("messages.list");
    });

    test("fetches messages list", async () => {
      const result = await messagesListQuery.fetch(
        { projectId: "test-project", sessionId: "session-1" },
        mockContext
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("msg-1");
      expect(result[0]!.role).toBe("assistant");
      expect(result[1]!.role).toBe("user");
    });

    test("passes options to service", async () => {
      await messagesListQuery.fetch(
        { projectId: "test-project", sessionId: "session-1", limit: 10, offset: 5 },
        mockContext
      );

      expect(listBySessionSpy).toHaveBeenCalledWith(mockDb, "session-1", {
        limit: 10,
        offset: 5,
      });
    });

    test("has correct cache configuration", () => {
      expect(messagesListQuery.cache).toBeDefined();
      expect(messagesListQuery.cache!.ttl).toBe(5_000);
      expect(messagesListQuery.cache!.scope).toBe("project");
    });

    test("generates correct cache key", () => {
      const key = messagesListQuery.cache!.key!({
        projectId: "proj1",
        sessionId: "sess1",
      });
      expect(key).toEqual(["messages.list", "proj1", "sess1"]);
    });

    test("has realtime events", () => {
      expect(messagesListQuery.realtime).toBeDefined();
      expect(messagesListQuery.realtime!.events).toContain("message.created");
      expect(messagesListQuery.realtime!.events).toContain("message.updated");
      expect(messagesListQuery.realtime!.events).toContain("message.completed");
    });
  });

  describe("messagesGetQuery", () => {
    test("has correct name", () => {
      expect(messagesGetQuery.name).toBe("messages.get");
    });

    test("fetches message with parts", async () => {
      const result = await messagesGetQuery.fetch(
        { projectId: "test-project", messageId: "msg-1" },
        mockContext
      );

      expect(result.id).toBe("msg-1");
      expect(result.role).toBe("assistant");
      expect(result.parts).toHaveLength(2);
      expect(result.parts[0]!.type).toBe("text");
      expect(result.parts[1]!.type).toBe("tool-call");
    });

    test("has correct cache configuration", () => {
      const key = messagesGetQuery.cache!.key!({
        projectId: "proj1",
        messageId: "msg1",
      });
      expect(key).toEqual(["messages.get", "proj1", "msg1"]);
    });

    test("has realtime events for parts", () => {
      expect(messagesGetQuery.realtime!.events).toContain("message.part.created");
      expect(messagesGetQuery.realtime!.events).toContain("message.part.updated");
    });
  });

  describe("messagePartsListQuery", () => {
    test("has correct name", () => {
      expect(messagePartsListQuery.name).toBe("messages.parts.list");
    });

    test("fetches message parts", async () => {
      const result = await messagePartsListQuery.fetch(
        { projectId: "test-project", messageId: "msg-1" },
        mockContext
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("part-1");
      expect(result[0]!.type).toBe("text");
    });

    test("has correct cache key", () => {
      const key = messagePartsListQuery.cache!.key!({
        projectId: "proj1",
        messageId: "msg1",
      });
      expect(key).toEqual(["messages.parts.list", "proj1", "msg1"]);
    });
  });

  describe("messagesCreateMutation", () => {
    test("has correct name", () => {
      expect(messagesCreateMutation.name).toBe("messages.create");
    });

    test("creates a message", async () => {
      const result = await messagesCreateMutation.execute(
        {
          projectId: "test-project",
          data: { sessionId: "session-1", role: "user" },
        },
        mockMutationContext
      );

      expect(result.id).toBe("msg-1");
      expect(createSpy).toHaveBeenCalledWith(mockDb, {
        sessionId: "session-1",
        role: "user",
      });
    });

    test("invalidates correct queries", () => {
      expect(messagesCreateMutation.invalidates).toContain("messages.list");
    });
  });

  describe("messagesDeleteMutation", () => {
    test("has correct name", () => {
      expect(messagesDeleteMutation.name).toBe("messages.delete");
    });

    test("deletes a message", async () => {
      const result = await messagesDeleteMutation.execute(
        { projectId: "test-project", messageId: "msg-1" },
        mockMutationContext
      );

      expect(result).toEqual({ deleted: true });
      expect(deleteSpy).toHaveBeenCalledWith(mockDb, "msg-1");
    });

    test("has correct invalidate keys function", () => {
      const keys = messagesDeleteMutation.invalidateKeys!(
        { projectId: "proj1", messageId: "msg1" },
        { deleted: true }
      );
      expect(keys).toContainEqual(["messages.get", "proj1", "msg1"]);
      expect(keys).toContainEqual(["messages.parts.list", "proj1", "msg1"]);
    });
  });
});
