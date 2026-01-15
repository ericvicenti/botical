/**
 * File Versioning Integration Tests
 *
 * Tests the complete file versioning system including writes,
 * version tracking, and content reconstruction.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { FileService } from "@/services/files.ts";
import fs from "fs";
import path from "path";

describe("File Versioning Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/file-versioning"
  );
  const testProjectId = "test-file-versioning";

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

  describe("file creation and updates", () => {
    it("tracks all versions of a file", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create file with multiple versions
      const file = FileService.write(db, "test.txt", "Version 1");
      FileService.write(db, "test.txt", "Version 2");
      FileService.write(db, "test.txt", "Version 3");
      FileService.write(db, "test.txt", "Version 4 - final");

      // Verify version count
      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(4);

      // Verify current content
      const currentContent = FileService.read(db, "test.txt");
      expect(currentContent).toBe("Version 4 - final");
    });

    it("reconstructs any historical version", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "test.txt", "Initial content");
      FileService.write(db, "test.txt", "Second version");
      FileService.write(db, "test.txt", "Third version");
      FileService.write(db, "test.txt", "Fourth version");

      // Reconstruct each version
      expect(FileService.getVersionContent(db, file.id, 1)).toBe("Initial content");
      expect(FileService.getVersionContent(db, file.id, 2)).toBe("Second version");
      expect(FileService.getVersionContent(db, file.id, 3)).toBe("Third version");
      expect(FileService.getVersionContent(db, file.id, 4)).toBe("Fourth version");
    });

    it("handles multiline content with patches", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const v1 = `function greet() {
  console.log("Hello");
}`;

      const v2 = `function greet() {
  console.log("Hello, World!");
}

function farewell() {
  console.log("Goodbye");
}`;

      const v3 = `function greet(name) {
  console.log("Hello, " + name + "!");
}

function farewell() {
  console.log("Goodbye");
}

export { greet, farewell };`;

      const file = FileService.write(db, "utils.ts", v1);
      FileService.write(db, "utils.ts", v2);
      FileService.write(db, "utils.ts", v3);

      // Verify all versions can be reconstructed
      expect(FileService.getVersionContent(db, file.id, 1)).toBe(v1);
      expect(FileService.getVersionContent(db, file.id, 2)).toBe(v2);
      expect(FileService.getVersionContent(db, file.id, 3)).toBe(v3);

      // Verify diff provides meaningful stats
      const diff = FileService.diff(db, file.id, 1, 3);
      expect(diff.stats.linesAdded).toBeGreaterThan(0);
    });
  });

  describe("version rollback", () => {
    it("reverts to previous version", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "config.json", '{"version": 1}');
      FileService.write(db, "config.json", '{"version": 2}');
      FileService.write(db, "config.json", '{"version": 3, "broken": true}');

      // Revert to version 2
      FileService.revertToVersion(db, file.id, 2);

      expect(FileService.read(db, "config.json")).toBe('{"version": 2}');

      // Should have created a new version (4)
      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(4);
    });

    it("creates rollback chain correctly", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "data.txt", "A");
      FileService.write(db, "data.txt", "B");
      FileService.write(db, "data.txt", "C");

      // Revert to A
      FileService.revertToVersion(db, file.id, 1);
      expect(FileService.read(db, "data.txt")).toBe("A");

      // Make new change
      FileService.write(db, "data.txt", "D");

      // Version history: A -> B -> C -> A(reverted) -> D
      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(5);

      // All versions should still be accessible
      expect(FileService.getVersionContent(db, file.id, 1)).toBe("A");
      expect(FileService.getVersionContent(db, file.id, 2)).toBe("B");
      expect(FileService.getVersionContent(db, file.id, 3)).toBe("C");
      expect(FileService.getVersionContent(db, file.id, 4)).toBe("A");
      expect(FileService.getVersionContent(db, file.id, 5)).toBe("D");
    });
  });

  describe("file operations", () => {
    it("handles file deletion and recreation", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create file
      const file = FileService.write(db, "temp.txt", "temporary content");
      FileService.write(db, "temp.txt", "updated content");

      // Delete
      FileService.delete(db, "temp.txt");
      expect(FileService.read(db, "temp.txt")).toBeNull();

      // Recreate
      FileService.write(db, "temp.txt", "new content after delete");
      expect(FileService.read(db, "temp.txt")).toBe("new content after delete");

      // Old versions should still be accessible
      expect(FileService.getVersionContent(db, file.id, 1)).toBe("temporary content");
      expect(FileService.getVersionContent(db, file.id, 2)).toBe("updated content");
    });

    it("lists files with glob patterns", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      FileService.write(db, "src/index.ts", "export {}");
      FileService.write(db, "src/utils/helpers.ts", "export {}");
      FileService.write(db, "src/utils/constants.ts", "export {}");
      FileService.write(db, "test/index.test.ts", "test");
      FileService.write(db, "package.json", "{}");

      // Test different patterns
      const srcFiles = FileService.list(db, { pattern: "src/**/*.ts" });
      expect(srcFiles.length).toBe(3);

      const utilFiles = FileService.list(db, { pattern: "src/utils/*.ts" });
      expect(utilFiles.length).toBe(2);

      const allTs = FileService.list(db, { pattern: "**/*.ts" });
      expect(allTs.length).toBe(4);

      const rootFiles = FileService.list(db, { pattern: "*.json" });
      expect(rootFiles.length).toBe(1);
    });
  });

  describe("context tracking", () => {
    it("tracks version context without foreign key constraints", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Write files without session context (sessions require actual session records)
      const file = FileService.write(db, "tracked.txt", "Initial");
      FileService.write(db, "tracked.txt", "Updated by assistant");
      FileService.write(db, "tracked.txt", "User modification");

      const versions = FileService.getVersions(db, file.id);

      // All versions should be trackable
      expect(versions.length).toBe(3);
      expect(versions[2]!.version).toBe(1);
      expect(versions[1]!.version).toBe(2);
      expect(versions[0]!.version).toBe(3);
    });
  });

  describe("diff functionality", () => {
    it("provides accurate diff between versions", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(
        db,
        "code.ts",
        `function add(a, b) {
  return a + b;
}`
      );

      FileService.write(
        db,
        "code.ts",
        `function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}`
      );

      const diff = FileService.diff(db, file.id, 1, 2);

      expect(diff.stats.linesAdded).toBeGreaterThan(0);
      expect(diff.stats.linesDeleted).toBeGreaterThan(0);
      expect(diff.fromContent).toContain("function add(a, b)");
      expect(diff.toContent).toContain("function add(a: number, b: number)");
      expect(diff.toContent).toContain("function subtract");
    });
  });

  describe("edge cases", () => {
    it("handles empty files", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "empty.txt", "");
      expect(FileService.read(db, "empty.txt")).toBe("");

      FileService.write(db, "empty.txt", "now has content");
      expect(FileService.read(db, "empty.txt")).toBe("now has content");

      expect(FileService.getVersionContent(db, file.id, 1)).toBe("");
    });

    it("handles files with special characters", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const content = `Special chars: €£¥©®™
Unicode: 你好世界 🎉
Escapes: \t\n\r
Quotes: "double" 'single'`;

      FileService.write(db, "special.txt", content);
      expect(FileService.read(db, "special.txt")).toBe(content);
    });

    it("handles very long files efficiently", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create a file with many lines
      const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}: Some content here`);
      const content = lines.join("\n");

      const file = FileService.write(db, "large.txt", content);

      // Modify a few lines
      const modifiedLines = [...lines];
      modifiedLines[100] = "Modified line 101";
      modifiedLines[500] = "Modified line 501";
      modifiedLines[999] = "Modified last line";
      const modifiedContent = modifiedLines.join("\n");

      FileService.write(db, "large.txt", modifiedContent);

      // Verify both versions can be read
      expect(FileService.getVersionContent(db, file.id, 1)).toBe(content);
      expect(FileService.getVersionContent(db, file.id, 2)).toBe(modifiedContent);
    });

    it("skips version creation for unchanged content", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      const file = FileService.write(db, "stable.txt", "Unchanged content");
      FileService.write(db, "stable.txt", "Unchanged content");
      FileService.write(db, "stable.txt", "Unchanged content");

      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(1);
    });
  });
});
