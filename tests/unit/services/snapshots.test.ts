/**
 * Snapshot Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SnapshotService } from "@/services/snapshots.ts";
import { FileService } from "@/services/files.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError } from "@/utils/errors.ts";

describe("Snapshot Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a snapshot with no files", () => {
      const snapshot = SnapshotService.create(db);

      expect(snapshot.id).toMatch(/^snap_/);
      expect(snapshot.fileCount).toBe(0);
      expect(snapshot.hash).toBeDefined();
      expect(snapshot.createdAt).toBeDefined();
    });

    it("creates a snapshot with files", () => {
      FileService.write(db, "file1.txt", "content1");
      FileService.write(db, "file2.txt", "content2");

      const snapshot = SnapshotService.create(db);

      expect(snapshot.fileCount).toBe(2);
      expect(snapshot.hash).toBeDefined();
    });

    it("tracks session and message context", () => {
      const snapshot = SnapshotService.create(db, {
        sessionId: "sess_test",
        messageId: "msg_test",
      });

      expect(snapshot.sessionId).toBe("sess_test");
      expect(snapshot.messageId).toBe("msg_test");
    });

    it("generates consistent hash for same state", () => {
      FileService.write(db, "test.txt", "content");

      const snapshot1 = SnapshotService.create(db);
      const snapshot2 = SnapshotService.create(db);

      expect(snapshot1.hash).toBe(snapshot2.hash);
    });

    it("generates different hash for different state", () => {
      FileService.write(db, "test.txt", "content1");
      const snapshot1 = SnapshotService.create(db);

      FileService.write(db, "test.txt", "content2");
      const snapshot2 = SnapshotService.create(db);

      expect(snapshot1.hash).not.toBe(snapshot2.hash);
    });
  });

  describe("restore", () => {
    it("restores files to snapshot state", () => {
      // Create initial state
      FileService.write(db, "file1.txt", "original");
      const snapshot = SnapshotService.create(db);

      // Modify files
      FileService.write(db, "file1.txt", "modified");

      // Restore
      const result = SnapshotService.restore(db, snapshot.id);

      expect(result.restoredCount).toBe(1);
      expect(FileService.read(db, "file1.txt")).toBe("original");
    });

    it("removes files added after snapshot", () => {
      FileService.write(db, "original.txt", "content");
      const snapshot = SnapshotService.create(db);

      FileService.write(db, "new-file.txt", "new content");

      const result = SnapshotService.restore(db, snapshot.id);

      expect(result.deletedCount).toBe(1);
      expect(FileService.read(db, "new-file.txt")).toBeNull();
    });

    it("restores deleted files", () => {
      FileService.write(db, "file.txt", "content");
      const snapshot = SnapshotService.create(db);

      FileService.delete(db, "file.txt");
      expect(FileService.read(db, "file.txt")).toBeNull();

      SnapshotService.restore(db, snapshot.id);

      expect(FileService.read(db, "file.txt")).toBe("content");
    });

    it("skips files already at correct version", () => {
      FileService.write(db, "unchanged.txt", "same");
      const snapshot = SnapshotService.create(db);

      const result = SnapshotService.restore(db, snapshot.id);

      expect(result.restoredCount).toBe(0);
      expect(result.deletedCount).toBe(0);
    });

    it("throws for non-existent snapshot", () => {
      expect(() => {
        SnapshotService.restore(db, "snap_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("list", () => {
    it("lists all snapshots", () => {
      SnapshotService.create(db);
      SnapshotService.create(db);
      SnapshotService.create(db);

      const snapshots = SnapshotService.list(db);
      expect(snapshots.length).toBe(3);
    });

    it("lists snapshots in newest-first order", () => {
      const snap1 = SnapshotService.create(db);
      const snap2 = SnapshotService.create(db);

      const snapshots = SnapshotService.list(db);
      expect(snapshots[0]!.id).toBe(snap2.id);
      expect(snapshots[1]!.id).toBe(snap1.id);
    });

    it("filters by sessionId", () => {
      SnapshotService.create(db, { sessionId: "sess_1" });
      SnapshotService.create(db, { sessionId: "sess_2" });

      const filtered = SnapshotService.list(db, { sessionId: "sess_1" });
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.sessionId).toBe("sess_1");
    });

    it("supports pagination", () => {
      SnapshotService.create(db);
      SnapshotService.create(db);
      SnapshotService.create(db);

      const page1 = SnapshotService.list(db, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = SnapshotService.list(db, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });
  });

  describe("getById", () => {
    it("retrieves snapshot by ID", () => {
      const created = SnapshotService.create(db);

      const retrieved = SnapshotService.getById(db, created.id);
      expect(retrieved?.id).toBe(created.id);
    });

    it("returns null for non-existent snapshot", () => {
      const result = SnapshotService.getById(db, "snap_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns snapshot when it exists", () => {
      const created = SnapshotService.create(db);

      const retrieved = SnapshotService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws for non-existent snapshot", () => {
      expect(() => {
        SnapshotService.getByIdOrThrow(db, "snap_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes a snapshot", () => {
      const snapshot = SnapshotService.create(db);

      SnapshotService.delete(db, snapshot.id);

      const result = SnapshotService.getById(db, snapshot.id);
      expect(result).toBeNull();
    });

    it("throws for non-existent snapshot", () => {
      expect(() => {
        SnapshotService.delete(db, "snap_nonexistent");
      }).toThrow(NotFoundError);
    });

    it("deletes associated snapshot files", () => {
      FileService.write(db, "test.txt", "content");
      const snapshot = SnapshotService.create(db);

      const filesBefore = SnapshotService.getFiles(db, snapshot.id);
      expect(filesBefore.length).toBe(1);

      SnapshotService.delete(db, snapshot.id);

      // Verify snapshot files are also deleted
      const filesAfter = db
        .prepare("SELECT COUNT(*) as count FROM snapshot_files WHERE snapshot_id = ?")
        .get(snapshot.id) as { count: number };
      expect(filesAfter.count).toBe(0);
    });
  });

  describe("getFiles", () => {
    it("returns files in snapshot", () => {
      FileService.write(db, "file1.txt", "content1");
      FileService.write(db, "file2.txt", "content2");
      const snapshot = SnapshotService.create(db);

      const files = SnapshotService.getFiles(db, snapshot.id);
      expect(files.length).toBe(2);
    });

    it("throws for non-existent snapshot", () => {
      expect(() => {
        SnapshotService.getFiles(db, "snap_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("count", () => {
    it("counts all snapshots", () => {
      SnapshotService.create(db);
      SnapshotService.create(db);

      expect(SnapshotService.count(db)).toBe(2);
    });

    it("counts snapshots by session", () => {
      SnapshotService.create(db, { sessionId: "sess_1" });
      SnapshotService.create(db, { sessionId: "sess_1" });
      SnapshotService.create(db, { sessionId: "sess_2" });

      expect(SnapshotService.count(db, "sess_1")).toBe(2);
      expect(SnapshotService.count(db, "sess_2")).toBe(1);
    });
  });

  describe("getLatest", () => {
    it("returns most recent snapshot", () => {
      SnapshotService.create(db);
      const latest = SnapshotService.create(db);

      const result = SnapshotService.getLatest(db);
      expect(result?.id).toBe(latest.id);
    });

    it("returns null when no snapshots exist", () => {
      const result = SnapshotService.getLatest(db);
      expect(result).toBeNull();
    });

    it("filters by session", () => {
      SnapshotService.create(db, { sessionId: "sess_1" });
      const latestSess2 = SnapshotService.create(db, { sessionId: "sess_2" });

      const result = SnapshotService.getLatest(db, "sess_2");
      expect(result?.id).toBe(latestSess2.id);
    });
  });

  describe("compare", () => {
    it("identifies added files", () => {
      FileService.write(db, "file1.txt", "content");
      const snap1 = SnapshotService.create(db);

      FileService.write(db, "file2.txt", "new content");
      const snap2 = SnapshotService.create(db);

      const comparison = SnapshotService.compare(db, snap1.id, snap2.id);

      expect(comparison.added.length).toBe(1);
      expect(comparison.removed.length).toBe(0);
    });

    it("identifies removed files", () => {
      FileService.write(db, "file1.txt", "content1");
      FileService.write(db, "file2.txt", "content2");
      const snap1 = SnapshotService.create(db);

      FileService.delete(db, "file2.txt");
      const snap2 = SnapshotService.create(db);

      const comparison = SnapshotService.compare(db, snap1.id, snap2.id);

      expect(comparison.removed.length).toBe(1);
      expect(comparison.added.length).toBe(0);
    });

    it("identifies modified files", () => {
      FileService.write(db, "file.txt", "version 1");
      const snap1 = SnapshotService.create(db);

      FileService.write(db, "file.txt", "version 2");
      const snap2 = SnapshotService.create(db);

      const comparison = SnapshotService.compare(db, snap1.id, snap2.id);

      expect(comparison.modified.length).toBe(1);
      expect(comparison.modified[0]!.fromVersion).toBe(1);
      expect(comparison.modified[0]!.toVersion).toBe(2);
    });

    it("returns empty comparison for identical snapshots", () => {
      FileService.write(db, "file.txt", "content");
      const snap1 = SnapshotService.create(db);
      const snap2 = SnapshotService.create(db);

      const comparison = SnapshotService.compare(db, snap1.id, snap2.id);

      expect(comparison.added.length).toBe(0);
      expect(comparison.removed.length).toBe(0);
      expect(comparison.modified.length).toBe(0);
    });
  });
});
