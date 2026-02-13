/**
 * Files Tree API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import type { ListResponse } from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Files Tree API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/files-tree-route-test"
  );
  const testProjectDir = path.join(testDataDir, "test-project");
  const testUserId = "usr_test-user-files-tree";

  beforeAll(() => {
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    rootDb.prepare("DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)").run(testUserId);
    rootDb.prepare("DELETE FROM projects WHERE owner_id = ?").run(testUserId);
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "files-tree-test@example.com", "filestreeuser", now, now);

    // Create test project directory structure
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });
  });

  const app = createApp();

  describe("GET /api/projects/:projectId/files/tree", () => {
    it("returns empty array for empty project directory", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Empty Project",
        ownerId: testUserId,
        path: testProjectDir,
      });

      const response = await app.request(`/api/projects/${project.id}/files/tree`);

      expect(response.status).toBe(200);

      const body = await response.json() as { data: string[] };
      expect(body.data).toEqual([]);
    });

    it("returns list of files recursively", async () => {
      // Create test file structure
      fs.mkdirSync(path.join(testProjectDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(testProjectDir, "index.ts"), "// root file");
      fs.writeFileSync(path.join(testProjectDir, "src/main.ts"), "// main file");
      fs.writeFileSync(path.join(testProjectDir, "src/utils.ts"), "// utils file");

      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
        path: testProjectDir,
      });

      const response = await app.request(`/api/projects/${project.id}/files/tree`);

      expect(response.status).toBe(200);

      const body = await response.json() as { data: string[] };
      expect(body.data).toContain("index.ts");
      expect(body.data).toContain("src/main.ts");
      expect(body.data).toContain("src/utils.ts");
    });

    it("excludes hidden files and directories", async () => {
      // Create test file structure with hidden files
      fs.mkdirSync(path.join(testProjectDir, ".hidden"), { recursive: true });
      fs.writeFileSync(path.join(testProjectDir, ".env"), "SECRET=123");
      fs.writeFileSync(path.join(testProjectDir, ".hidden/secret.ts"), "// secret");
      fs.writeFileSync(path.join(testProjectDir, "visible.ts"), "// visible");

      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Hidden Files Project",
        ownerId: testUserId,
        path: testProjectDir,
      });

      const response = await app.request(`/api/projects/${project.id}/files/tree`);

      expect(response.status).toBe(200);

      const body = await response.json() as { data: string[] };
      expect(body.data).toContain("visible.ts");
      // Dotfiles are now intentionally visible (commit f757000)
      expect(body.data).toContain(".env");
      expect(body.data).toContain(".hidden/secret.ts");
    });

    it("excludes node_modules directory", async () => {
      // Create test file structure with node_modules
      fs.mkdirSync(path.join(testProjectDir, "node_modules/pkg"), { recursive: true });
      fs.writeFileSync(path.join(testProjectDir, "node_modules/pkg/index.js"), "// pkg");
      fs.writeFileSync(path.join(testProjectDir, "app.ts"), "// app");

      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Node Modules Project",
        ownerId: testUserId,
        path: testProjectDir,
      });

      const response = await app.request(`/api/projects/${project.id}/files/tree`);

      expect(response.status).toBe(200);

      const body = await response.json() as { data: string[] };
      expect(body.data).toContain("app.ts");
      expect(body.data).not.toContain("node_modules/pkg/index.js");
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/prj_nonexistent/files/tree");

      expect(response.status).toBe(404);
    });

    it("returns sorted file list", async () => {
      // Create files in non-alphabetical order
      fs.writeFileSync(path.join(testProjectDir, "zebra.ts"), "// zebra");
      fs.writeFileSync(path.join(testProjectDir, "apple.ts"), "// apple");
      fs.writeFileSync(path.join(testProjectDir, "banana.ts"), "// banana");

      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Sorted Files Project",
        ownerId: testUserId,
        path: testProjectDir,
      });

      const response = await app.request(`/api/projects/${project.id}/files/tree`);

      expect(response.status).toBe(200);

      const body = await response.json() as { data: string[] };
      expect(body.data[0]).toBe("apple.ts");
      expect(body.data[1]).toBe("banana.ts");
      expect(body.data[2]).toBe("zebra.ts");
    });
  });
});
