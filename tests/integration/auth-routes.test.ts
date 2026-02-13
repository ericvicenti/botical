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
  loginToken?: string;
}

interface PollResponse {
  status: string;
  sessionToken?: string;
  isNewUser?: boolean;
  isAdmin?: boolean;
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
  const originalEnv = { ...process.env };
  let app: Hono;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    process.env.BOTICAL_SINGLE_USER = "false";
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

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

    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
  });

  /**
   * Helper: request magic link and get loginToken + verification token
   */
  async function requestAndGetTokens(email: string) {
    consoleLogSpy.mockClear();
    const res = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as MagicLinkResponse;
    const loginToken = data.loginToken!;

    // Extract verification token from console output
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
    const verifyToken = tokenMatch![1];

    return { loginToken, verifyToken };
  }

  /**
   * Helper: complete full login flow and return session token
   */
  async function loginUser(email: string) {
    const { loginToken, verifyToken } = await requestAndGetTokens(email);

    // Verify (user clicks link) - returns HTML now
    await app.request(`/auth/verify?token=${verifyToken}`);

    // Poll for completion
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    const pollData = (await pollRes.json()) as PollResponse;
    return pollData;
  }

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
    it("verifies token and returns HTML success page", async () => {
      const { verifyToken } = await requestAndGetTokens("newuser@example.com");

      const res = await app.request(`/auth/verify?token=${verifyToken}`);
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text).toContain("Login Successful");
    });

    it("returns 400 for missing token", async () => {
      const res = await app.request("/auth/verify");
      expect(res.status).toBe(400);
    });

    it("returns 401 for invalid token", async () => {
      const res = await app.request("/auth/verify?token=invalid-token");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /auth/poll-login", () => {
    it("returns pending before verification", async () => {
      const { loginToken } = await requestAndGetTokens("test@example.com");

      const res = await app.request(`/auth/poll-login?token=${loginToken}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as PollResponse;
      expect(data.status).toBe("pending");
    });

    it("returns completed with session after verification", async () => {
      const pollData = await loginUser("newuser@example.com");

      expect(pollData.status).toBe("completed");
      expect(pollData.sessionToken).toBeDefined();
      expect(pollData.isNewUser).toBe(true);
    });

    it("first user becomes admin", async () => {
      const pollData = await loginUser("first@example.com");
      expect(pollData.isAdmin).toBe(true);
    });

    it("second user is not admin", async () => {
      await loginUser("first@example.com");
      const pollData = await loginUser("second@example.com");
      expect(pollData.isAdmin).toBe(false);
    });

    it("returns error for invalid token", async () => {
      const res = await app.request("/auth/poll-login?token=invalid-token");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    let sessionToken: string;

    beforeEach(async () => {
      const pollData = await loginUser("test@example.com");
      sessionToken = pollData.sessionToken!;
    });

    it("revokes session", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      expect(res.status).toBe(200);

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
      expect(setCookie).toContain("botical_session=");
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
      const pollData = await loginUser("test@example.com");
      sessionToken = pollData.sessionToken!;
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
      const pollData = await loginUser("test@example.com");
      sessionToken = pollData.sessionToken!;
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

    beforeEach(async () => {
      const pollData = await loginUser("test@example.com");
      sessionToken = pollData.sessionToken!;
    });

    it("revokes specific session", async () => {
      // Get session list first
      const listRes = await app.request("/auth/sessions", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const listData = (await listRes.json()) as SessionsResponse;
      const sessionId = listData.sessions[0]!.id;

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
      const res = await app.request("/auth/sessions/authsess_test", {
        method: "DELETE",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/sessions/revoke-others", () => {
    let sessionToken: string;
    let userId: string;

    beforeEach(async () => {
      const pollData = await loginUser("test@example.com");
      sessionToken = pollData.sessionToken!;

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

      const meRes = await app.request("/auth/me", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(meRes.status).toBe(200);
    });
  });
});
