/**
 * Session Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SessionService } from "@/services/sessions.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Session Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a session with default values", () => {
      const session = SessionService.create(db, { agent: "default" });

      expect(session.id).toMatch(/^sess_/);
      expect(session.title).toBe("New Session");
      expect(session.status).toBe("active");
      expect(session.agent).toBe("default");
      expect(session.createdAt).toBeDefined();
    });

    it("creates a session with custom title", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "My Test Session",
      });

      expect(session.title).toBe("My Test Session");
      expect(session.slug).toBe("my-test-session");
    });

    it("creates a session with optional fields", () => {
      const session = SessionService.create(db, {
        title: "Test Session",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        agent: "coder",
      });

      expect(session.providerId).toBe("anthropic");
      expect(session.modelId).toBe("claude-sonnet-4-20250514");
      expect(session.agent).toBe("coder");
    });

    it("generates unique IDs", () => {
      const session1 = SessionService.create(db, {
        agent: "default",
        title: "First",
      });

      const session2 = SessionService.create(db, {
        agent: "default",
        title: "Second",
      });

      expect(session1.id).not.toBe(session2.id);
      expect(session1.id).toMatch(/^sess_/);
      expect(session2.id).toMatch(/^sess_/);
    });
  });

  describe("getById", () => {
    it("retrieves an existing session", () => {
      const created = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const retrieved = SessionService.getById(db, created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe("Test Session");
    });

    it("returns null for non-existent session", () => {
      const result = SessionService.getById(db, "sess_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns session when it exists", () => {
      const created = SessionService.create(db, {
        agent: "default",
        title: "Test Session",
      });

      const retrieved = SessionService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws for non-existent session", () => {
      expect(() => {
        SessionService.getByIdOrThrow(db, "sess_nonexistent");
      }).toThrow();
    });
  });

  describe("list", () => {
    it("lists all sessions", () => {
      SessionService.create(db, { agent: "default", title: "Session 1" });
      SessionService.create(db, { agent: "default", title: "Session 2" });
      SessionService.create(db, { agent: "default", title: "Session 3" });

      const sessions = SessionService.list(db);
      expect(sessions.length).toBe(3);
    });

    it("returns sessions in newest-first order", () => {
      const first = SessionService.create(db, { agent: "default", title: "First" });
      const second = SessionService.create(db, { agent: "default", title: "Second" });

      const sessions = SessionService.list(db);
      // Verify newest-first order by checking IDs (descending IDs sort newest first alphabetically)
      expect(sessions.length).toBe(2);
      expect(sessions[0]!.id < sessions[1]!.id).toBe(true);
      // Both sessions should be in the list
      const titles = sessions.map(s => s.title);
      expect(titles).toContain("First");
      expect(titles).toContain("Second");
    });

    it("supports pagination with limit and offset", () => {
      SessionService.create(db, { agent: "default", title: "Session 1" });
      SessionService.create(db, { agent: "default", title: "Session 2" });
      SessionService.create(db, { agent: "default", title: "Session 3" });

      const page1 = SessionService.list(db, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = SessionService.list(db, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it("filters by status", () => {
      SessionService.create(db, { agent: "default", title: "Active" });
      const archived = SessionService.create(db, { agent: "default", title: "Archived" });
      SessionService.archive(db, archived.id);

      const activeSessions = SessionService.list(db, {
        status: "active",
      });
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0]!.title).toBe("Active");
    });

    it("filters by agent", () => {
      SessionService.create(db, { agent: "default", title: "Default" });
      SessionService.create(db, { agent: "coder", title: "Coder" });

      const coderSessions = SessionService.list(db, { agent: "coder" });
      expect(coderSessions.length).toBe(1);
      expect(coderSessions[0]!.title).toBe("Coder");
    });
  });

  describe("update", () => {
    it("updates session title", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Original",
      });

      SessionService.update(db, session.id, { title: "Updated" });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.title).toBe("Updated");
    });

    it("updates model configuration", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.update(db, session.id, {
        providerId: "openai",
        modelId: "gpt-4o",
      });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.providerId).toBe("openai");
      expect(updated?.modelId).toBe("gpt-4o");
    });

    it("updates updatedAt timestamp", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      const originalUpdatedAt = session.updatedAt;

      SessionService.update(db, session.id, { title: "Updated" });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe("updateStats", () => {
    it("increments message count", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.updateStats(db, session.id, { messageCount: 1 });
      SessionService.updateStats(db, session.id, { messageCount: 2 });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.messageCount).toBe(3);
    });

    it("accumulates token counts", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.updateStats(db, session.id, {
        tokensInput: 100,
        tokensOutput: 50,
      });
      SessionService.updateStats(db, session.id, {
        tokensInput: 200,
        tokensOutput: 100,
      });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.totalTokensInput).toBe(300);
      expect(updated?.totalTokensOutput).toBe(150);
    });

    it("accumulates cost", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.updateStats(db, session.id, { cost: 0.005 });
      SessionService.updateStats(db, session.id, { cost: 0.01 });

      const updated = SessionService.getById(db, session.id);
      expect(updated?.totalCost).toBeCloseTo(0.015, 6);
    });
  });

  describe("archive", () => {
    it("sets session status to archived", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.archive(db, session.id);

      const archived = SessionService.getById(db, session.id);
      expect(archived?.status).toBe("archived");
      expect(archived?.archivedAt).toBeDefined();
    });
  });

  describe("delete", () => {
    it("soft deletes a session", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "Test",
      });

      SessionService.delete(db, session.id);

      const deleted = SessionService.getById(db, session.id);
      expect(deleted?.status).toBe("deleted");
    });
  });

  describe("count", () => {
    it("counts all sessions", () => {
      SessionService.create(db, { agent: "default", title: "Session 1" });
      SessionService.create(db, { agent: "default", title: "Session 2" });

      expect(SessionService.count(db)).toBe(2);
    });

    it("counts sessions by status", () => {
      SessionService.create(db, { agent: "default", title: "Active" });
      const archived = SessionService.create(db, { agent: "default", title: "Archived" });
      SessionService.archive(db, archived.id);

      expect(SessionService.count(db, "active")).toBe(1);
      expect(SessionService.count(db, "archived")).toBe(1);
    });
  });

  describe("systemPrompt", () => {
    it("creates a session with systemPrompt", () => {
      const session = SessionService.create(db, {
        agent: "default",
        title: "With Prompt",
        systemPrompt: "You are a pirate",
      });

      expect(session.systemPrompt).toBe("You are a pirate");
    });

    it("defaults systemPrompt to null", () => {
      const session = SessionService.create(db, { agent: "default" });
      expect(session.systemPrompt).toBeNull();
    });

    it("persists systemPrompt via getById", () => {
      const session = SessionService.create(db, {
        agent: "default",
        systemPrompt: "Be concise",
      });

      const retrieved = SessionService.getById(db, session.id);
      expect(retrieved!.systemPrompt).toBe("Be concise");
    });

    it("updates systemPrompt", () => {
      const session = SessionService.create(db, {
        agent: "default",
        systemPrompt: "Original",
      });

      const updated = SessionService.update(db, session.id, {
        systemPrompt: "Updated prompt",
      });

      expect(updated.systemPrompt).toBe("Updated prompt");
    });

    it("clears systemPrompt with null", () => {
      const session = SessionService.create(db, {
        agent: "default",
        systemPrompt: "Something",
      });

      const updated = SessionService.update(db, session.id, {
        systemPrompt: null,
      });

      expect(updated.systemPrompt).toBeNull();
    });
  });
});
