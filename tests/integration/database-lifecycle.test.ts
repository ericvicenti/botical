import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("Database Lifecycle Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/db-lifecycle"
  );

  beforeEach(() => {
    // Configure for test directory
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    // Clean up any existing test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("initialization and migration", () => {
    it("creates root database with all required tables", async () => {
      await DatabaseManager.initialize();
      const db = DatabaseManager.getRootDb();

      // Check all tables exist
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).filter((n) => !n.startsWith("sqlite_"));

      expect(tableNames).toContain("users");
      expect(tableNames).toContain("projects");
      expect(tableNames).toContain("project_members");
      expect(tableNames).toContain("api_keys");
      expect(tableNames).toContain("provider_credentials");
      expect(tableNames).toContain("settings");
      expect(tableNames).toContain("migrations");
    });

    it("creates project database with all required tables", async () => {
      await DatabaseManager.initialize();
      const db = DatabaseManager.getProjectDb("test_project");

      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).filter((n) => !n.startsWith("sqlite_"));

      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("messages");
      expect(tableNames).toContain("message_parts");
      expect(tableNames).toContain("agents");
      expect(tableNames).toContain("tools");
      expect(tableNames).toContain("files");
      expect(tableNames).toContain("file_versions");
      expect(tableNames).toContain("snapshots");
      expect(tableNames).toContain("todos");
      expect(tableNames).toContain("permissions");
      expect(tableNames).toContain("migrations");
    });
  });

  describe("data persistence", () => {
    it("persists data across database close and reopen", async () => {
      await DatabaseManager.initialize();

      // Insert data
      const db = DatabaseManager.getRootDb();
      db.prepare(
        `INSERT INTO users (id, username, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).run("usr_123", "testuser", Date.now(), Date.now());

      // Close database
      DatabaseManager.closeAll();

      // Reopen and verify data
      const db2 = DatabaseManager.getRootDb();
      const user = db2
        .prepare("SELECT * FROM users WHERE id = ?")
        .get("usr_123") as { id: string; username: string } | undefined;

      expect(user).toBeDefined();
      expect(user?.username).toBe("testuser");
    });

    it("maintains separate data per project", async () => {
      await DatabaseManager.initialize();

      // Create sessions in different projects
      const db1 = DatabaseManager.getProjectDb("project_1");
      const db2 = DatabaseManager.getProjectDb("project_2");

      db1.prepare(
        `INSERT INTO sessions (id, slug, title, agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("sess_1", "slug-1", "Project 1 Session", "default", Date.now(), Date.now());

      db2.prepare(
        `INSERT INTO sessions (id, slug, title, agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("sess_2", "slug-2", "Project 2 Session", "default", Date.now(), Date.now());

      // Verify data is isolated
      const sessions1 = db1.prepare("SELECT * FROM sessions").all();
      const sessions2 = db2.prepare("SELECT * FROM sessions").all();

      expect(sessions1).toHaveLength(1);
      expect(sessions2).toHaveLength(1);
      expect((sessions1[0] as { id: string }).id).toBe("sess_1");
      expect((sessions2[0] as { id: string }).id).toBe("sess_2");
    });
  });

  describe("cleanup", () => {
    it("removes project data completely when deleted", async () => {
      await DatabaseManager.initialize();

      // Create project database
      DatabaseManager.getProjectDb("to_delete");
      const projectDir = Config.getProjectDir("to_delete");

      expect(fs.existsSync(projectDir)).toBe(true);

      // Delete project
      DatabaseManager.deleteProjectDb("to_delete");

      expect(fs.existsSync(projectDir)).toBe(false);
      expect(DatabaseManager.projectDbExists("to_delete")).toBe(false);
    });

    it("handles multiple project creation and deletion", async () => {
      await DatabaseManager.initialize();

      // Create multiple projects
      for (let i = 0; i < 5; i++) {
        DatabaseManager.getProjectDb(`project_${i}`);
      }

      expect(DatabaseManager.getOpenProjectCount()).toBe(5);

      // Delete some
      DatabaseManager.deleteProjectDb("project_1");
      DatabaseManager.deleteProjectDb("project_3");

      expect(DatabaseManager.getOpenProjectCount()).toBe(3);
      expect(DatabaseManager.projectDbExists("project_1")).toBe(false);
      expect(DatabaseManager.projectDbExists("project_2")).toBe(true);
      expect(DatabaseManager.projectDbExists("project_3")).toBe(false);
    });
  });

  describe("concurrent access", () => {
    it("handles concurrent reads from same database", async () => {
      await DatabaseManager.initialize();
      const db = DatabaseManager.getRootDb();

      // Insert test data
      db.prepare(
        `INSERT INTO users (id, username, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).run("usr_concurrent", "concurrent_user", Date.now(), Date.now());

      // Perform concurrent reads
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve().then(() =>
          db.prepare("SELECT * FROM users WHERE id = ?").get("usr_concurrent")
        )
      );

      const results = await Promise.all(promises);

      // All should succeed and return same data
      expect(results.every((r) => r !== undefined)).toBe(true);
      expect(results.every((r) => (r as { username: string }).username === "concurrent_user")).toBe(true);
    });

    it("handles access to multiple project databases simultaneously", async () => {
      await DatabaseManager.initialize();

      // Create and access multiple project databases concurrently
      const projectIds = Array.from({ length: 5 }, (_, i) => `concurrent_${i}`);

      const promises = projectIds.map((id) =>
        Promise.resolve().then(() => {
          const db = DatabaseManager.getProjectDb(id);
          db.prepare(
            `INSERT INTO sessions (id, slug, title, agent, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(`sess_${id}`, `slug-${id}`, `Session ${id}`, "default", Date.now(), Date.now());
          return db.prepare("SELECT * FROM sessions").all();
        })
      );

      const results = await Promise.all(promises);

      expect(results.every((r) => r.length === 1)).toBe(true);
    });
  });

  describe("foreign key constraints", () => {
    it("enforces foreign key constraints in root database", async () => {
      await DatabaseManager.initialize();
      const db = DatabaseManager.getRootDb();

      // Try to insert project with non-existent owner
      let error: Error | null = null;
      try {
        db.prepare(
          `INSERT INTO projects (id, name, owner_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run("prj_orphan", "Orphan Project", "nonexistent_user", Date.now(), Date.now());
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("FOREIGN KEY constraint failed");
    });

    it("cascades delete for dependent records", async () => {
      await DatabaseManager.initialize();
      const db = DatabaseManager.getRootDb();

      // Create user
      db.prepare(
        `INSERT INTO users (id, username, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).run("usr_cascade", "cascade_user", Date.now(), Date.now());

      // Create project owned by user
      db.prepare(
        `INSERT INTO projects (id, name, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run("prj_cascade", "Cascade Project", "usr_cascade", Date.now(), Date.now());

      // Create API key for user
      db.prepare(
        `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run("key_cascade", "usr_cascade", "Test Key", "hash", "prefix", Date.now());

      // Delete user
      db.prepare("DELETE FROM users WHERE id = ?").run("usr_cascade");

      // Verify dependent records are deleted
      const projects = db.prepare("SELECT * FROM projects WHERE owner_id = ?").all("usr_cascade");
      const apiKeys = db.prepare("SELECT * FROM api_keys WHERE user_id = ?").all("usr_cascade");

      expect(projects).toHaveLength(0);
      expect(apiKeys).toHaveLength(0);
    });
  });
});
