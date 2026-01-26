import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { requireAuth, requireAdmin, requireCodeExecution, optionalAuth } from "@/auth/middleware.ts";
import { SessionService } from "@/auth/session.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

// Type definitions for test responses
interface AuthResponse {
  userId: string;
  email?: string;
  isAdmin?: boolean;
  canExecuteCode?: boolean;
  sessionId?: string;
  authenticated?: boolean;
}

describe("Auth Middleware", () => {
  const testDataDir = path.join(import.meta.dirname, "../../../.test-data/middleware-test");
  const originalEnv = { ...process.env };
  let testUserId: string;
  let adminUserId: string;
  let codeExecUserId: string;
  let userToken: string;
  let adminToken: string;
  let codeExecToken: string;

  beforeEach(async () => {
    // Disable single-user mode for these tests
    process.env.IRIS_SINGLE_USER = "false";

    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    const db = DatabaseManager.getRootDb();

    // Create regular user
    testUserId = "usr_regular";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'user@example.com', 'user', 0, 0, '{}', ?, ?)
    `).run(testUserId, Date.now(), Date.now());

    // Create admin user
    adminUserId = "usr_admin";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'admin@example.com', 'admin', 1, 1, '{}', ?, ?)
    `).run(adminUserId, Date.now(), Date.now());

    // Create user with code execution only
    codeExecUserId = "usr_codeexec";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'codeexec@example.com', 'codeexec', 0, 1, '{}', ?, ?)
    `).run(codeExecUserId, Date.now(), Date.now());

    // Create sessions
    userToken = SessionService.create(testUserId).token;
    adminToken = SessionService.create(adminUserId).token;
    codeExecToken = SessionService.create(codeExecUserId).token;
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };

    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("requireAuth", () => {
    it("allows request with valid Bearer token", async () => {
      const app = new Hono();
      app.get("/protected", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ userId: auth.userId });
      });

      const res = await app.request("/protected", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.userId).toBe(testUserId);
    });

    it("allows request with valid cookie", async () => {
      const app = new Hono();
      app.get("/protected", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ userId: auth.userId });
      });

      const res = await app.request("/protected", {
        headers: { Cookie: `iris_session=${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.userId).toBe(testUserId);
    });

    it("rejects request without token", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 401);
      });
      app.get("/protected", requireAuth(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/protected");

      expect(res.status).toBe(401);
    });

    it("rejects request with invalid token", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 401);
      });
      app.get("/protected", requireAuth(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/protected", {
        headers: { Authorization: "Bearer invalid-token" },
      });

      expect(res.status).toBe(401);
    });

    it("sets auth context with correct properties", async () => {
      const app = new Hono();
      app.get("/protected", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({
          userId: auth.userId,
          email: auth.email,
          isAdmin: auth.isAdmin,
          canExecuteCode: auth.canExecuteCode,
          sessionId: auth.sessionId,
        });
      });

      const res = await app.request("/protected", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.userId).toBe(adminUserId);
      expect(data.email).toBe("admin@example.com");
      expect(data.isAdmin).toBe(true);
      expect(data.canExecuteCode).toBe(true);
      expect(data.sessionId).toBeDefined();
    });
  });

  describe("optionalAuth", () => {
    it("sets auth context when valid token present", async () => {
      const app = new Hono();
      app.get("/public", optionalAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ authenticated: !!auth, userId: auth?.userId });
      });

      const res = await app.request("/public", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.authenticated).toBe(true);
      expect(data.userId).toBe(testUserId);
    });

    it("allows request without token", async () => {
      const app = new Hono();
      app.get("/public", optionalAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/public");

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.authenticated).toBe(false);
    });

    it("allows request with invalid token (no auth)", async () => {
      const app = new Hono();
      app.get("/public", optionalAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/public", {
        headers: { Authorization: "Bearer invalid" },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.authenticated).toBe(false);
    });
  });

  describe("requireAdmin", () => {
    it("allows admin users", async () => {
      const app = new Hono();
      app.get("/admin", requireAuth(), requireAdmin(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/admin", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("rejects non-admin users with 403", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        if (err.message.includes("Admin")) {
          return c.json({ error: err.message }, 403);
        }
        return c.json({ error: err.message }, 401);
      });
      app.get("/admin", requireAuth(), requireAdmin(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/admin", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 401);
      });
      app.get("/admin", requireAuth(), requireAdmin(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/admin");

      expect(res.status).toBe(401);
    });
  });

  describe("requireCodeExecution", () => {
    it("allows users with code execution privileges", async () => {
      const app = new Hono();
      app.get("/execute", requireAuth(), requireCodeExecution(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/execute", {
        headers: { Authorization: `Bearer ${codeExecToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("allows admin users (admins can execute code)", async () => {
      const app = new Hono();
      app.get("/execute", requireAuth(), requireCodeExecution(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/execute", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("rejects users without code execution privileges", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        if (err.message.includes("execution")) {
          return c.json({ error: err.message }, 403);
        }
        return c.json({ error: err.message }, 401);
      });
      app.get("/execute", requireAuth(), requireCodeExecution(), (c) => {
        return c.json({ success: true });
      });

      const res = await app.request("/execute", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("token extraction", () => {
    it("prefers Authorization header over cookie", async () => {
      // Create a second session for the admin
      const secondToken = SessionService.create(adminUserId).token;

      const app = new Hono();
      app.get("/test", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ userId: auth.userId });
      });

      // Send both header and cookie with different users' tokens
      const res = await app.request("/test", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Cookie: `iris_session=${userToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      // Should use the Bearer token (admin), not the cookie (user)
      expect(data.userId).toBe(adminUserId);
    });

    it("handles cookie with multiple values", async () => {
      const app = new Hono();
      app.get("/test", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ userId: auth.userId });
      });

      const res = await app.request("/test", {
        headers: {
          Cookie: `other=value; iris_session=${userToken}; another=test`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AuthResponse;
      expect(data.userId).toBe(testUserId);
    });
  });
});
