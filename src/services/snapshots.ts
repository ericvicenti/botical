/**
 * Snapshot Service
 *
 * Manages point-in-time snapshots of project file state.
 * Enables rollback after failed operations or undo for multi-file changes.
 * See: docs/knowledge-base/02-data-model.md#snapshot
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import crypto from "crypto";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import { FileService } from "@/services/files.ts";
import type { Database } from "bun:sqlite";

/**
 * Snapshot entity
 */
export interface Snapshot {
  id: string;
  sessionId: string | null;
  messageId: string | null;
  hash: string;
  fileCount: number;
  createdAt: number;
}

/**
 * Snapshot file entry
 */
export interface SnapshotFile {
  snapshotId: string;
  fileId: string;
  version: number;
}

/**
 * Snapshot creation options
 */
export interface SnapshotCreateOptions {
  sessionId?: string;
  messageId?: string;
}

/**
 * Database row types
 */
interface SnapshotRow {
  id: string;
  session_id: string | null;
  message_id: string | null;
  hash: string;
  file_count: number;
  created_at: number;
}

interface SnapshotFileRow {
  snapshot_id: string;
  file_id: string;
  version: number;
}

/**
 * Convert database row to snapshot entity
 */
function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    hash: row.hash,
    fileCount: row.file_count,
    createdAt: row.created_at,
  };
}

/**
 * Convert database row to snapshot file entry
 */
function rowToSnapshotFile(row: SnapshotFileRow): SnapshotFile {
  return {
    snapshotId: row.snapshot_id,
    fileId: row.file_id,
    version: row.version,
  };
}

/**
 * Snapshot Service for managing project state snapshots
 */
