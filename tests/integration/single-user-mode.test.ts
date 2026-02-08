import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import {
  requireAuth,
  optionalAuth,
  requireProjectAccess,
} from "@/auth/middleware.ts";
import { LocalUserService, LOCAL_USER_ID } from "@/auth/local-user.ts";
import { ProjectService } from "@/services/projects.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("Single-User Mode Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../.test-data/single-user-mode-test"
  );
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Enable single-user mode
    process.env.BOTICAL_SINGLE_USER = "true";
    delete process.env.RESEND_API_KEY;

    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir, host: "localhost" });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };

    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("isSingleUserMode", () => {
    it("returns true when BOTICAL_SINGLE_USER is set to true", () => {
      process.env.BOTICAL_SINGLE_USER = "true";
      Config.load({ dataDir: testDataDir });

      expect(Config.isSingleUserMode()).toBe(true);
    });

    it("returns false when BOTICAL_SINGLE_USER is set to false", () => {
      process.env.BOTICAL_SINGLE_USER = "false";
      Config.load({ dataDir: testDataDir });

      expect(Config.isSingleUserMode()).toBe(false);
    });

    it("auto-detects based on localhost and no resendApiKey", () => {
      delete process.env.BOTICAL_SINGLE_USER;
      delete process.env.RESEND_API_KEY;
      Config.load({ dataDir: testDataDir, host: "localhost" });

      expect(Config.isSingleUserMode()).toBe(true);
    });

    it("returns false when resendApiKey is configured", () => {
      delete process.env.BOTICAL_SINGLE_USER;
      Config.load({
        dataDir: testDataDir,
        host: "localhost",
        resendApiKey: "re_test123",
      });

      expect(Config.isSingleUserMode()).toBe(false);
    });

    it("returns false when host is not localhost", () => {
      delete process.env.BOTICAL_SINGLE_USER;
      delete process.env.RESEND_API_KEY;
      Config.load({ dataDir: testDataDir, host: "0.0.0.0" });

      expect(Config.isSingleUserMode()).toBe(false);
    });
  });

  describe("requireAuth in single-user mode", () => {
    it("auto-authenticates as local user without token", async () => {
      const app = new Hono();
      app.get("/protected", requireAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({
          userId: auth.userId,
          email: auth.email,
          isAdmin: auth.isAdmin,
          canExecuteCode: auth.canExecuteCode,
        });
      });

      const res = await app.request("/protected");

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        userId: string;
        email: string;
        isAdmin: boolean;
        canExecuteCode: boolean;
      };
      expect(data.userId).toBe(LOCAL_USER_ID);
      expect(data.email).toBe("local@botical.local");
      expect(data.isAdmin).toBe(true);
      expect(data.canExecuteCode).toBe(true);
    });

    it("creates local user in database on first request", async () => {
      const db = DatabaseManager.getRootDb();

      // Verify user doesn't exist
      const beforeUser = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(LOCAL_USER_ID);
      expect(beforeUser).toBeNull();

      const app = new Hono();
      app.get("/protected", requireAuth(), (c) => {
        return c.json({ success: true });
      });

      await app.request("/protected");

      // Verify user was created
      const afterUser = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(LOCAL_USER_ID);
      expect(afterUser).toBeDefined();
    });
  });

  describe("optionalAuth in single-user mode", () => {
    it("auto-authenticates as local user", async () => {
      const app = new Hono();
      app.get("/public", optionalAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({
          authenticated: !!auth,
          userId: auth?.userId,
        });
      });

      const res = await app.request("/public");

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        authenticated: boolean;
        userId: string;
      };
      expect(data.authenticated).toBe(true);
      expect(data.userId).toBe(LOCAL_USER_ID);
    });
  });

  describe("project access in single-user mode", () => {
    it("allows local user to access their own projects", async () => {
      // Create a project owned by local user
      LocalUserService.ensureLocalUser();
      const db = DatabaseManager.getRootDb();
      const project = ProjectService.create(db, {
        name: "Test Project",
        ownerId: LOCAL_USER_ID,
      });

      const app = new Hono();
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${project.id}`);

      expect(res.status).toBe(200);
    });

    it("local user can delete their projects (owner role)", async () => {
      // Create a project owned by local user
      LocalUserService.ensureLocalUser();
      const db = DatabaseManager.getRootDb();
      const project = ProjectService.create(db, {
        name: "Test Project",
        ownerId: LOCAL_USER_ID,
      });

      const app = new Hono();
      app.delete(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess("owner"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${project.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
    });
  });

  describe("multi-user mode behavior", () => {
    beforeEach(() => {
      // Disable single-user mode
      process.env.BOTICAL_SINGLE_USER = "false";
      Config.load({ dataDir: testDataDir });
    });

    it("requires authentication token in multi-user mode", async () => {
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

    it("optionalAuth does not auto-authenticate", async () => {
      const app = new Hono();
      app.get("/public", optionalAuth(), (c) => {
        const auth = c.get("auth");
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/public");

      expect(res.status).toBe(200);
      const data = (await res.json()) as { authenticated: boolean };
      expect(data.authenticated).toBe(false);
    });
  });

  describe("project creation in single-user mode", () => {
    it("creates projects with local user as owner", async () => {
      LocalUserService.ensureLocalUser();
      const db = DatabaseManager.getRootDb();

      const project = ProjectService.create(db, {
        name: "Test Project",
        ownerId: LOCAL_USER_ID,
      });

      expect(project.ownerId).toBe(LOCAL_USER_ID);

      // Verify owner membership
      const members = ProjectService.listMembers(db, project.id);
      expect(members).toHaveLength(1);
      expect(members[0]?.userId).toBe(LOCAL_USER_ID);
      expect(members[0]?.role).toBe("owner");
    });
  });
});
