/**
 * Messages API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import fs from "fs";
import path from "path";

describe("Messages API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/messages-route-test"
  );
  const testProjectId = "test-project-messages";

  beforeAll(() => {
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();
    if (DatabaseManager.projectDbExists(testProjectId)) {
      DatabaseManager.deleteProjectDb(testProjectId);
    }
  });

  const app = createApp();

  describe("GET /api/messages/:id", () => {
    it("returns message with parts", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const message = MessageService.create(db, {
        sessionId: session.id,
        role: "user",
      });

      MessagePartService.create(db, {
        messageId: message.id,
        sessionId: session.id,
        type: "text",
        content: { text: "Hello world" },
      });

      const response = await app.request(
        `/api/messages/${message.id}?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.id).toBe(message.id);
      expect(body.data.role).toBe("user");
      expect(body.data.parts).toHaveLength(1);
      expect(body.data.parts[0].type).toBe("text");
    });

    it("returns 404 for non-existent message", async () => {
      const response = await app.request(
        `/api/messages/msg_nonexistent?projectId=${testProjectId}`
      );

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("requires projectId parameter", async () => {
      const response = await app.request("/api/messages/msg_test");

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/messages/:id/parts", () => {
    it("returns message parts", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const message = MessageService.create(db, {
        sessionId: session.id,
        role: "assistant",
      });

      MessagePartService.create(db, {
        messageId: message.id,
        sessionId: session.id,
        type: "text",
        content: { text: "Part 1" },
      });

      MessagePartService.create(db, {
        messageId: message.id,
        sessionId: session.id,
        type: "text",
        content: { text: "Part 2" },
      });

      const response = await app.request(
        `/api/messages/${message.id}/parts?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it("returns 404 for non-existent message", async () => {
      const response = await app.request(
        `/api/messages/msg_nonexistent/parts?projectId=${testProjectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/messages", () => {
    it("validates required fields", async () => {
      const response = await app.request("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          // Missing required fields
        }),
      });

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("requires valid session", async () => {
      const response = await app.request("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          sessionId: "sess_nonexistent",
          content: "Hello",
          userId: "user_123",
          providerId: "anthropic",
        }),
      });

      expect(response.status).toBe(404);
    });

    it("requires API key for provider", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const response = await app.request("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          sessionId: session.id,
          content: "Hello",
          userId: "user_123",
          providerId: "anthropic",
        }),
      });

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error.code).toBe("AUTHENTICATION_ERROR");
    });
  });
});
