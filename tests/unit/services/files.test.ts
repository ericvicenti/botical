/**
 * File Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { FileService } from "@/services/files.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

describe("File Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("write and read", () => {
    it("creates a new file", () => {
      const file = FileService.write(db, "test.txt", "Hello, World!");

      expect(file.id).toMatch(/^file_/);
      expect(file.path).toBe("test.txt");
      expect(file.type).toBe("file");
      expect(file.size).toBe(13);
      expect(file.hash).toBeDefined();
    });

    it("reads file content", () => {
      FileService.write(db, "test.txt", "Hello, World!");

      const content = FileService.read(db, "test.txt");
      expect(content).toBe("Hello, World!");
    });

    it("returns null for non-existent file", () => {
      const content = FileService.read(db, "nonexistent.txt");
      expect(content).toBeNull();
    });

    it("updates existing file", () => {
      FileService.write(db, "test.txt", "Original");
      FileService.write(db, "test.txt", "Updated");

      const content = FileService.read(db, "test.txt");
      expect(content).toBe("Updated");
    });

    it("creates version when updating", () => {
      const file = FileService.write(db, "test.txt", "Version 1");
      FileService.write(db, "test.txt", "Version 2");

      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(2);
    });

    it("does not create version when content unchanged", () => {
      const file = FileService.write(db, "test.txt", "Same content");
      FileService.write(db, "test.txt", "Same content");

      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(1);
    });

    it("normalizes file paths", () => {
      const file = FileService.write(db, "path/to/file.txt", "content");
      expect(file.path).toBe("path/to/file.txt");

      const content = FileService.read(db, "path/to/file.txt");
      expect(content).toBe("content");
    });

    it("strips leading slashes", () => {
      const file = FileService.write(db, "/absolute/path.txt", "content");
      expect(file.path).toBe("absolute/path.txt");
    });

    it("detects MIME type", () => {
      const jsFile = FileService.write(db, "script.js", "code");
      expect(jsFile.mimeType).toBe("application/javascript");

      const tsFile = FileService.write(db, "script.ts", "code");
      expect(tsFile.mimeType).toBe("application/typescript");

      const mdFile = FileService.write(db, "readme.md", "content");
      expect(mdFile.mimeType).toBe("text/markdown");
    });

    it("tracks session and message context", () => {
      const file = FileService.write(db, "test.txt", "content", {
        sessionId: "sess_test",
        messageId: "msg_test",
      });

      const versions = FileService.getVersions(db, file.id);
      expect(versions[0]!.sessionId).toBe("sess_test");
      expect(versions[0]!.messageId).toBe("msg_test");
    });
  });

  describe("path validation", () => {
    it("prevents path traversal with ..", () => {
      expect(() => {
        FileService.write(db, "../outside/file.txt", "content");
      }).toThrow(ValidationError);
    });

    it("prevents path traversal in nested paths", () => {
      expect(() => {
        FileService.write(db, "safe/../../../etc/passwd", "content");
      }).toThrow(ValidationError);
    });

    it("rejects empty paths", () => {
      expect(() => {
        FileService.write(db, "", "content");
      }).toThrow(ValidationError);
    });
  });

  describe("delete", () => {
    it("soft deletes a file", () => {
      FileService.write(db, "test.txt", "content");
      FileService.delete(db, "test.txt");

      const content = FileService.read(db, "test.txt");
      expect(content).toBeNull();
    });

    it("throws for non-existent file", () => {
      expect(() => {
        FileService.delete(db, "nonexistent.txt");
      }).toThrow(NotFoundError);
    });

    it("allows undelete by writing again", () => {
      FileService.write(db, "test.txt", "original");
      FileService.delete(db, "test.txt");
      FileService.write(db, "test.txt", "restored");

      const content = FileService.read(db, "test.txt");
      expect(content).toBe("restored");
    });
  });

  describe("list", () => {
    it("lists all files", () => {
      FileService.write(db, "file1.txt", "content1");
      FileService.write(db, "file2.txt", "content2");

      const files = FileService.list(db);
      expect(files.length).toBe(2);
    });

    it("excludes deleted files by default", () => {
      FileService.write(db, "kept.txt", "content");
      FileService.write(db, "deleted.txt", "content");
      FileService.delete(db, "deleted.txt");

      const files = FileService.list(db);
      expect(files.length).toBe(1);
      expect(files[0]!.path).toBe("kept.txt");
    });

    it("includes deleted when requested", () => {
      FileService.write(db, "kept.txt", "content");
      FileService.write(db, "deleted.txt", "content");
      FileService.delete(db, "deleted.txt");

      const files = FileService.list(db, { includeDeleted: true });
      expect(files.length).toBe(2);
    });

    it("supports glob pattern filtering", () => {
      FileService.write(db, "src/index.ts", "code");
      FileService.write(db, "src/utils.ts", "code");
      FileService.write(db, "test/index.test.ts", "code");

      const srcFiles = FileService.list(db, { pattern: "src/*.ts" });
      expect(srcFiles.length).toBe(2);

      const allTs = FileService.list(db, { pattern: "**/*.ts" });
      expect(allTs.length).toBe(3);
    });

    it("supports pagination", () => {
      FileService.write(db, "file1.txt", "1");
      FileService.write(db, "file2.txt", "2");
      FileService.write(db, "file3.txt", "3");

      const page1 = FileService.list(db, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = FileService.list(db, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });
  });

  describe("getMetadata", () => {
    it("returns file metadata without content", () => {
      FileService.write(db, "test.txt", "content");

      const metadata = FileService.getMetadata(db, "test.txt");
      expect(metadata).toBeDefined();
      expect(metadata?.path).toBe("test.txt");
      expect(metadata?.size).toBe(7);
    });

    it("returns null for non-existent file", () => {
      const metadata = FileService.getMetadata(db, "nonexistent.txt");
      expect(metadata).toBeNull();
    });
  });

  describe("version management", () => {
    it("gets all versions", () => {
      const file = FileService.write(db, "test.txt", "v1");
      FileService.write(db, "test.txt", "v2");
      FileService.write(db, "test.txt", "v3");

      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(3);
      expect(versions[0]!.version).toBe(3); // Newest first
      expect(versions[2]!.version).toBe(1);
    });

    it("gets specific version", () => {
      const file = FileService.write(db, "test.txt", "v1");
      FileService.write(db, "test.txt", "v2");

      const version1 = FileService.getVersion(db, file.id, 1);
      expect(version1?.version).toBe(1);

      const version2 = FileService.getVersion(db, file.id, 2);
      expect(version2?.version).toBe(2);
    });

    it("gets version content", () => {
      const file = FileService.write(db, "test.txt", "version 1");
      FileService.write(db, "test.txt", "version 2");
      FileService.write(db, "test.txt", "version 3");

      const v1Content = FileService.getVersionContent(db, file.id, 1);
      expect(v1Content).toBe("version 1");

      const v2Content = FileService.getVersionContent(db, file.id, 2);
      expect(v2Content).toBe("version 2");

      const v3Content = FileService.getVersionContent(db, file.id, 3);
      expect(v3Content).toBe("version 3");
    });

    it("returns null for non-existent version", () => {
      const file = FileService.write(db, "test.txt", "content");

      const content = FileService.getVersionContent(db, file.id, 999);
      expect(content).toBeNull();
    });

    it("reverts to previous version", () => {
      const file = FileService.write(db, "test.txt", "version 1");
      FileService.write(db, "test.txt", "version 2");
      FileService.write(db, "test.txt", "version 3");

      FileService.revertToVersion(db, file.id, 1);

      const content = FileService.read(db, "test.txt");
      expect(content).toBe("version 1");

      // Should create new version (version 4)
      const versions = FileService.getVersions(db, file.id);
      expect(versions.length).toBe(4);
    });

    it("throws when reverting to non-existent version", () => {
      const file = FileService.write(db, "test.txt", "content");

      expect(() => {
        FileService.revertToVersion(db, file.id, 999);
      }).toThrow(NotFoundError);
    });

    it("diffs two versions", () => {
      const file = FileService.write(db, "test.txt", "line1\nline2");
      FileService.write(db, "test.txt", "line1\nmodified\nline3");

      const diff = FileService.diff(db, file.id, 1, 2);
      expect(diff.fromContent).toBe("line1\nline2");
      expect(diff.toContent).toBe("line1\nmodified\nline3");
      expect(diff.stats.linesAdded).toBeGreaterThan(0);
      expect(diff.stats.linesDeleted).toBeGreaterThan(0);
    });
  });

  describe("count", () => {
    it("counts files", () => {
      FileService.write(db, "file1.txt", "1");
      FileService.write(db, "file2.txt", "2");

      expect(FileService.count(db)).toBe(2);
    });

    it("excludes deleted files by default", () => {
      FileService.write(db, "kept.txt", "1");
      FileService.write(db, "deleted.txt", "2");
      FileService.delete(db, "deleted.txt");

      expect(FileService.count(db)).toBe(1);
    });
  });

  describe("multiline content", () => {
    it("handles multiline content correctly", () => {
      const content = `function hello() {
  console.log("Hello, World!");
}

export { hello };`;

      FileService.write(db, "hello.ts", content);

      const read = FileService.read(db, "hello.ts");
      expect(read).toBe(content);
    });

    it("preserves content through version changes", () => {
      const v1 = "line 1\nline 2\nline 3";
      const v2 = "line 1\nmodified\nline 3\nline 4";
      const v3 = "completely\ndifferent\ncontent";

      const file = FileService.write(db, "test.txt", v1);
      FileService.write(db, "test.txt", v2);
      FileService.write(db, "test.txt", v3);

      expect(FileService.getVersionContent(db, file.id, 1)).toBe(v1);
      expect(FileService.getVersionContent(db, file.id, 2)).toBe(v2);
      expect(FileService.getVersionContent(db, file.id, 3)).toBe(v3);
    });
  });
});