export class SnapshotService {
  /**
   * Create a snapshot of current file state
   * This is fast - only stores metadata references, not file copies
   */
  static create(db: Database, options: SnapshotCreateOptions = {}): Snapshot {
    const now = Date.now();
    const snapshotId = generateId(IdPrefixes.snapshot, { descending: true });

    // Get all non-deleted files and their latest versions
    const files = db
      .prepare(
        `
        SELECT f.id, f.path, f.hash,
               (SELECT MAX(version) FROM file_versions WHERE file_id = f.id) as latest_version
        FROM files f
        WHERE f.deleted_at IS NULL AND f.type = 'file'
        ORDER BY f.path
      `
      )
      .all() as Array<{
      id: string;
      path: string;
      hash: string | null;
      latest_version: number | null;
    }>;

    // Compute merkle-style hash of all files for integrity checking
    const hashInput = files
      .map((f) => `${f.path}:${f.hash || "null"}:${f.latest_version || 0}`)
      .join("\n");
    const hash = crypto.createHash("sha256").update(hashInput).digest("hex");

    // Create snapshot record
    db.prepare(
      `
      INSERT INTO snapshots (id, session_id, message_id, hash, file_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      snapshotId,
      options.sessionId ?? null,
      options.messageId ?? null,
      hash,
      files.length,
      now
    );

    // Record file versions in snapshot
    const insertFile = db.prepare(
      `
      INSERT INTO snapshot_files (snapshot_id, file_id, version)
      VALUES (?, ?, ?)
    `
    );

    for (const file of files) {
      if (file.latest_version !== null) {
        insertFile.run(snapshotId, file.id, file.latest_version);
      }
    }

    return {
      id: snapshotId,
      sessionId: options.sessionId ?? null,
      messageId: options.messageId ?? null,
      hash,
      fileCount: files.length,
      createdAt: now,
    };
  }

  /**
   * Restore project to a snapshot state
   * Reverts all files to their versions at snapshot time
   */
  static restore(
    db: Database,
    snapshotId: string,
    context: { sessionId?: string; messageId?: string } = {}
  ): { restoredCount: number; deletedCount: number } {
    const snapshot = this.getByIdOrThrow(db, snapshotId);

    // Get all files in the snapshot
    const snapshotFiles = db
      .prepare("SELECT * FROM snapshot_files WHERE snapshot_id = ?")
      .all(snapshotId) as SnapshotFileRow[];

    // Get current files
    const currentFiles = db
      .prepare("SELECT id, path FROM files WHERE deleted_at IS NULL AND type = 'file'")
      .all() as Array<{ id: string; path: string }>;

    const snapshotFileIds = new Set(snapshotFiles.map((sf) => sf.file_id));
    const currentFileIds = new Set(currentFiles.map((cf) => cf.id));

    let restoredCount = 0;
    let deletedCount = 0;

    // Restore files that exist in snapshot
    for (const sf of snapshotFiles) {
      const file = FileService.getById(db, sf.file_id);
      if (!file) continue;

      // Get current version
      const currentVersion = FileService.getLatestVersion(db, sf.file_id);

      // Skip if already at correct version
      if (currentVersion === sf.version) continue;

      // Revert to snapshot version
      FileService.revertToVersion(db, sf.file_id, sf.version, context);
      restoredCount++;
    }

    // Soft-delete files that exist now but weren't in snapshot
    for (const cf of currentFiles) {
      if (!snapshotFileIds.has(cf.id)) {
        FileService.delete(db, cf.path);
        deletedCount++;
      }
    }

    // Restore files that were deleted since snapshot
    for (const sf of snapshotFiles) {
      if (!currentFileIds.has(sf.file_id)) {
        // File was deleted - undelete it by reverting
        const file = FileService.getById(db, sf.file_id);
        if (file && file.deletedAt) {
          FileService.revertToVersion(db, sf.file_id, sf.version, context);
          restoredCount++;
        }
      }
    }

    return { restoredCount, deletedCount };
  }

  /**
   * List snapshots with optional filtering
   */
  static list(
    db: Database,
    options: {
      sessionId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Snapshot[] {
    let query = "SELECT * FROM snapshots WHERE 1=1";
    const params: (string | number | null)[] = [];

    if (options.sessionId) {
      query += " AND session_id = ?";
      params.push(options.sessionId);
    }

    // Order by ID ascending (newest first due to descending ID generation)
    query += " ORDER BY id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as SnapshotRow[];
    return rows.map(rowToSnapshot);
  }

  /**
   * Get snapshot by ID
   */
  static getById(db: Database, snapshotId: string): Snapshot | null {
    const row = db
      .prepare("SELECT * FROM snapshots WHERE id = ?")
      .get(snapshotId) as SnapshotRow | undefined;

    if (!row) return null;
    return rowToSnapshot(row);
  }

  /**
   * Get snapshot by ID or throw
   */
  static getByIdOrThrow(db: Database, snapshotId: string): Snapshot {
    const snapshot = this.getById(db, snapshotId);
    if (!snapshot) {
      throw new NotFoundError("Snapshot", snapshotId);
    }
    return snapshot;
  }

  /**
   * Delete a snapshot
   */
  static delete(db: Database, snapshotId: string): void {
    this.getByIdOrThrow(db, snapshotId);

    // Delete snapshot files first (foreign key)
    db.prepare("DELETE FROM snapshot_files WHERE snapshot_id = ?").run(snapshotId);

    // Delete snapshot
    db.prepare("DELETE FROM snapshots WHERE id = ?").run(snapshotId);
  }

  /**
   * Get files in a snapshot
   */
  static getFiles(db: Database, snapshotId: string): SnapshotFile[] {
    this.getByIdOrThrow(db, snapshotId);

    const rows = db
      .prepare("SELECT * FROM snapshot_files WHERE snapshot_id = ?")
      .all(snapshotId) as SnapshotFileRow[];

    return rows.map(rowToSnapshotFile);
  }

  /**
   * Count snapshots
   */
  static count(db: Database, sessionId?: string): number {
    let query = "SELECT COUNT(*) as count FROM snapshots";
    const params: string[] = [];

    if (sessionId) {
      query += " WHERE session_id = ?";
      params.push(sessionId);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get the most recent snapshot
   */
  static getLatest(db: Database, sessionId?: string): Snapshot | null {
    let query = "SELECT * FROM snapshots";
    const params: string[] = [];

    if (sessionId) {
      query += " WHERE session_id = ?";
      params.push(sessionId);
    }

    query += " ORDER BY id ASC LIMIT 1";

    const row = db.prepare(query).get(...params) as SnapshotRow | undefined;
    if (!row) return null;
    return rowToSnapshot(row);
  }

  /**
   * Compare two snapshots
   * Returns files that differ between them
   */
  static compare(
    db: Database,
    snapshotId1: string,
    snapshotId2: string
  ): {
    added: SnapshotFile[];
    removed: SnapshotFile[];
    modified: Array<{ fileId: string; fromVersion: number; toVersion: number }>;
  } {
    this.getByIdOrThrow(db, snapshotId1);
    this.getByIdOrThrow(db, snapshotId2);

    const files1 = this.getFiles(db, snapshotId1);
    const files2 = this.getFiles(db, snapshotId2);

    const map1 = new Map(files1.map((f) => [f.fileId, f]));
    const map2 = new Map(files2.map((f) => [f.fileId, f]));

    const added: SnapshotFile[] = [];
    const removed: SnapshotFile[] = [];
    const modified: Array<{
      fileId: string;
      fromVersion: number;
      toVersion: number;
    }> = [];

    // Find added and modified files
    for (const [fileId, file2] of map2) {
      const file1 = map1.get(fileId);
      if (!file1) {
        added.push(file2);
      } else if (file1.version !== file2.version) {
        modified.push({
          fileId,
          fromVersion: file1.version,
          toVersion: file2.version,
        });
      }
    }

    // Find removed files
    for (const [fileId, file1] of map1) {
      if (!map2.has(fileId)) {
        removed.push(file1);
      }
    }

    return { added, removed, modified };
  }
}
