/**
 * Dotfiles visibility test for Files API Routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import fs from "fs";
import path from "path";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
  isHidden?: boolean;
}

describe("Files API Routes - Dotfiles visibility", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/files-dotfiles-test"
  );
  const testProjectDir = path.join(testDataDir, "test-project");
  const testUserId = "usr_test-user-dotfiles";

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

  let testProject: any;

  beforeEach(async () => {
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing data
    rootDb.prepare("DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)").run(testUserId);
    rootDb.prepare("DELETE FROM projects WHERE owner_id = ?").run(testUserId);
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test@example.com", "testuser", now, now);

    // Recreate project directory
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testProjectDir, { recursive: true });

    // Create test files including dotfiles
    fs.writeFileSync(path.join(testProjectDir, "regular-file.txt"), "content");
    fs.writeFileSync(path.join(testProjectDir, ".hidden-file"), "hidden content");
    fs.mkdirSync(path.join(testProjectDir, ".hidden-dir"));
    fs.writeFileSync(path.join(testProjectDir, ".hidden-dir", "nested-file.txt"), "nested content");
    fs.writeFileSync(path.join(testProjectDir, ".env"), "ENV=test");
    fs.writeFileSync(path.join(testProjectDir, ".gitignore"), "node_modules\\n*.log");
    fs.mkdirSync(path.join(testProjectDir, "regular-dir"));
    fs.writeFileSync(path.join(testProjectDir, "regular-dir", "file-in-dir.txt"), "dir content");

    // Create project in database
    testProject = ProjectService.create(rootDb, {
      name: "Test Project",
      description: "Test project for dotfiles",
      ownerId: testUserId,
      type: "local",
      path: testProjectDir,
    });
  });

  it("should include dotfiles in directory listing", async () => {
    const app = createApp();

    const response = await app.request(
      `/api/projects/${testProject.id}/files`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);

    const files: FileEntry[] = data.data;

    // Check that dotfiles are included
    const fileNames = files.map(f => f.name);
    expect(fileNames).toContain(".hidden-file");
    expect(fileNames).toContain(".hidden-dir");
    expect(fileNames).toContain(".env");
    expect(fileNames).toContain(".gitignore");
    expect(fileNames).toContain("regular-file.txt");
    expect(fileNames).toContain("regular-dir");

    // Check that hidden files have isHidden property set correctly
    const hiddenFile = files.find(f => f.name === ".hidden-file");
    expect(hiddenFile).toBeDefined();
    expect(hiddenFile?.isHidden).toBe(true);

    const regularFile = files.find(f => f.name === "regular-file.txt");
    expect(regularFile).toBeDefined();
    expect(regularFile?.isHidden).toBe(false);

    const hiddenDir = files.find(f => f.name === ".hidden-dir");
    expect(hiddenDir).toBeDefined();
    expect(hiddenDir?.isHidden).toBe(true);
    expect(hiddenDir?.type).toBe("directory");

    const regularDir = files.find(f => f.name === "regular-dir");
    expect(regularDir).toBeDefined();
    expect(regularDir?.isHidden).toBe(false);
    expect(regularDir?.type).toBe("directory");

    // Node modules should still be filtered out
    expect(fileNames).not.toContain("node_modules");
  });

  it("should include dotfiles in nested directory listing", async () => {
    const app = createApp();

    const response = await app.request(
      `/api/projects/${testProject.id}/files?path=${encodeURIComponent(".hidden-dir")}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);

    const files: FileEntry[] = data.data;
    const fileNames = files.map(f => f.name);

    expect(fileNames).toContain("nested-file.txt");
  });

  it("should include dotfiles in folders endpoint", async () => {
    const app = createApp();

    const response = await app.request(
      `/api/projects/${testProject.id}/folders`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("data");
    expect(data.data).toHaveProperty("entries");

    const entries = data.data.entries;
    const entryNames = entries.map((e: any) => e.name);

    // Check that dotfiles are included
    expect(entryNames).toContain(".hidden-file");
    expect(entryNames).toContain(".hidden-dir");
    expect(entryNames).toContain(".env");
    expect(entryNames).toContain(".gitignore");
    expect(entryNames).toContain("regular-file.txt");
    expect(entryNames).toContain("regular-dir");

    // Check isHidden property
    const hiddenFileEntry = entries.find((e: any) => e.name === ".hidden-file");
    expect(hiddenFileEntry?.isHidden).toBe(true);

    const regularFileEntry = entries.find((e: any) => e.name === "regular-file.txt");
    expect(regularFileEntry?.isHidden).toBe(false);
  });
});