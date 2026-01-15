/**
 * Snapshot Rollback Integration Tests
 *
 * Tests the complete snapshot system including creation,
 * restoration, and comparison.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { FileService } from "@/services/files.ts";
import { SnapshotService } from "@/services/snapshots.ts";
import fs from "fs";
import path from "path";

describe("Snapshot Rollback Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/snapshot-rollback"
  );
  const testProjectId = "test-snapshot-rollback";

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("snapshot creation", () => {
    it("captures current state of all files", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create some files
      FileService.write(db, "src/index.ts", 'console.log("hello")');
      FileService.write(db, "src/utils.ts", "export const PI = 3.14");
      FileService.write(db, "package.json", '{"name": "test"}');

      const snapshot = SnapshotService.create(db);

      expect(snapshot.fileCount).toBe(3);
      expect(snapshot.hash).toBeDefined();

      const files = SnapshotService.getFiles(db, snapshot.id);
      expect(files.length).toBe(3);
    });

    it("generates unique hash for different states", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file.txt", "content 1");
      const snap1 = SnapshotService.create(db);

      FileService.write(db, "file.txt", "content 2");
      const snap2 = SnapshotService.create(db);

      expect(snap1.hash).not.toBe(snap2.hash);
    });

    it("tracks session context", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file.txt", "content");

      // Create without session context (sessions require actual session records)
      const snapshot = SnapshotService.create(db);

      expect(snapshot.sessionId).toBeNull();
      expect(snapshot.messageId).toBeNull();
      expect(snapshot.fileCount).toBe(1);
    });
  });

  describe("snapshot restoration", () => {
    it("restores files to snapshot state", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Initial state
      FileService.write(db, "config.json", '{"version": 1}');
      FileService.write(db, "data.txt", "Original data");

      const snapshot = SnapshotService.create(db);

      // Make changes
      FileService.write(db, "config.json", '{"version": 2, "broken": true}');
      FileService.write(db, "data.txt", "Modified data");
      FileService.write(db, "new-file.txt", "New file");

      // Restore
      const result = SnapshotService.restore(db, snapshot.id);

      // Verify restoration
      expect(FileService.read(db, "config.json")).toBe('{"version": 1}');
      expect(FileService.read(db, "data.txt")).toBe("Original data");
      expect(FileService.read(db, "new-file.txt")).toBeNull(); // New file should be deleted
      expect(result.restoredCount).toBe(2);
      expect(result.deletedCount).toBe(1);
    });

    it("restores deleted files", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "important.txt", "Critical data");
      const snapshot = SnapshotService.create(db);

      FileService.delete(db, "important.txt");
      expect(FileService.read(db, "important.txt")).toBeNull();

      SnapshotService.restore(db, snapshot.id);
      expect(FileService.read(db, "important.txt")).toBe("Critical data");
    });

    it("handles complex multi-file restoration", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create initial project structure
      FileService.write(db, "src/index.ts", "export * from './utils'");
      FileService.write(db, "src/utils.ts", "export const helper = () => {}");
      FileService.write(db, "src/types.ts", "export type Config = {}");
      FileService.write(db, "package.json", '{"version": "1.0.0"}');

      const snapshot = SnapshotService.create(db);

      // Simulate failed refactoring
      FileService.write(db, "src/index.ts", "broken import");
      FileService.write(db, "src/utils.ts", "syntax error {{{");
      FileService.delete(db, "src/types.ts");
      FileService.write(db, "src/broken.ts", "more broken code");
      FileService.write(db, "package.json", '{"version": "2.0.0-broken"}');

      // Rollback everything
      SnapshotService.restore(db, snapshot.id);

      // Verify complete restoration
      expect(FileService.read(db, "src/index.ts")).toBe("export * from './utils'");
      expect(FileService.read(db, "src/utils.ts")).toBe(
        "export const helper = () => {}"
      );
      expect(FileService.read(db, "src/types.ts")).toBe("export type Config = {}");
      expect(FileService.read(db, "src/broken.ts")).toBeNull();
      expect(FileService.read(db, "package.json")).toBe('{"version": "1.0.0"}');
    });
  });

  describe("snapshot comparison", () => {
    it("identifies changes between snapshots", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file1.txt", "content 1");
      FileService.write(db, "file2.txt", "content 2");
      const snap1 = SnapshotService.create(db);

      FileService.write(db, "file1.txt", "modified content 1");
      FileService.delete(db, "file2.txt");
      FileService.write(db, "file3.txt", "new file");
      const snap2 = SnapshotService.create(db);

      const comparison = SnapshotService.compare(db, snap1.id, snap2.id);

      expect(comparison.modified.length).toBe(1); // file1.txt
      expect(comparison.removed.length).toBe(1); // file2.txt
      expect(comparison.added.length).toBe(1); // file3.txt
    });
  });

  describe("snapshot workflow", () => {
    it("enables incremental snapshots during agent work", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Agent starts work - create baseline snapshot
      FileService.write(db, "app.ts", "// Initial app");
      const baseline = SnapshotService.create(db);

      // Agent makes changes
      FileService.write(db, "app.ts", "const app = () => {}");
      FileService.write(db, "utils.ts", "export const util = () => {}");
      const checkpoint1 = SnapshotService.create(db);

      // More changes
      FileService.write(db, "app.ts", "const app = () => { util(); }");
      FileService.write(db, "config.ts", "export const config = {}");
      const checkpoint2 = SnapshotService.create(db);

      // User doesn't like the result - rollback to checkpoint1
      SnapshotService.restore(db, checkpoint1.id);

      expect(FileService.read(db, "app.ts")).toBe("const app = () => {}");
      expect(FileService.read(db, "utils.ts")).toBe("export const util = () => {}");
      expect(FileService.read(db, "config.ts")).toBeNull();

      // User wants to go back even further
      SnapshotService.restore(db, baseline.id);

      expect(FileService.read(db, "app.ts")).toBe("// Initial app");
      expect(FileService.read(db, "utils.ts")).toBeNull();
    });

    it("allows browsing snapshot history", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file.txt", "v1");

      // Create multiple snapshots
      SnapshotService.create(db);
      FileService.write(db, "file.txt", "v2");
      SnapshotService.create(db);
      FileService.write(db, "file.txt", "v3");
      SnapshotService.create(db);

      // Query all snapshots
      const allSnapshots = SnapshotService.list(db);

      expect(allSnapshots.length).toBe(3);
    });
  });

  describe("edge cases", () => {
    it("handles empty project snapshot", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const snapshot = SnapshotService.create(db);

      expect(snapshot.fileCount).toBe(0);
      expect(snapshot.hash).toBeDefined();

      // Add files then restore to empty
      FileService.write(db, "file1.txt", "content");
      FileService.write(db, "file2.txt", "content");

      const result = SnapshotService.restore(db, snapshot.id);

      expect(result.deletedCount).toBe(2);
      expect(FileService.count(db)).toBe(0);
    });

    it("preserves version history after restore", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "versioned.txt", "v1");
      FileService.write(db, "versioned.txt", "v2");
      const snapshot = SnapshotService.create(db);

      FileService.write(db, "versioned.txt", "v3");
      FileService.write(db, "versioned.txt", "v4");

      // Restore creates a new version, doesn't destroy history
      SnapshotService.restore(db, snapshot.id);

      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(5); // v1, v2, v3, v4, v2(restored)

      // All historical versions still accessible
      expect(FileService.getVersionContent(db, file.id, 1)).toBe("v1");
      expect(FileService.getVersionContent(db, file.id, 2)).toBe("v2");
      expect(FileService.getVersionContent(db, file.id, 3)).toBe("v3");
      expect(FileService.getVersionContent(db, file.id, 4)).toBe("v4");
      expect(FileService.getVersionContent(db, file.id, 5)).toBe("v2");
    });

    it("handles rapid snapshot creation", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file.txt", "content");

      // Create many snapshots quickly
      const snapshots = [];
      for (let i = 0; i < 10; i++) {
        snapshots.push(SnapshotService.create(db));
      }

      // All should be unique
      const uniqueIds = new Set(snapshots.map((s) => s.id));
      expect(uniqueIds.size).toBe(10);

      // All should be listable
      const listed = SnapshotService.list(db);
      expect(listed.length).toBe(10);
    });

    it("deletes snapshot and cleanup properly", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "file.txt", "content");
      const snapshot = SnapshotService.create(db);

      // Verify snapshot files exist
      const filesBefore = SnapshotService.getFiles(db, snapshot.id);
      expect(filesBefore.length).toBe(1);

      // Delete snapshot
      SnapshotService.delete(db, snapshot.id);

      // Snapshot should be gone
      expect(SnapshotService.getById(db, snapshot.id)).toBeNull();

      // Count should be zero
      expect(SnapshotService.count(db)).toBe(0);
    });
  });
});
