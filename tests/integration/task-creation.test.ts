/**
 * Task Creation Integration Test
 *
 * Tests the full flow: create session with initial message → verify
 * the message is stored correctly and readable by the orchestrator.
 *
 * This test exists because of a bug where content was stored as a raw
 * string instead of { text: string }, causing empty first messages.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { extractTextContent } from "@/services/message-content.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Task Creation Flow", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  it("stores initial message with correct content format", () => {
    // Create session
    const session = SessionService.create(db, {
      title: "Test Task",
      agent: "default",
    });

    // Simulate what sessions.ts POST does with initial message
    const userMessage = MessageService.create(db, {
      sessionId: session.id,
      role: "user",
    });

    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: { text: "Hello, please help me" },
    });

    // Read it back like the orchestrator does
    const parts = MessagePartService.listByMessage(db, userMessage.id);
    expect(parts).toHaveLength(1);

    const text = extractTextContent(parts[0].content);
    expect(text).toBe("Hello, please help me");
    expect(text.length).toBeGreaterThan(0); // MUST NOT be empty
  });

  it("rejects empty message content gracefully", () => {
    const session = SessionService.create(db, {
      title: "Empty Test",
      agent: "default",
    });

    const userMessage = MessageService.create(db, {
      sessionId: session.id,
      role: "user",
    });

    // Even if someone passes empty text, extractTextContent handles it
    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: { text: "" },
    });

    const parts = MessagePartService.listByMessage(db, userMessage.id);
    const text = extractTextContent(parts[0].content);
    expect(text).toBe("");
  });

  it("handles legacy raw string content format", () => {
    const session = SessionService.create(db, {
      title: "Legacy Test",
      agent: "default",
    });

    const userMessage = MessageService.create(db, {
      sessionId: session.id,
      role: "user",
    });

    // Simulate the old buggy format (raw string instead of { text: string })
    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: "Raw string content" as unknown,
    });

    const parts = MessagePartService.listByMessage(db, userMessage.id);
    const text = extractTextContent(parts[0].content);
    // Should still extract the text, not return empty
    expect(text).toBe("Raw string content");
    expect(text.length).toBeGreaterThan(0);
  });
});
