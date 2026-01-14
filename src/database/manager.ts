/**
 * Database Manager
 *
 * Manages SQLite database connections using a multi-database architecture.
 * See: docs/knowledge-base/01-architecture.md#database-architecture
 *
 * This pattern provides complete project isolation:
 * - Root DB: Users, projects, API keys, global settings (shared across all projects)
 * - Project DBs: Sessions, messages, files, agents (one per project)
 *
 * Benefits of this architecture:
 * - Independent backup/restore per project
 * - No cross-project query accidents
 * - Easy project deletion (delete DB file)
 * - Projects can be moved between servers
 *
 * See: docs/knowledge-base/01-architecture.md#why-multiple-databases
 */

import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { Config } from "../config/index.ts";
import { runMigrations } from "./migrations.ts";
import { ROOT_MIGRATIONS } from "./root-migrations.ts";
import { PROJECT_MIGRATIONS } from "./project-migrations.ts";
import { DatabaseError } from "../utils/errors.ts";

/**
 * Database Manager Singleton
 *
 * Provides lazy initialization for database connections.
 * Connections are created on first access and cached for reuse.
 * See: docs/knowledge-base/04-patterns.md#database-query-pattern
 */
class DatabaseManagerSingleton {
  private static instance: DatabaseManagerSingleton;
  private rootDb: Database | null = null;
  private projectDbs = new Map<string, Database>();
  private initialized = false;

  private constructor() {}

  static getInstance(): DatabaseManagerSingleton {
    if (!DatabaseManagerSingleton.instance) {
      DatabaseManagerSingleton.instance = new DatabaseManagerSingleton();
    }
    return DatabaseManagerSingleton.instance;
  }

  /**
   * Initialize the database manager
   * Creates necessary directories and sets up the root database
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const dataDir = Config.getDataDir();
    const projectsDir = path.join(dataDir, "projects");

    // Create directories
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }

    // Initialize root database
    this.getRootDb();

    this.initialized = true;
  }

  /**
   * Get the root database connection
   * Creates and initializes if necessary
   */
  getRootDb(): Database {
    if (!this.rootDb) {
      const dbPath = Config.getRootDbPath();
      const dir = path.dirname(dbPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.rootDb = new Database(dbPath);
      this.configureDatabase(this.rootDb);
      runMigrations(this.rootDb, ROOT_MIGRATIONS);
    }

    return this.rootDb;
  }

  /**
   * Get a project database connection
   * Creates and initializes if necessary
   */
  getProjectDb(projectId: string): Database {
    let db = this.projectDbs.get(projectId);

    if (!db) {
      const dbPath = Config.getProjectDbPath(projectId);
      const dir = path.dirname(dbPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      db = new Database(dbPath);
      this.configureDatabase(db);
      runMigrations(db, PROJECT_MIGRATIONS);
      this.projectDbs.set(projectId, db);
    }

    return db;
  }

  /**
   * Check if a project database exists
   */
  projectDbExists(projectId: string): boolean {
    const dbPath = Config.getProjectDbPath(projectId);
    return fs.existsSync(dbPath);
  }

  /**
   * Close a specific project database connection
   */
  closeProjectDb(projectId: string): void {
    const db = this.projectDbs.get(projectId);
    if (db) {
      db.close();
      this.projectDbs.delete(projectId);
    }
  }

  /**
   * Close all database connections
   */
  closeAll(): void {
    if (this.rootDb) {
      this.rootDb.close();
      this.rootDb = null;
    }

    for (const [projectId, db] of this.projectDbs) {
      db.close();
      this.projectDbs.delete(projectId);
    }

    this.initialized = false;
  }

  /**
   * Delete a project database
   */
  deleteProjectDb(projectId: string): void {
    this.closeProjectDb(projectId);

    const projectDir = Config.getProjectDir(projectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }

  /**
   * Reset all databases (for testing)
   * Drops all tables and re-runs migrations
   */
  async resetAll(): Promise<void> {
    // Close all connections
    this.closeAll();

    // Delete all database files
    const dataDir = Config.getDataDir();
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }

    // Re-initialize
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Configure a database with optimal settings for concurrent access.
   *
   * WAL mode is critical for real-time updates - readers don't block writers.
   * See: docs/knowledge-base/01-architecture.md#sqlite-choices
   */
  private configureDatabase(db: Database): void {
    try {
      // WAL mode enables concurrent reads during writes, critical for real-time updates.
      // See: docs/knowledge-base/01-architecture.md#wal-mode-write-ahead-logging
      db.exec("PRAGMA journal_mode = WAL");
      // Enable foreign keys for referential integrity
      db.exec("PRAGMA foreign_keys = ON");
      // NORMAL sync is safe with WAL and provides better performance
      db.exec("PRAGMA synchronous = NORMAL");
      // 64MB cache for better query performance
      db.exec("PRAGMA cache_size = -64000");
      // 256MB memory-mapped I/O for faster file access
      db.exec("PRAGMA mmap_size = 268435456");
    } catch (error) {
      throw new DatabaseError("Failed to configure database", error);
    }
  }

  /**
   * Get count of open project databases
   */
  getOpenProjectCount(): number {
    return this.projectDbs.size;
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export const DatabaseManager = DatabaseManagerSingleton.getInstance();
