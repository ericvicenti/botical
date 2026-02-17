import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/server/routes/auth.ts";
import { projects } from "@/server/routes/projects.ts";
import { requireAuth } from "@/auth/middleware.ts";
import { MagicLinkService } from "@/auth/magic-link.ts";
import { SessionService } from "@/auth/session.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { EmailService } from "@/services/email.ts";
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import { handleError } from "@/server/middleware/index.ts";
import fs from "fs";
import path from "path";

interface AuthModeResponse {
  mode: "single-user" | "multi-user";
  user?: {
    userId: string;
    email: string;
    isAdmin: boolean;
    canExecuteCode: boolean;
  } | null;
}

interface ProjectsErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

interface MagicLinkResponse {
  success: boolean;
  loginToken?: string;
}

interface PollResponse {
  status: string;
  sessionToken?: string;
  isNewUser?: boolean;
  isAdmin?: boolean;
}

describe("Frontend Auth Integration", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/frontend-auth-test");
  const originalEnv = { ...process.env };
  let app: Hono;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
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
   * Helper: full login flow using polling
   */
  async function loginUser(email: string): Promise<PollResponse> {
    consoleLogSpy.mockClear();
    const magicRes = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const magicData = (await magicRes.json()) as MagicLinkResponse;
    const loginToken = magicData.loginToken!;

    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
    const verifyToken = tokenMatch![1];

    // Verify (user clicks link)
    await app.request(`/auth/verify?token=${verifyToken}`);

    // Poll for session
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    return (await pollRes.json()) as PollResponse;
  }

  describe("Multi-User Mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "test";
      process.env.BOTICAL_SINGLE_USER = "false";
      EmailService.resetConfig();

      app = new Hono();
      app.onError((err, c) => {
        return handleError(err, c);
      });

      app.use(
        "*",
        cors({
          origin: "*",
          allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
          allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
          exposeHeaders: ["X-Request-Id"],
        })
      );

      app.route("/auth", auth);
      app.use("/api/*", requireAuth());
      app.route("/api/projects", projects);
    });

    describe("GET /auth/mode", () => {
      it("returns multi-user mode with no user", async () => {
        const res = await app.request("/auth/mode");

        expect(res.status).toBe(200);
        const data = (await res.json()) as AuthModeResponse;
        expect(data.mode).toBe("multi-user");
        expect(data.user).toBeNull();
      });

      it("is accessible without authentication", async () => {
        const res = await app.request("/auth/mode");
        expect(res.status).toBe(200);
      });
    });

    describe("Unauthenticated API Access", () => {
      it("returns AUTHENTICATION_ERROR for protected routes", async () => {
        const res = await app.request("/api/projects");

        expect(res.status).toBe(401);
        const data = (await res.json()) as ProjectsErrorResponse;
        expect(data.error.code).toBe("AUTHENTICATION_ERROR");
        expect(data.error.message).toBe("Authentication required");
      });

      it("blocks all /api/* routes without auth", async () => {
        const endpoints = [
          "/api/projects",
          "/api/sessions",
          "/api/messages",
          "/api/agents",
          "/api/tools/core",
        ];

        for (const endpoint of endpoints) {
          const res = await app.request(endpoint);
          expect(res.status).toBe(401);
          
          const data = (await res.json()) as ProjectsErrorResponse;
          expect(data.error.code).toBe("AUTHENTICATION_ERROR");
        }
      });
    });

    describe("Authentication Workflow", () => {
      it("completes full magic link workflow", async () => {
        const pollData = await loginUser("frontend-test@example.com");

        expect(pollData.status).toBe("completed");
        expect(pollData.sessionToken).toBeDefined();

        // Use session token to access protected API
        const projectsRes = await app.request("/api/projects", {
          headers: { Authorization: `Bearer ${pollData.sessionToken}` },
        });

        expect(projectsRes.status).toBe(200);
      });

      it("first user becomes admin", async () => {
        const pollData = await loginUser("admin@example.com");
        expect(pollData.isAdmin).toBe(true);
        expect(pollData.isNewUser).toBe(true);
      });

      it("subsequent users are not admin", async () => {
        await loginUser("admin@example.com");
        const pollData = await loginUser("user@example.com");

        expect(pollData.isAdmin).toBe(false);
        expect(pollData.isNewUser).toBe(true);
      });
    });

    describe("Session Management", () => {
      let sessionToken: string;

      beforeEach(async () => {
        const pollData = await loginUser("session-test@example.com");
        sessionToken = pollData.sessionToken!;
      });

      it("allows API access with valid session", async () => {
        const res = await app.request("/api/projects", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(res.status).toBe(200);
      });

      it("blocks API access after logout", async () => {
        const logoutRes = await app.request("/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(logoutRes.status).toBe(200);

        const projectsRes = await app.request("/api/projects", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(projectsRes.status).toBe(401);
        const data = (await projectsRes.json()) as ProjectsErrorResponse;
        expect(data.error.code).toBe("AUTHENTICATION_ERROR");
      });

      it("provides user info via /auth/me", async () => {
        const res = await app.request("/auth/me", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe("session-test@example.com");
      });
    });

    describe("Token Expiry", () => {
      it("rejects expired magic link tokens", async () => {
        const db = DatabaseManager.getRootDb();
        
        await MagicLinkService.request("expired-test@example.com");
        
        const tokenRecord = db
          .prepare("SELECT id, email FROM email_verification_tokens WHERE email = ?")
          .get("expired-test@example.com") as { id: string; email: string } | undefined;

        expect(tokenRecord).toBeDefined();

        db.prepare("UPDATE email_verification_tokens SET expires_at = ? WHERE id = ?")
          .run(Date.now() - 1000, tokenRecord!.id);

        const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        const token = tokenMatch![1];

        const verifyRes = await app.request(`/auth/verify?token=${token}`);
        expect(verifyRes.status).toBe(401);
      });
    });

    describe("Error Handling", () => {
      it("returns proper error format for frontend consumption", async () => {
        const res = await app.request("/api/projects");

        expect(res.status).toBe(401);
        const data = (await res.json()) as ProjectsErrorResponse;
        expect(data).toHaveProperty("error");
        expect(data.error).toHaveProperty("code", "AUTHENTICATION_ERROR");
        expect(data.error).toHaveProperty("message");
        expect(typeof data.error.message).toBe("string");
      });

      it("handles invalid magic link format", async () => {
        const res = await app.request("/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "not-an-email" }),
        });

        expect(res.status).toBe(400);
      });

      it("handles missing magic link token", async () => {
        const res = await app.request("/auth/verify");
        expect(res.status).toBe(400);
      });

      it("handles invalid magic link token", async () => {
        const res = await app.request("/auth/verify?token=invalid-token");
        expect(res.status).toBe(401);
      });
    });
  });

  describe("Single-User Mode", () => {
    beforeEach(() => {
      process.env.BOTICAL_SINGLE_USER = "true";

      app = new Hono();
      app.onError((err, c) => {
        return handleError(err, c);
      });

      app.use(
        "*",
        cors({
          origin: "*",
          allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
          allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
          exposeHeaders: ["X-Request-Id"],
        })
      );

      app.route("/auth", auth);
      app.use("/api/*", requireAuth());
      app.route("/api/projects", projects);
    });

    describe("GET /auth/mode", () => {
      it("returns single-user mode with local user", async () => {
        const res = await app.request("/auth/mode");

        expect(res.status).toBe(200);
        const data = (await res.json()) as AuthModeResponse;
        expect(data.mode).toBe("single-user");
        expect(data.user).toBeDefined();
        expect(data.user!.userId).toBeDefined();
        expect(data.user!.email).toBeDefined();
        expect(data.user!.isAdmin).toBe(true);
        expect(data.user!.canExecuteCode).toBe(true);
      });
    });

    describe("Auto-Authentication", () => {
      it("allows API access without explicit authentication", async () => {
        const res = await app.request("/api/projects");
        expect(res.status).toBe(200);
      });

      it("ignores auth headers in single-user mode", async () => {
        const res = await app.request("/api/projects", {
          headers: { Authorization: "Bearer invalid-token" },
        });
        expect(res.status).toBe(200);
      });
    });
  });
});
