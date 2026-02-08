import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import {
  requireAuth,
  requireProjectAccess,
} from "@/auth/middleware.ts";
import { SessionService } from "@/auth/session.ts";
import { ProjectService } from "@/services/projects.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("requireProjectAccess Middleware", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/project-access-test"
  );
  const originalEnv = { ...process.env };

  let ownerId: string;
  let adminId: string;
  let memberId: string;
  let viewerId: string;
  let nonMemberId: string;
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;
  let nonMemberToken: string;
  let projectId: string;

  beforeEach(async () => {
    // Reset environment - disable single-user mode
    process.env.BOTICAL_SINGLE_USER = "false";

    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    const db = DatabaseManager.getRootDb();
    const now = Date.now();

    // Create owner user
    ownerId = "usr_owner";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'owner@example.com', 'owner', 0, 1, '{}', ?, ?)
    `).run(ownerId, now, now);

    // Create admin user
    adminId = "usr_admin_member";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'admin@example.com', 'admin', 0, 1, '{}', ?, ?)
    `).run(adminId, now, now);

    // Create member user
    memberId = "usr_member";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'member@example.com', 'member', 0, 1, '{}', ?, ?)
    `).run(memberId, now, now);

    // Create viewer user
    viewerId = "usr_viewer";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'viewer@example.com', 'viewer', 0, 0, '{}', ?, ?)
    `).run(viewerId, now, now);

    // Create non-member user
    nonMemberId = "usr_nonmember";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'nonmember@example.com', 'nonmember', 0, 0, '{}', ?, ?)
    `).run(nonMemberId, now, now);

    // Create sessions
    ownerToken = SessionService.create(ownerId).token;
    adminToken = SessionService.create(adminId).token;
    memberToken = SessionService.create(memberId).token;
    viewerToken = SessionService.create(viewerId).token;
    nonMemberToken = SessionService.create(nonMemberId).token;

    // Create project with owner
    const project = ProjectService.create(db, {
      name: "Test Project",
      ownerId,
    });
    projectId = project.id;

    // Add members with different roles
    ProjectService.addMember(db, projectId, adminId, "admin");
    ProjectService.addMember(db, projectId, memberId, "member");
    ProjectService.addMember(db, projectId, viewerId, "viewer");
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };

    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("basic access control", () => {
    it("allows owner access to project", async () => {
      const app = new Hono();
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("allows member access to project", async () => {
      const app = new Hono();
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("allows viewer access to project", async () => {
      const app = new Hono();
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("denies non-member access to project", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 403);
      });
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent project", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        if (err.message.includes("not found")) {
          return c.json({ error: err.message }, 404);
        }
        return c.json({ error: err.message }, 403);
      });
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request("/projects/prj_nonexistent", {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("role-based access control", () => {
    it("allows owner access with owner role requirement", async () => {
      const app = new Hono();
      app.delete(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess("owner"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("denies admin access when owner role required", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 403);
      });
      app.delete(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess("owner"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("allows admin access with admin role requirement", async () => {
      const app = new Hono();
      app.put(
        "/projects/:id/settings",
        requireAuth(),
        requireProjectAccess("admin"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("allows owner access with admin role requirement", async () => {
      const app = new Hono();
      app.put(
        "/projects/:id/settings",
        requireAuth(),
        requireProjectAccess("admin"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("denies member access with admin role requirement", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 403);
      });
      app.put(
        "/projects/:id/settings",
        requireAuth(),
        requireProjectAccess("admin"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("allows member access with member role requirement", async () => {
      const app = new Hono();
      app.post(
        "/projects/:id/files",
        requireAuth(),
        requireProjectAccess("member"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(res.status).toBe(200);
    });

    it("denies viewer access with member role requirement", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        return c.json({ error: err.message }, 403);
      });
      app.post(
        "/projects/:id/files",
        requireAuth(),
        requireProjectAccess("member"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(res.status).toBe(403);
    });

    it("allows viewer access with viewer role requirement", async () => {
      const app = new Hono();
      app.get(
        "/projects/:id/files",
        requireAuth(),
        requireProjectAccess("viewer"),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("returns 401 without authentication", async () => {
      const app = new Hono();
      app.onError((err, c) => {
        if (err.message.includes("Authentication")) {
          return c.json({ error: err.message }, 401);
        }
        return c.json({ error: err.message }, 403);
      });
      app.get(
        "/projects/:id",
        requireAuth(),
        requireProjectAccess(),
        (c) => c.json({ success: true })
      );

      const res = await app.request(`/projects/${projectId}`);

      expect(res.status).toBe(401);
    });
  });
});
