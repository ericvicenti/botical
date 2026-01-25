/**
 * Processes API Integration Tests
 *
 * Tests the process spawning and management via REST API.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { projectProcesses, processes } from "@/server/routes/processes.ts";
import { handleError } from "@/server/middleware/error-handler.ts";

describe("Processes API", () => {
  let db: Database;
  let app: Hono;
  const projectId = "prj_test-integration";
  let originalGetProjectDb: typeof DatabaseManager.getProjectDb;
  let originalGetOpenProjectIds: typeof DatabaseManager.getOpenProjectIds;

  beforeAll(() => {
    // Create in-memory database
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Store original methods
    originalGetProjectDb = DatabaseManager.getProjectDb.bind(DatabaseManager);
    originalGetOpenProjectIds = DatabaseManager.getOpenProjectIds.bind(DatabaseManager);

    // Mock DatabaseManager to return our test database
    DatabaseManager.getProjectDb = (id: string) => {
      if (id === projectId) return db;
      return originalGetProjectDb(id);
    };

    DatabaseManager.getOpenProjectIds = () => [projectId];

    // Create test app with error handler
    app = new Hono();
    app.onError((err, c) => handleError(err, c));
    app.route("/api/projects", projectProcesses);
    app.route("/api/processes", processes);
  });

  afterAll(() => {
    // Restore original methods
    DatabaseManager.getProjectDb = originalGetProjectDb;
    DatabaseManager.getOpenProjectIds = originalGetOpenProjectIds;
    db.close();
  });

  describe("POST /api/projects/:projectId/processes", () => {
    // Note: This test requires real PTY support and may fail in CI environments
    it.skip("spawns a simple command process", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/processes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "command",
            command: "echo hello",
            scope: "project",
            scopeId: projectId,
            createdBy: "test-user",
          }),
        }
      );

      expect(response.status).toBe(201);

      const body = (await response.json()) as {
        data: { id: string; command: string; type: string; projectId: string };
      };
      expect(body.data).toBeDefined();
      expect(body.data.id).toMatch(/^proc_/);
      expect(body.data.command).toBe("echo hello");
      expect(body.data.type).toBe("command");
      expect(body.data.projectId).toBe(projectId);
    });

    it("rejects empty command", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/processes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "command",
            command: "",
            scope: "project",
            scopeId: projectId,
            createdBy: "test-user",
          }),
        }
      );

      expect(response.status).toBe(400);
    });

    it("rejects invalid type", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/processes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "invalid",
            command: "echo hello",
            scope: "project",
            scopeId: projectId,
            createdBy: "test-user",
          }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/projects/:projectId/processes", () => {
    it("lists processes for project", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/processes`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: unknown[];
        meta: { total: number };
      };
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(0);
    });

    it("filters by type", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/processes?type=command`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as { data: Array<{ type: string }> };
      for (const process of body.data) {
        expect(process.type).toBe("command");
      }
    });
  });
});
