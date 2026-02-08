/**
 * Root Project Integration Tests
 *
 * Tests the hardcoded root project behavior in both single-user
 * and multi-user modes, including access control and immutability.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import {
  ProjectService,
  ROOT_PROJECT_ID,
} from "@/services/projects.ts";
import { auth } from "@/server/routes/auth.ts";
import { projects } from "@/server/routes/projects.ts";
import { requireAuth } from "@/auth/middleware.ts";
import { MagicLinkService } from "@/auth/magic-link.ts";
import { handleError } from "@/server/middleware/index.ts";
import fs from "fs";
import path from "path";
import os from "os";

// Response types
interface ProjectResponse {
  data: {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
    type: string;
    path: string | null;
  };
}

interface ProjectListResponse {
  data: Array<{
    id: string;
    name: string;
    path: string | null;
  }>;
  meta: {
    total: number;
  };
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

interface VerifyResponse {
  success: boolean;
  token: string;
  isAdmin: boolean;
}

/**
 * Helper to create an authenticated session and return the bearer token
 */
async function createAuthSession(
  app: Hono,
  email: string,
  consoleLogSpy: ReturnType<typeof spyOn>
): Promise<string> {
  await app.request("/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const output = consoleLogSpy.mock.calls
    .map((c: unknown[]) => c.join(" "))
    .join("\n");
  const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
  if (!tokenMatch) throw new Error("No magic link token found in console output");

  consoleLogSpy.mockClear();

  const res = await app.request(`/auth/verify?token=${tokenMatch[1]}`);
  const data = (await res.json()) as VerifyResponse;
  return data.token;
}

describe("Root Project", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/root-project-test"
  );
  const originalEnv = { ...process.env };
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

  describe("Service Layer", () => {
    it("has a well-known project ID", () => {
      expect(ROOT_PROJECT_ID).toBe("prj_root");
    });

    it("returns root project from getById", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.getById(rootDb, ROOT_PROJECT_ID);

      expect(project).not.toBeNull();
      expect(project!.id).toBe(ROOT_PROJECT_ID);
      expect(project!.name).toBe("Root");
      expect(project!.type).toBe("local");
      expect(project!.path).toBe(os.homedir());
      expect(project!.ownerId).toBe("system");
      expect(project!.archivedAt).toBeNull();
    });

    it("returns root project from getByIdOrThrow", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.getByIdOrThrow(rootDb, ROOT_PROJECT_ID);

      expect(project.id).toBe(ROOT_PROJECT_ID);
      expect(project.name).toBe("Root");
    });

    it("path is current user home directory", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.getById(rootDb, ROOT_PROJECT_ID);

      expect(project!.path).toBe(os.homedir());
    });

    it("includes root project in list results", () => {
      const rootDb = DatabaseManager.getRootDb();
      const projects = ProjectService.list(rootDb);

      const rootProject = projects.find((p) => p.id === ROOT_PROJECT_ID);
      expect(rootProject).toBeDefined();
      expect(rootProject!.name).toBe("Root");
    });

    it("root project appears first in list", () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create a regular project first
      const now = Date.now();
      const userId = `usr_test-${now}`;
      rootDb
        .prepare(
          "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(userId, "test@example.com", "testuser", now, now);

      ProjectService.create(rootDb, {
        name: "Other Project",
        ownerId: userId,
      });

      const projects = ProjectService.list(rootDb);
      expect(projects[0].id).toBe(ROOT_PROJECT_ID);
    });

    it("prevents update of root project", () => {
      const rootDb = DatabaseManager.getRootDb();

      expect(() => {
        ProjectService.update(rootDb, ROOT_PROJECT_ID, { name: "Hacked" });
      }).toThrow("Cannot modify the root project");
    });

    it("prevents deletion of root project", () => {
      const rootDb = DatabaseManager.getRootDb();

      expect(() => {
        ProjectService.delete(rootDb, ROOT_PROJECT_ID);
      }).toThrow("Cannot delete the root project");
    });

    it("does not include root when filtering by type=remote", () => {
      const rootDb = DatabaseManager.getRootDb();
      const projects = ProjectService.list(rootDb, { type: "remote" });

      const rootProject = projects.find((p) => p.id === ROOT_PROJECT_ID);
      expect(rootProject).toBeUndefined();
    });
  });

  describe("Multi-User Access Control", () => {
    let app: Hono;

    beforeEach(() => {
      process.env.BOTICAL_SINGLE_USER = "false";

      app = new Hono();
      app.onError((err, c) => handleError(err, c));
      app.use("*", cors({ origin: "*" }));
      app.route("/auth", auth);
      app.use("/api/*", requireAuth());
      app.route("/api/projects", projects);
    });

    it("admin can see root project in list", async () => {
      // First user = admin
      const adminToken = await createAuthSession(app, "admin@example.com", consoleLogSpy);

      const res = await app.request("/api/projects", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProjectListResponse;
      const rootProject = data.data.find((p) => p.id === ROOT_PROJECT_ID);
      expect(rootProject).toBeDefined();
      expect(rootProject!.name).toBe("Root");
    });

    it("admin can access root project directly", async () => {
      const adminToken = await createAuthSession(app, "admin@example.com", consoleLogSpy);

      const res = await app.request("/api/projects/prj_root", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProjectResponse;
      expect(data.data.id).toBe(ROOT_PROJECT_ID);
      expect(data.data.path).toBe(os.homedir());
    });

    it("non-admin cannot see root project in list", async () => {
      // First user = admin
      await createAuthSession(app, "admin@example.com", consoleLogSpy);

      // Second user = not admin
      const userToken = await createAuthSession(app, "user@example.com", consoleLogSpy);

      const res = await app.request("/api/projects", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProjectListResponse;
      const rootProject = data.data.find((p) => p.id === ROOT_PROJECT_ID);
      expect(rootProject).toBeUndefined();
    });

    it("non-admin cannot access root project directly", async () => {
      // First user = admin
      await createAuthSession(app, "admin@example.com", consoleLogSpy);

      // Second user = not admin
      const userToken = await createAuthSession(app, "user@example.com", consoleLogSpy);

      const res = await app.request("/api/projects/prj_root", {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("cannot update root project even as admin", async () => {
      const adminToken = await createAuthSession(app, "admin@example.com", consoleLogSpy);

      const res = await app.request("/api/projects/prj_root", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Renamed Root" }),
      });

      expect(res.status).toBe(403);
    });

    it("cannot delete root project even as admin", async () => {
      const adminToken = await createAuthSession(app, "admin@example.com", consoleLogSpy);

      const res = await app.request("/api/projects/prj_root", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Single-User Mode", () => {
    let app: Hono;

    beforeEach(() => {
      process.env.BOTICAL_SINGLE_USER = "true";

      app = new Hono();
      app.onError((err, c) => handleError(err, c));
      app.use("*", cors({ origin: "*" }));
      app.route("/auth", auth);
      app.use("/api/*", requireAuth());
      app.route("/api/projects", projects);
    });

    it("root project is accessible without auth", async () => {
      const res = await app.request("/api/projects");

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProjectListResponse;
      const rootProject = data.data.find((p) => p.id === ROOT_PROJECT_ID);
      expect(rootProject).toBeDefined();
    });

    it("root project details accessible in single-user mode", async () => {
      const res = await app.request("/api/projects/prj_root");

      expect(res.status).toBe(200);
      const data = (await res.json()) as ProjectResponse;
      expect(data.data.id).toBe(ROOT_PROJECT_ID);
      expect(data.data.path).toBe(os.homedir());
    });
  });

  describe("Root Project Database", () => {
    it("can initialize a project database for root", () => {
      // The root project should be able to have its own project DB
      const projectDb = DatabaseManager.getProjectDb(ROOT_PROJECT_ID);
      expect(projectDb).toBeDefined();
    });
  });
});
