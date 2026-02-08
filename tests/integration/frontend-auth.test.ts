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
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import { handleError } from "@/server/middleware/index.ts";
import fs from "fs";
import path from "path";

// Type definitions for test responses
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

interface VerifyResponse {
  success: boolean;
  sessionId: string;
  token: string;
  isNewUser: boolean;
  isAdmin: boolean;
}

describe("Frontend Auth Integration", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/frontend-auth-test");
  const originalEnv = { ...process.env };
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

    // Spy on console.log to capture magic link output
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };

    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
  });

  describe("Multi-User Mode", () => {
    beforeEach(() => {
      // Enable multi-user mode
      process.env.BOTICAL_SINGLE_USER = "false";

      // Create app with auth routes and protected API routes
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

      // Mount auth routes (no auth required)
      app.route("/auth", auth);

      // Global auth middleware for all API routes
      app.use("/api/*", requireAuth());

      // API routes (protected)
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
        // Should work without any auth headers
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
        // Test various API endpoints
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
        // Step 1: Request magic link
        const magicLinkRes = await app.request("/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "frontend-test@example.com" }),
        });

        expect(magicLinkRes.status).toBe(200);

        // Step 2: Extract token from console output
        const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        expect(tokenMatch).toBeDefined();
        const token = tokenMatch![1];

        // Step 3: Verify magic link and get session
        const verifyRes = await app.request(`/auth/verify?token=${token}`);
        expect(verifyRes.status).toBe(200);

        const verifyData = (await verifyRes.json()) as VerifyResponse;
        expect(verifyData.success).toBe(true);
        expect(verifyData.sessionId).toBeDefined();
        expect(verifyData.token).toBeDefined();

        // Step 4: Use session token to access protected API
        const projectsRes = await app.request("/api/projects", {
          headers: { Authorization: `Bearer ${verifyData.token}` },
        });

        expect(projectsRes.status).toBe(200);
      });

      it("first user becomes admin", async () => {
        // Request magic link for first user
        await app.request("/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "admin@example.com" }),
        });

        // Extract and verify token
        const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        const token = tokenMatch![1];

        const verifyRes = await app.request(`/auth/verify?token=${token}`);
        const data = (await verifyRes.json()) as VerifyResponse;

        expect(data.isAdmin).toBe(true);
        expect(data.isNewUser).toBe(true);
      });

      it("subsequent users are not admin", async () => {
        // First create an admin user
        await MagicLinkService.request("admin@example.com");
        let output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        let tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        await app.request(`/auth/verify?token=${tokenMatch![1]}`);

        consoleLogSpy.mockClear();

        // Now test a second user
        await app.request("/auth/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "user@example.com" }),
        });

        output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        const token = tokenMatch![1];

        const verifyRes = await app.request(`/auth/verify?token=${token}`);
        const data = (await verifyRes.json()) as VerifyResponse;

        expect(data.isAdmin).toBe(false);
        expect(data.isNewUser).toBe(true);
      });
    });

    describe("Session Management", () => {
      let sessionToken: string;

      beforeEach(async () => {
        // Create authenticated session for tests
        await MagicLinkService.request("session-test@example.com");
        const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        const res = await app.request(`/auth/verify?token=${tokenMatch![1]}`);
        const data = (await res.json()) as VerifyResponse;
        sessionToken = data.token;
      });

      it("allows API access with valid session", async () => {
        const res = await app.request("/api/projects", {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(res.status).toBe(200);
      });

      it("blocks API access after logout", async () => {
        // Logout
        const logoutRes = await app.request("/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        expect(logoutRes.status).toBe(200);

        // Try to access API with revoked token
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
        // Mock the token creation time to be in the past
        const db = DatabaseManager.getRootDb();
        
        await MagicLinkService.request("expired-test@example.com");
        
        // Get the token from the database and manually set it as expired
        const tokenRecord = db
          .prepare("SELECT id, email FROM email_verification_tokens WHERE email = ?")
          .get("expired-test@example.com") as { id: string; email: string } | undefined;

        expect(tokenRecord).toBeDefined();

        // Update the expiry time to be in the past
        db.prepare("UPDATE email_verification_tokens SET expires_at = ? WHERE id = ?")
          .run(Date.now() - 1000, tokenRecord!.id);

        // Extract token from console output
        const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
        const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
        const token = tokenMatch![1];

        // Try to verify expired token
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
      // Enable single-user mode
      process.env.BOTICAL_SINGLE_USER = "true";

      // Create app with auth routes and protected API routes
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

      // Mount auth routes
      app.route("/auth", auth);

      // Global auth middleware for all API routes (auto-auth in single-user mode)
      app.use("/api/*", requireAuth());

      // API routes
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
        // In single-user mode, API routes should work without auth headers
        const res = await app.request("/api/projects");
        expect(res.status).toBe(200);
      });

      it("ignores auth headers in single-user mode", async () => {
        // Even with invalid auth headers, should still work
        const res = await app.request("/api/projects", {
          headers: { Authorization: "Bearer invalid-token" },
        });
        expect(res.status).toBe(200);
      });
    });
  });
});