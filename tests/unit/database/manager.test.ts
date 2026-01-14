import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("DatabaseManager", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/db-test");

  beforeEach(async () => {
    // Reset and configure for test directory
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

  describe("initialize", () => {
    it("creates data directory if not exists", async () => {
      await DatabaseManager.initialize();

      expect(fs.existsSync(testDataDir)).toBe(true);
      expect(fs.existsSync(path.join(testDataDir, "projects"))).toBe(true);
    });

    it("is idempotent", async () => {
      await DatabaseManager.initialize();
      await DatabaseManager.initialize();

      expect(DatabaseManager.isInitialized()).toBe(true);
    });
  });

  describe("getRootDb", () => {
    it("returns a database connection", () => {
      const db = DatabaseManager.getRootDb();

      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe("function");
    });

    it("creates root database file", () => {
      DatabaseManager.getRootDb();

      const dbPath = Config.getRootDbPath();
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it("runs migrations on first access", () => {
      const db = DatabaseManager.getRootDb();

      // Check that users table exists (from migrations)
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        .get();
      expect(result).toBeDefined();
    });

    it("returns same instance on subsequent calls", () => {
      const db1 = DatabaseManager.getRootDb();
      const db2 = DatabaseManager.getRootDb();

      expect(db1).toBe(db2);
    });
  });

  describe("getProjectDb", () => {
    it("returns a database connection for project", () => {
      const db = DatabaseManager.getProjectDb("test_project");

      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe("function");
    });

    it("creates project directory and database file", () => {
      DatabaseManager.getProjectDb("test_project");

      const dbPath = Config.getProjectDbPath("test_project");
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it("runs project migrations on first access", () => {
      const db = DatabaseManager.getProjectDb("test_project");

      // Check that sessions table exists (from migrations)
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        .get();
      expect(result).toBeDefined();
    });

    it("returns same instance for same project", () => {
      const db1 = DatabaseManager.getProjectDb("test_project");
      const db2 = DatabaseManager.getProjectDb("test_project");

      expect(db1).toBe(db2);
    });

    it("returns different instances for different projects", () => {
      const db1 = DatabaseManager.getProjectDb("project_1");
      const db2 = DatabaseManager.getProjectDb("project_2");

      expect(db1).not.toBe(db2);
    });
  });

  describe("projectDbExists", () => {
    it("returns false for non-existent project", () => {
      expect(DatabaseManager.projectDbExists("nonexistent")).toBe(false);
    });

    it("returns true after project db is created", () => {
      DatabaseManager.getProjectDb("test_project");

      expect(DatabaseManager.projectDbExists("test_project")).toBe(true);
    });
  });

  describe("closeProjectDb", () => {
    it("closes specific project database", () => {
      DatabaseManager.getProjectDb("project_1");
      DatabaseManager.getProjectDb("project_2");

      expect(DatabaseManager.getOpenProjectCount()).toBe(2);

      DatabaseManager.closeProjectDb("project_1");

      expect(DatabaseManager.getOpenProjectCount()).toBe(1);
    });

    it("handles closing non-open project", () => {
      // Should not throw
      DatabaseManager.closeProjectDb("nonexistent");
    });
  });

  describe("closeAll", () => {
    it("closes all database connections", () => {
      DatabaseManager.getRootDb();
      DatabaseManager.getProjectDb("project_1");
      DatabaseManager.getProjectDb("project_2");

      DatabaseManager.closeAll();

      expect(DatabaseManager.getOpenProjectCount()).toBe(0);
      expect(DatabaseManager.isInitialized()).toBe(false);
    });
  });

  describe("deleteProjectDb", () => {
    it("removes project database and directory", () => {
      DatabaseManager.getProjectDb("test_project");
      const projectDir = Config.getProjectDir("test_project");

      expect(fs.existsSync(projectDir)).toBe(true);

      DatabaseManager.deleteProjectDb("test_project");

      expect(fs.existsSync(projectDir)).toBe(false);
      expect(DatabaseManager.getOpenProjectCount()).toBe(0);
    });
  });

  describe("resetAll", () => {
    it("removes all data and reinitializes", async () => {
      DatabaseManager.getRootDb();
      DatabaseManager.getProjectDb("test_project");

      await DatabaseManager.resetAll();

      // Data directory should be recreated
      expect(fs.existsSync(testDataDir)).toBe(true);

      // Should be able to create new databases
      const db = DatabaseManager.getRootDb();
      expect(db).toBeDefined();
    });
  });

  describe("getOpenProjectCount", () => {
    it("returns correct count", () => {
      expect(DatabaseManager.getOpenProjectCount()).toBe(0);

      DatabaseManager.getProjectDb("project_1");
      expect(DatabaseManager.getOpenProjectCount()).toBe(1);

      DatabaseManager.getProjectDb("project_2");
      expect(DatabaseManager.getOpenProjectCount()).toBe(2);
    });
  });

  describe("database configuration", () => {
    it("enables WAL mode", () => {
      const db = DatabaseManager.getRootDb();
      const result = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };

      expect(result.journal_mode).toBe("wal");
    });

    it("enables foreign keys", () => {
      const db = DatabaseManager.getRootDb();
      const result = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };

      expect(result.foreign_keys).toBe(1);
    });
  });
});
