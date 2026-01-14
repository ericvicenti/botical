import { Database } from "bun:sqlite";

/**
 * Migration definition
 */
export interface Migration {
  id: number;
  name: string;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

/**
 * Run migrations on a database
 *
 * Applies all migrations that haven't been applied yet.
 * Migrations are run in a transaction for atomicity.
 */
export function runMigrations(db: Database, migrations: Migration[]): void {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  // Get applied migrations
  const appliedIds = new Set(
    db
      .prepare("SELECT id FROM migrations")
      .all()
      .map((row) => (row as { id: number }).id)
  );

  // Sort migrations by ID
  const sorted = [...migrations].sort((a, b) => a.id - b.id);

  // Apply pending migrations
  for (const migration of sorted) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    // Run migration in transaction
    db.transaction(() => {
      migration.up(db);

      db.prepare(
        "INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.id, migration.name, Date.now());
    })();
  }
}

/**
 * Get list of applied migrations
 */
export function getAppliedMigrations(
  db: Database
): Array<{ id: number; name: string; appliedAt: number }> {
  try {
    return db
      .prepare("SELECT id, name, applied_at FROM migrations ORDER BY id")
      .all()
      .map((row) => {
        const r = row as { id: number; name: string; applied_at: number };
        return {
          id: r.id,
          name: r.name,
          appliedAt: r.applied_at,
        };
      });
  } catch {
    // Table doesn't exist yet
    return [];
  }
}

/**
 * Check if a specific migration has been applied
 */
export function isMigrationApplied(db: Database, migrationId: number): boolean {
  try {
    const result = db
      .prepare("SELECT 1 FROM migrations WHERE id = ?")
      .get(migrationId);
    return result !== null;
  } catch {
    return false;
  }
}
