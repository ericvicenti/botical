/**
 * Message Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Message Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a user message", () => {
      const message = MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });

      expect(message.id).toMatch(/^msg_/);
      expect(message.sessionId).toBe("sess_test");
      expect(message.role).toBe("user");
      expect(message.finishReason).toBeNull();
      expect(message.createdAt).toBeDefined();
    });

    it("creates an assistant message with parent", () => {
      const userMessage = MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });

      const assistantMessage = MessageService.create(db, {
        sessionId: "sess_test",
        role: "assistant",
        parentId: userMessage.id,
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      });

      expect(assistantMessage.role).toBe("assistant");
      expect(assistantMessage.parentId).toBe(userMessage.id);
      expect(assistantMessage.providerId).toBe("anthropic");
      expect(assistantMessage.modelId).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("getById", () => {
    it("retrieves an existing message", () => {
      const created = MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });

      const retrieved = MessageService.getById(db, created.id);
      expect(retrieved?.id).toBe(created.id);
    });

    it("returns null for non-existent message", () => {
      const result = MessageService.getById(db, "msg_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns message when it exists", () => {
      const created = MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });

      const retrieved = MessageService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws for non-existent message", () => {
      expect(() => {
        MessageService.getByIdOrThrow(db, "msg_nonexistent");
      }).toThrow();
    });
  });

  describe("listBySession", () => {
    it("lists all messages for a session", () => {
      MessageService.create(db, { sessionId: "sess_1", role: "user" });
      MessageService.create(db, { sessionId: "sess_1", role: "assistant" });
      MessageService.create(db, { sessionId: "sess_2", role: "user" });

      const messages = MessageService.listBySession(db, "sess_1");
      expect(messages.length).toBe(2);
    });

    it("returns messages in ID order", () => {
      MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });
      MessageService.create(db, {
        sessionId: "sess_test",
        role: "assistant",
      });

      const messages = MessageService.listBySession(db, "sess_test");
      // Messages should be sorted by created_at with role tiebreaker (user before assistant)
      expect(messages.length).toBe(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("assistant");
    });

    it("filters by role", () => {
      MessageService.create(db, { sessionId: "sess_test", role: "user" });
      MessageService.create(db, { sessionId: "sess_test", role: "assistant" });

      const userMessages = MessageService.listBySession(db, "sess_test", {
        role: "user",
      });
      expect(userMessages.length).toBe(1);
      expect(userMessages[0]!.role).toBe("user");
    });
  });

  describe("complete", () => {
    it("marks message as complete with usage", () => {
      const message = MessageService.create(db, {
        sessionId: "sess_test",
        role: "assistant",
      });

      MessageService.complete(db, message.id, {
        finishReason: "stop",
        tokensInput: 100,
        tokensOutput: 50,
        cost: 0.005,
      });

      const updated = MessageService.getById(db, message.id);
      expect(updated?.finishReason).toBe("stop");
      expect(updated?.tokensInput).toBe(100);
      expect(updated?.tokensOutput).toBe(50);
      expect(updated?.cost).toBeCloseTo(0.005, 6);
      expect(updated?.completedAt).toBeDefined();
    });
  });

  describe("setError", () => {
    it("marks message as errored", () => {
      const message = MessageService.create(db, {
        sessionId: "sess_test",
        role: "assistant",
      });

      MessageService.setError(db, message.id, {
        type: "APIError",
        message: "Rate limit exceeded",
      });

      const updated = MessageService.getById(db, message.id);
      expect(updated?.finishReason).toBe("error");
      expect(updated?.errorType).toBe("APIError");
      expect(updated?.errorMessage).toBe("Rate limit exceeded");
    });
  });

  describe("delete", () => {
    it("removes a message", () => {
      const message = MessageService.create(db, {
        sessionId: "sess_test",
        role: "user",
      });

      MessageService.delete(db, message.id);

      const deleted = MessageService.getById(db, message.id);
      expect(deleted).toBeNull();
    });
  });

  describe("countBySession", () => {
    it("counts messages in a session", () => {
      MessageService.create(db, { sessionId: "sess_test", role: "user" });
      MessageService.create(db, { sessionId: "sess_test", role: "assistant" });
      MessageService.create(db, { sessionId: "sess_other", role: "user" });

      expect(MessageService.countBySession(db, "sess_test")).toBe(2);
      expect(MessageService.countBySession(db, "sess_other")).toBe(1);
    });
  });
});

describe("Message Part Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a text part", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Hello, world!" },
      });

      expect(part.id).toMatch(/^part_/);
      expect(part.type).toBe("text");
      expect((part.content as { text: string }).text).toBe("Hello, world!");
    });

    it("creates a tool-call part", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "tool-call",
        content: {
          toolCallId: "call_123",
          toolName: "read_file",
          args: { path: "/test/file.txt" },
        },
        toolName: "read_file",
        toolCallId: "call_123",
        toolStatus: "pending",
      });

      expect(part.type).toBe("tool-call");
      expect(part.toolStatus).toBe("pending");
      expect(part.toolName).toBe("read_file");
      expect(part.toolCallId).toBe("call_123");
    });

    it("creates a tool-result part", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "tool-result",
        content: {
          toolCallId: "call_123",
          toolName: "read_file",
          result: { content: "file contents" },
        },
        toolName: "read_file",
        toolCallId: "call_123",
        toolStatus: "completed",
      });

      expect(part.type).toBe("tool-result");
      expect(part.toolStatus).toBe("completed");
    });
  });

  describe("getById", () => {
    it("retrieves an existing part", () => {
      const created = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Hello" },
      });

      const retrieved = MessagePartService.getById(db, created.id);
      expect(retrieved?.id).toBe(created.id);
    });

    it("returns null for non-existent part", () => {
      const result = MessagePartService.getById(db, "part_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listByMessage", () => {
    it("lists all parts for a message", () => {
      MessagePartService.create(db, {
        messageId: "msg_1",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part 1" },
      });
      MessagePartService.create(db, {
        messageId: "msg_1",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part 2" },
      });
      MessagePartService.create(db, {
        messageId: "msg_2",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Other message" },
      });

      const parts = MessagePartService.listByMessage(db, "msg_1");
      expect(parts.length).toBe(2);
    });

    it("returns parts in ID order", () => {
      MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part A" },
      });
      MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part B" },
      });

      const parts = MessagePartService.listByMessage(db, "msg_test");
      // Parts should be sorted by ID (ascending)
      expect(parts.length).toBe(2);
      expect(parts[0]!.id < parts[1]!.id).toBe(true);
    });
  });

  describe("appendText", () => {
    it("appends text to existing text part", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Hello" },
      });

      MessagePartService.appendText(db, part.id, ", world!");

      const updated = MessagePartService.getById(db, part.id);
      expect((updated?.content as { text: string }).text).toBe("Hello, world!");
    });
  });

  describe("updateToolStatus", () => {
    it("updates tool part status", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "tool-call",
        content: {
          toolCallId: "call_123",
          toolName: "read_file",
          args: {},
        },
        toolName: "read_file",
        toolCallId: "call_123",
        toolStatus: "pending",
      });

      MessagePartService.updateToolStatus(db, part.id, "running");

      const updated = MessagePartService.getById(db, part.id);
      expect(updated?.toolStatus).toBe("running");
    });
  });

  describe("updateContent", () => {
    it("updates part content", () => {
      const part = MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Original" },
      });

      MessagePartService.updateContent(db, part.id, { text: "Updated" });

      const updated = MessagePartService.getById(db, part.id);
      expect((updated?.content as { text: string }).text).toBe("Updated");
    });
  });

  describe("getByToolCallId", () => {
    it("finds part by tool call ID", () => {
      MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "tool-call",
        content: { toolCallId: "call_123" },
        toolCallId: "call_123",
      });

      const found = MessagePartService.getByToolCallId(
        db,
        "sess_test",
        "call_123"
      );
      expect(found).toBeDefined();
      expect(found?.toolCallId).toBe("call_123");
    });

    it("returns null when not found", () => {
      const found = MessagePartService.getByToolCallId(
        db,
        "sess_test",
        "nonexistent"
      );
      expect(found).toBeNull();
    });
  });

  describe("deleteByMessage", () => {
    it("deletes all parts for a message", () => {
      MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part 1" },
      });
      MessagePartService.create(db, {
        messageId: "msg_test",
        sessionId: "sess_test",
        type: "text",
        content: { text: "Part 2" },
      });

      const deleted = MessagePartService.deleteByMessage(db, "msg_test");
      expect(deleted).toBe(2);

      const remaining = MessagePartService.listByMessage(db, "msg_test");
      expect(remaining.length).toBe(0);
    });
  });
});
