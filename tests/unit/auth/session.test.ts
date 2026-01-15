import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SessionService } from "@/auth/session.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

// Type definitions for test data
interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  revoked_at: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

describe("SessionService", () => {
  const testDataDir = path.join(import.meta.dirname, "../../../.test-data/session-test");
  let testUserId: string;

  beforeEach(async () => {
    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    // Create a test user
    const db = DatabaseManager.getRootDb();
    testUserId = "usr_test123";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'test@example.com', 'testuser', 0, 0, '{}', ?, ?)
    `).run(testUserId, Date.now(), Date.now());
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("create", () => {
    it("creates a session and returns token", () => {
      const result = SessionService.create(testUserId);

      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.session.id).toMatch(/^authsess_/);
      expect(result.session.userId).toBe(testUserId);
    });

    it("stores session in database", () => {
      const result = SessionService.create(testUserId);

      const db = DatabaseManager.getRootDb();
      const stored = db.prepare("SELECT * FROM auth_sessions WHERE id = ?").get(result.session.id) as AuthSessionRow | undefined;

      expect(stored).toBeDefined();
      expect(stored!.user_id).toBe(testUserId);
      expect(stored!.token_hash).toBeDefined();
      expect(stored!.revoked_at).toBeNull();
    });

    it("stores request metadata", () => {
      const result = SessionService.create(testUserId, {
        ipAddress: "192.168.1.100",
        userAgent: "Test Browser/1.0",
      });

      const db = DatabaseManager.getRootDb();
      const stored = db.prepare("SELECT * FROM auth_sessions WHERE id = ?").get(result.session.id) as AuthSessionRow;

      expect(stored.ip_address).toBe("192.168.1.100");
      expect(stored.user_agent).toBe("Test Browser/1.0");
    });

    it("sets expiration to 7 days from now", () => {
      const before = Date.now();
      const result = SessionService.create(testUserId);
      const after = Date.now();

      const expectedExpiry = 7 * 24 * 60 * 60 * 1000;
      expect(result.session.expiresAt).toBeGreaterThanOrEqual(before + expectedExpiry - 1000);
      expect(result.session.expiresAt).toBeLessThanOrEqual(after + expectedExpiry + 1000);
    });

    it("generates unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = SessionService.create(testUserId);
        tokens.add(result.token);
      }
      expect(tokens.size).toBe(10);
    });
  });

  describe("validate", () => {
    it("validates a valid token", () => {
      const { token } = SessionService.create(testUserId);

      const session = SessionService.validate(token);

      expect(session).not.toBeNull();
      expect(session!.userId).toBe(testUserId);
    });

    it("returns null for invalid token", () => {
      const session = SessionService.validate("invalid-token");
      expect(session).toBeNull();
    });

    it("returns null for expired session", () => {
      const { session, token } = SessionService.create(testUserId);

      // Manually expire the session
      const db = DatabaseManager.getRootDb();
      db.prepare("UPDATE auth_sessions SET expires_at = ? WHERE id = ?").run(
        Date.now() - 1000,
        session.id
      );

      const result = SessionService.validate(token);
      expect(result).toBeNull();
    });

    it("returns null for revoked session", () => {
      const { session, token } = SessionService.create(testUserId);

      SessionService.revoke(session.id);

      const result = SessionService.validate(token);
      expect(result).toBeNull();
    });

    it("updates last_activity_at on validation", () => {
      const { token, session } = SessionService.create(testUserId);

      // Wait a tiny bit
      const db = DatabaseManager.getRootDb();
      const before = db.prepare("SELECT last_activity_at FROM auth_sessions WHERE id = ?").get(session.id) as { last_activity_at: number };

      // Validate again
      SessionService.validate(token);

      const after = db.prepare("SELECT last_activity_at FROM auth_sessions WHERE id = ?").get(session.id) as { last_activity_at: number };

      expect(after.last_activity_at).toBeGreaterThanOrEqual(before.last_activity_at);
    });
  });

  describe("revoke", () => {
    it("revokes a session", () => {
      const { session, token } = SessionService.create(testUserId);

      SessionService.revoke(session.id);

      const db = DatabaseManager.getRootDb();
      const stored = db.prepare("SELECT revoked_at FROM auth_sessions WHERE id = ?").get(session.id) as { revoked_at: number | null };

      expect(stored.revoked_at).not.toBeNull();
    });

    it("revoked session cannot be validated", () => {
      const { session, token } = SessionService.create(testUserId);

      SessionService.revoke(session.id);

      const result = SessionService.validate(token);
      expect(result).toBeNull();
    });
  });

  describe("revokeAllForUser", () => {
    it("revokes all sessions for a user", () => {
      SessionService.create(testUserId);
      SessionService.create(testUserId);
      SessionService.create(testUserId);

      const count = SessionService.revokeAllForUser(testUserId);

      expect(count).toBe(3);

      const sessions = SessionService.listForUser(testUserId);
      expect(sessions.length).toBe(0);
    });

    it("returns 0 for user with no sessions", () => {
      const count = SessionService.revokeAllForUser("usr_nonexistent");
      expect(count).toBe(0);
    });
  });

  describe("listForUser", () => {
    it("lists active sessions for a user", () => {
      SessionService.create(testUserId);
      SessionService.create(testUserId);

      const sessions = SessionService.listForUser(testUserId);

      expect(sessions.length).toBe(2);
      expect(sessions[0]!.userId).toBe(testUserId);
    });

    it("does not include revoked sessions", () => {
      const { session: s1 } = SessionService.create(testUserId);
      SessionService.create(testUserId);

      SessionService.revoke(s1.id);

      const sessions = SessionService.listForUser(testUserId);
      expect(sessions.length).toBe(1);
    });

    it("does not include expired sessions", () => {
      const { session } = SessionService.create(testUserId);
      SessionService.create(testUserId);

      // Manually expire one session
      const db = DatabaseManager.getRootDb();
      db.prepare("UPDATE auth_sessions SET expires_at = ? WHERE id = ?").run(
        Date.now() - 1000,
        session.id
      );

      const sessions = SessionService.listForUser(testUserId);
      expect(sessions.length).toBe(1);
    });

    it("returns empty array for user with no sessions", () => {
      const sessions = SessionService.listForUser("usr_nonexistent");
      expect(sessions.length).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("removes expired sessions", () => {
      const db = DatabaseManager.getRootDb();

      // Create an expired session directly
      db.prepare(`
        INSERT INTO auth_sessions
        (id, user_id, token_hash, created_at, expires_at, last_activity_at)
        VALUES ('authsess_expired', ?, 'hash1', ?, ?, ?)
      `).run(testUserId, Date.now() - 1000000, Date.now() - 1000, Date.now() - 1000000);

      // Create a valid session
      SessionService.create(testUserId);

      const deleted = SessionService.cleanup();

      expect(deleted).toBe(1);

      const remaining = db.prepare("SELECT COUNT(*) as count FROM auth_sessions").get() as { count: number };
      expect(remaining.count).toBe(1);
    });
  });

  describe("getById", () => {
    it("returns session by ID", () => {
      const { session } = SessionService.create(testUserId);

      const found = SessionService.getById(session.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.userId).toBe(testUserId);
    });

    it("returns null for non-existent session", () => {
      const found = SessionService.getById("authsess_nonexistent");
      expect(found).toBeNull();
    });
  });
});
