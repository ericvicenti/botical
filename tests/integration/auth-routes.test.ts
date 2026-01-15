import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { auth } from "@/server/routes/auth.ts";
import { MagicLinkService } from "@/auth/magic-link.ts";
import { SessionService } from "@/auth/session.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

// Type definitions for test responses
interface MagicLinkResponse {
  success: boolean;
  message?: string;
}

interface VerifyResponse {
  success: boolean;
  sessionId: string;
  token: string;
  isNewUser: boolean;
  isAdmin: boolean;
}

interface MeResponse {
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
    canExecuteCode: boolean;
  } | null;
}

interface SessionsResponse {
  sessions: Array<{
    id: string;
    userId: string;
    isCurrent: boolean;
  }>;
}

interface RevokeOthersResponse {
  success: boolean;
  revokedCount: number;
}

describe("Auth Routes", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/auth-routes-test");
  let app: Hono;
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

    // Create app with auth routes
    app = new Hono();
    app.onError((err, c) => {
      if (err instanceof ValidationError) {
        return c.json({ error: err.message }, 400);
      }
      if (err instanceof AuthenticationError) {
        return c.json({ error: err.message }, 401);
      }
      return c.json({ error: err.message }, 500);
    });
    app.route("/auth", auth);

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

  describe("POST /auth/magic-link", () => {
    it("returns success for valid email", async () => {
      const res = await app.request("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as MagicLinkResponse;
      expect(data.success).toBe(true);
    });

    it("always returns success to prevent email enumeration", async () => {
      // Even for invalid-looking email format (if validation passes)
      const res = await app.request("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "another@example.com" }),
      });

      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid email format", async () => {
      const res = await app.request("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing email", async () => {
      const res = await app.request("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("creates token in database", async () => {
      await app.request("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      const db = DatabaseManager.getRootDb();
      const token = db
        .prepare("SELECT * FROM email_verification_tokens WHERE email = ?")
        .get("test@example.com");

      expect(token).toBeDefined();
    });
  });

  describe("GET /auth/verify", () => {
    it("verifies token and creates session", async () => {
      // Request a magic link
      await MagicLinkService.request("newuser@example.com");

      // Extract token from console output
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      expect(tokenMatch).toBeDefined();
      const token = tokenMatch![1];

      const res = await app.request(`/auth/verify?token=${token}`);

      expect(res.status).toBe(200);
      const data = (await res.json()) as VerifyResponse;
      expect(data.success).toBe(true);
      expect(data.sessionId).toBeDefined();
      expect(data.token).toBeDefined();
      expect(data.isNewUser).toBe(true);
    });

    it("sets session cookie", async () => {
      await MagicLinkService.request("test@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      const res = await app.request(`/auth/verify?token=${token}`);

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("iris_session=");
      expect(setCookie).toContain("HttpOnly");
    });

    it("first user becomes admin", async () => {
      await MagicLinkService.request("first@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      const res = await app.request(`/auth/verify?token=${token}`);
      const data = (await res.json()) as VerifyResponse;

      expect(data.isAdmin).toBe(true);
    });

    it("second user is not admin", async () => {
      // First user
      await MagicLinkService.request("first@example.com");
      let output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      let tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      await app.request(`/auth/verify?token=${tokenMatch![1]}`);

      consoleLogSpy.mockClear();

      // Second user
      await MagicLinkService.request("second@example.com");
      output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;

      expect(data.isAdmin).toBe(false);
    });

    it("returns 400 for missing token", async () => {
      const res = await app.request("/auth/verify");

      expect(res.status).toBe(400);
    });

    it("returns 401 for invalid token", async () => {
      const res = await app.request("/auth/verify?token=invalid-token");

      expect(res.status).toBe(401);
    });

    it("redirects browser to onboarding for new users", async () => {
      await MagicLinkService.request("newuser@example.com");

      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch![1];

      const res = await app.request(`/auth/verify?token=${token}`, {
        headers: { Accept: "text/html" },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/onboarding");
    });

    it("redirects browser to home for existing users", async () => {
      // Create user via first verification
      await MagicLinkService.request("existing@example.com");
      let output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      let tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      await app.request(`/auth/verify?token=${tokenMatch![1]}`);

      consoleLogSpy.mockClear();

      // Second login
      await MagicLinkService.request("existing@example.com");
      output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);

      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`, {
        headers: { Accept: "text/html" },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/");
    });
  });

  describe("POST /auth/logout", () => {
    let sessionToken: string;

    beforeEach(async () => {
      // Create a user and session
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;
      sessionToken = data.token;
    });

    it("revokes session", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);

      // Session should no longer be valid
      const validateRes = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(validateRes.status).toBe(401);
    });

    it("clears cookie", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("iris_session=");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    let sessionToken: string;

    beforeEach(async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;
      sessionToken = data.token;
    });

    it("returns current user info", async () => {
      const res = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as MeResponse;
      expect(data.user).toBeDefined();
      expect(data.user!.email).toBe("test@example.com");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.request("/auth/me");

      expect(res.status).toBe(401);
    });
  });

  describe("GET /auth/sessions", () => {
    let sessionToken: string;

    beforeEach(async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;
      sessionToken = data.token;
    });

    it("lists user sessions", async () => {
      const res = await app.request("/auth/sessions", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as SessionsResponse;
      expect(data.sessions).toBeDefined();
      expect(data.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("marks current session", async () => {
      const res = await app.request("/auth/sessions", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      const data = (await res.json()) as SessionsResponse;
      const currentSession = data.sessions.find((s) => s.isCurrent);
      expect(currentSession).toBeDefined();
    });

    it("returns 401 without authentication", async () => {
      const res = await app.request("/auth/sessions");

      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /auth/sessions/:id", () => {
    let sessionToken: string;
    let sessionId: string;

    beforeEach(async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;
      sessionToken = data.token;
      sessionId = data.sessionId;
    });

    it("revokes specific session", async () => {
      const res = await app.request(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent session", async () => {
      const res = await app.request("/auth/sessions/authsess_nonexistent", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(404);
    });

    it("returns 401 without authentication", async () => {
      const res = await app.request(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/sessions/revoke-others", () => {
    let sessionToken: string;
    let userId: string;

    beforeEach(async () => {
      await MagicLinkService.request("test@example.com");
      const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
      const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
      const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
      const data = (await res.json()) as VerifyResponse;
      sessionToken = data.token;

      // Get user ID for creating additional sessions
      const meRes = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const meData = (await meRes.json()) as MeResponse;
      userId = meData.user!.id;

      // Create additional sessions
      SessionService.create(userId);
      SessionService.create(userId);
    });

    it("revokes all other sessions", async () => {
      const res = await app.request("/auth/sessions/revoke-others", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as RevokeOthersResponse;
      expect(data.revokedCount).toBe(2);
    });

    it("keeps current session valid", async () => {
      await app.request("/auth/sessions/revoke-others", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      // Current session should still work
      const meRes = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(meRes.status).toBe(200);
    });
  });
});
