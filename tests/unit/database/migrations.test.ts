import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runMigrations,
  getAppliedMigrations,
  isMigrationApplied,
  type Migration,
} from "@/database/migrations.ts";
import fs from "fs";
import path from "path";

describe("migrations", () => {
  const testDbPath = path.join(
    import.meta.dirname,
    "../../.test-data/migration-test.db"
  );
  let db: Database;

  beforeEach(() => {
    // Ensure directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Clean up any existing test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("runMigrations", () => {
    it("creates migrations table if not exists", () => {
      runMigrations(db, []);

      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
        )
        .get();
      expect(result).toBeDefined();
    });

    it("runs migrations in order", () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: "create_users",
          up: (db) => {
            db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
          },
        },
        {
          id: 2,
          name: "add_email_column",
          up: (db) => {
            db.exec("ALTER TABLE users ADD COLUMN email TEXT");
          },
        },
      ];

      runMigrations(db, migrations);

      // Check both migrations were applied
      const users = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        .get();
      expect(users).toBeDefined();

      // Check email column exists
      const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{
        name: string;
      }>;
      const hasEmail = columns.some((c) => c.name === "email");
      expect(hasEmail).toBe(true);
    });

    it("skips already applied migrations", () => {
      const createCall = {
        count: 0,
      };

      const migrations: Migration[] = [
        {
          id: 1,
          name: "test_migration",
          up: () => {
            createCall.count++;
          },
        },
      ];

      // Run twice
      runMigrations(db, migrations);
      runMigrations(db, migrations);

      expect(createCall.count).toBe(1);
    });

    it("handles migrations provided out of order", () => {
      const order: number[] = [];

      const migrations: Migration[] = [
        {
          id: 3,
          name: "third",
          up: () => {
            order.push(3);
          },
        },
        {
          id: 1,
          name: "first",
          up: () => {
            order.push(1);
          },
        },
        {
          id: 2,
          name: "second",
          up: () => {
            order.push(2);
          },
        },
      ];

      runMigrations(db, migrations);

      expect(order).toEqual([1, 2, 3]);
    });

    it("records migration in migrations table", () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: "test_migration",
          up: () => {},
        },
      ];

      runMigrations(db, migrations);

      const result = db
        .prepare("SELECT id, name FROM migrations WHERE id = ?")
        .get(1) as { id: number; name: string } | undefined;

      expect(result).toBeDefined();
      expect(result?.name).toBe("test_migration");
    });

    it("rolls back on error (atomic)", () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: "create_table",
          up: (db) => {
            db.exec("CREATE TABLE test (id TEXT)");
          },
        },
        {
          id: 2,
          name: "failing_migration",
          up: () => {
            throw new Error("Migration failed");
          },
        },
      ];

      // First migration should succeed
      try {
        runMigrations(db, migrations);
      } catch {
        // Expected to throw
      }

      // Second migration should not be recorded
      const applied = getAppliedMigrations(db);
      expect(applied).toHaveLength(1);
      expect(applied[0]?.id).toBe(1);
    });
  });

  describe("getAppliedMigrations", () => {
    it("returns empty array for new database", () => {
      const applied = getAppliedMigrations(db);
      expect(applied).toEqual([]);
    });

    it("returns applied migrations with metadata", () => {
      const migrations: Migration[] = [
        { id: 1, name: "first", up: () => {} },
        { id: 2, name: "second", up: () => {} },
      ];

      runMigrations(db, migrations);

      const applied = getAppliedMigrations(db);

      expect(applied).toHaveLength(2);
      expect(applied[0]).toEqual(
        expect.objectContaining({
          id: 1,
          name: "first",
        })
      );
      expect(applied[0]?.appliedAt).toBeGreaterThan(0);
    });

    it("returns migrations in order", () => {
      const migrations: Migration[] = [
        { id: 3, name: "third", up: () => {} },
        { id: 1, name: "first", up: () => {} },
        { id: 2, name: "second", up: () => {} },
      ];

      runMigrations(db, migrations);

      const applied = getAppliedMigrations(db);

      expect(applied.map((m) => m.id)).toEqual([1, 2, 3]);
    });
  });

  describe("isMigrationApplied", () => {
    it("returns false for unapplied migration", () => {
      expect(isMigrationApplied(db, 1)).toBe(false);
    });

    it("returns true for applied migration", () => {
      const migrations: Migration[] = [{ id: 1, name: "test", up: () => {} }];

      runMigrations(db, migrations);

      expect(isMigrationApplied(db, 1)).toBe(true);
    });

    it("returns false when migrations table does not exist", () => {
      // New database with no migrations table
      expect(isMigrationApplied(db, 1)).toBe(false);
    });
  });
});
