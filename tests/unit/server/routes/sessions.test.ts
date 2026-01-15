/**
 * Sessions API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { SessionService } from "@/services/sessions.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  SessionResponse,
  MessageResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Sessions API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/sessions-route-test"
  );
  const testProjectId = "test-project-sessions";

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
    // Reset project database for each test
    if (DatabaseManager.projectDbExists(testProjectId)) {
      DatabaseManager.deleteProjectDb(testProjectId);
    }
  });

  const app = createApp();

  describe("GET /api/sessions", () => {
    it("returns empty list when no sessions exist", async () => {
      const response = await app.request(
        `/api/sessions?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<SessionResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns sessions list with pagination", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create test sessions
      SessionService.create(db, { title: "Session 1" });
      SessionService.create(db, { title: "Session 2" });
      SessionService.create(db, { title: "Session 3" });

      const response = await app.request(
        `/api/sessions?projectId=${testProjectId}&limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<SessionResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters sessions by status", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      SessionService.create(db, {
        title: "Active",
      });
      const session2 = SessionService.create(db, {
        title: "Archived",
      });
      SessionService.archive(db, session2.id);

      const response = await app.request(
        `/api/sessions?projectId=${testProjectId}&status=active`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<SessionResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.title).toBe("Active");
    });

    it("requires projectId parameter", async () => {
      const response = await app.request("/api/sessions");

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/sessions", () => {
    it("creates a new session", async () => {
      const response = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          title: "New Session",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<SessionResponse>;
      expect(body.data.id).toMatch(/^sess_/);
      expect(body.data.title).toBe("New Session");
      expect(body.data.agent).toBe("default");
      expect(body.data.status).toBe("active");
    });

    it("creates session with default title", async () => {
      const response = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<SessionResponse>;
      expect(body.data.title).toBe("New Session");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns session by ID", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const created = SessionService.create(db, {
        title: "Test Session",
      });

      const response = await app.request(
        `/api/sessions/${created.id}?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<SessionResponse>;
      expect(body.data.id).toBe(created.id);
      expect(body.data.title).toBe("Test Session");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request(
        `/api/sessions/sess_nonexistent?projectId=${testProjectId}`
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("requires projectId parameter", async () => {
      const response = await app.request("/api/sessions/sess_test");

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PUT /api/sessions/:id", () => {
    it("updates session title", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const created = SessionService.create(db, {
        title: "Original",
      });

      const response = await app.request(`/api/sessions/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          title: "Updated Title",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<SessionResponse>;
      expect(body.data.title).toBe("Updated Title");
    });

    it("updates session status", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const created = SessionService.create(db, {
        title: "Test",
      });

      const response = await app.request(`/api/sessions/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          status: "archived",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<SessionResponse & { archivedAt?: number }>;
      expect(body.data.status).toBe("archived");
      expect(body.data.archivedAt).toBeDefined();
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    it("soft deletes a session", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const created = SessionService.create(db, {
        title: "To Delete",
      });

      const response = await app.request(
        `/api/sessions/${created.id}?projectId=${testProjectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify session is soft deleted
      const session = SessionService.getById(db, created.id);
      expect(session?.status).toBe("deleted");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request(
        `/api/sessions/sess_nonexistent?projectId=${testProjectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/sessions/:id/messages", () => {
    it("returns empty list for session with no messages", async () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const session = SessionService.create(db, {
        title: "Empty Session",
      });

      const response = await app.request(
        `/api/sessions/${session.id}/messages?projectId=${testProjectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<MessageResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.request(
        `/api/sessions/sess_nonexistent/messages?projectId=${testProjectId}`
      );

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});
