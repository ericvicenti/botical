import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { MagicLinkService } from "@/auth/magic-link.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { AuthenticationError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

// Type definitions for test data
interface TokenRow {
  email: string;
  token_hash: string;
  used_at: number | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: number;
  user_id: string | null;
}

interface UserRow {
  email: string;
  is_admin: number;
  can_execute_code: number;
  last_login_at: number;
}

describe("MagicLinkService", () => {
  const testDataDir = path.join(import.meta.dirname, "../../../.test-data/magic-link-test");
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    // Spy on console.log to capture magic link output
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
  });

  describe("request", () => {
    it("creates a token record in database", async () => {
      await MagicLinkService.request("test@example.com");

      const db = DatabaseManager.getRootDb();
      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com") as TokenRow | undefined;

      expect(token).toBeDefined();
      expect(token!.email).toBe("test@example.com");
      expect(token!.token_hash).toBeDefined();
      expect(token!.used_at).toBeNull();
    });

    it("normalizes email to lowercase", async () => {
      await MagicLinkService.request("Test@EXAMPLE.COM");

      const db = DatabaseManager.getRootDb();
      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com");

      expect(token).toBeDefined();
    });

    it("stores request metadata", async () => {
      await MagicLinkService.request("test@example.com", {
        ipAddress: "192.168.1.1",
        userAgent: "Test Browser",
      });

      const db = DatabaseManager.getRootDb();
      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com") as TokenRow;

      expect(token.ip_address).toBe("192.168.1.1");
      expect(token.user_agent).toBe("Test Browser");
    });

    it("sets expiration time (15 minutes)", async () => {
      const before = Date.now();
      await MagicLinkService.request("test@example.com");
      const after = Date.now();

      const db = DatabaseManager.getRootDb();
      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com") as TokenRow;

      // Should expire in ~15 minutes (900000ms)
      const expectedExpiry = before + 15 * 60 * 1000;
      expect(token.expires_at).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(token.expires_at).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
    });

    it("links to existing user if email exists", async () => {
      // Create a user first
      const db = DatabaseManager.getRootDb();
      db.prepare(`
        INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
        VALUES ('usr_123', 'existing@example.com', 'existing', 0, 0, '{}', ?, ?)
      `).run(Date.now(), Date.now());

      await MagicLinkService.request("existing@example.com");

      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("existing@example.com") as TokenRow;

      expect(token.user_id).toBe("usr_123");
    });

    it("outputs magic link to console in dev mode", async () => {
      await MagicLinkService.request("test@example.com");

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      expect(output).toContain("MAGIC LINK");
    });
  });

  describe("verify", () => {
    it("creates new user on first verification", async () => {
      // Get the token by capturing console output
      await MagicLinkService.request("newuser@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      expect(tokenMatch).toBeDefined();
      const token = tokenMatch![1];

      const result = MagicLinkService.verify(token);

      expect(result.isNewUser).toBe(true);
      expect(result.userId).toMatch(/^usr_/);

      // Verify user was created
      const db = DatabaseManager.getRootDb();
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.userId) as UserRow | undefined;
      expect(user).toBeDefined();
      expect(user!.email).toBe("newuser@example.com");
    });

    it("first user becomes admin", async () => {
      await MagicLinkService.request("first@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      const result = MagicLinkService.verify(token);

      expect(result.isAdmin).toBe(true);

      const db = DatabaseManager.getRootDb();
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.userId) as UserRow;
      expect(user.is_admin).toBe(1);
      expect(user.can_execute_code).toBe(1);
    });

    it("second user is not admin", async () => {
      // Create first user
      await MagicLinkService.request("first@example.com");
      let output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      let tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      MagicLinkService.verify(tokenMatch![1]);

      // Reset spy
      consoleLogSpy.mockClear();

      // Create second user
      await MagicLinkService.request("second@example.com");
      output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const result = MagicLinkService.verify(tokenMatch![1]);

      expect(result.isAdmin).toBe(false);

      const db = DatabaseManager.getRootDb();
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.userId) as UserRow;
      expect(user.is_admin).toBe(0);
      expect(user.can_execute_code).toBe(0);
    });

    it("returns existing user for known email", async () => {
      // Create user
      const db = DatabaseManager.getRootDb();
      db.prepare(`
        INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
        VALUES ('usr_existing', 'existing@example.com', 'existing', 1, 1, '{}', ?, ?)
      `).run(Date.now(), Date.now());

      await MagicLinkService.request("existing@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);

      const result = MagicLinkService.verify(tokenMatch![1]);

      expect(result.isNewUser).toBe(false);
      expect(result.userId).toBe("usr_existing");
      expect(result.isAdmin).toBe(true);
    });

    it("marks token as used", async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      MagicLinkService.verify(token);

      const db = DatabaseManager.getRootDb();
      const tokenRecord = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com") as TokenRow;

      expect(tokenRecord.used_at).not.toBeNull();
    });

    it("throws on already used token", async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      MagicLinkService.verify(token);

      expect(() => MagicLinkService.verify(token)).toThrow(AuthenticationError);
    });

    it("throws on invalid token", () => {
      expect(() => MagicLinkService.verify("invalid-token")).toThrow(AuthenticationError);
    });

    it("throws on expired token", async () => {
      await MagicLinkService.request("test@example.com");

      // Manually expire the token
      const db = DatabaseManager.getRootDb();
      db.prepare("UPDATE email_verification_tokens SET expires_at = ? WHERE email = ?")
        .run(Date.now() - 1000, "test@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      expect(() => MagicLinkService.verify(token)).toThrow(AuthenticationError);
    });

    it("updates last_login_at", async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);

      const before = Date.now();
      const result = MagicLinkService.verify(tokenMatch![1]);
      const after = Date.now();

      const db = DatabaseManager.getRootDb();
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.userId) as UserRow;

      expect(user.last_login_at).toBeGreaterThanOrEqual(before);
      expect(user.last_login_at).toBeLessThanOrEqual(after);
    });
  });

  describe("cleanup", () => {
    it("removes expired tokens", async () => {
      const db = DatabaseManager.getRootDb();

      // Create an expired token
      db.prepare(`
        INSERT INTO email_verification_tokens (id, email, token_hash, token_type, created_at, expires_at)
        VALUES ('tok_expired', 'expired@example.com', 'hash1', 'magic_link', ?, ?)
      `).run(Date.now() - 1000000, Date.now() - 100);

      // Create a valid token
      db.prepare(`
        INSERT INTO email_verification_tokens (id, email, token_hash, token_type, created_at, expires_at)
        VALUES ('tok_valid', 'valid@example.com', 'hash2', 'magic_link', ?, ?)
      `).run(Date.now(), Date.now() + 1000000);

      const deleted = MagicLinkService.cleanup();

      expect(deleted).toBe(1);

      const remaining = db
        .prepare("SELECT COUNT(*) as count FROM email_verification_tokens")
        .get() as { count: number };
      expect(remaining.count).toBe(1);
    });
  });

  describe("getPendingTokensForEmail", () => {
    it("returns count of pending tokens", async () => {
      await MagicLinkService.request("test@example.com");
      await MagicLinkService.request("test@example.com");

      const count = MagicLinkService.getPendingTokensForEmail("test@example.com");

      expect(count).toBe(2);
    });

    it("returns 0 for unknown email", () => {
      const count = MagicLinkService.getPendingTokensForEmail("unknown@example.com");
      expect(count).toBe(0);
    });
  });
});
