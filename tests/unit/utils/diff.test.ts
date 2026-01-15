/**
 * Diff Utility Tests
 */

import { describe, it, expect } from "bun:test";
import {
  createPatch,
  applyPatch,
  reversePatch,
  serializePatch,
  deserializePatch,
  isPatchEmpty,
  getPatchStats,
} from "@/utils/diff.ts";

describe("Diff Utility", () => {
  describe("createPatch", () => {
    it("creates empty patch for identical content", () => {
      const content = "line1\nline2\nline3";
      const patch = createPatch(content, content);

      expect(isPatchEmpty(patch)).toBe(true);
      expect(getPatchStats(patch).linesAdded).toBe(0);
      expect(getPatchStats(patch).linesDeleted).toBe(0);
    });

    it("creates patch for added lines", () => {
      const oldContent = "line1\nline2";
      const newContent = "line1\nline2\nline3";
      const patch = createPatch(oldContent, newContent);

      expect(getPatchStats(patch).linesAdded).toBe(1);
      expect(getPatchStats(patch).linesDeleted).toBe(0);
    });

    it("creates patch for deleted lines", () => {
      const oldContent = "line1\nline2\nline3";
      const newContent = "line1\nline2";
      const patch = createPatch(oldContent, newContent);

      expect(getPatchStats(patch).linesDeleted).toBe(1);
      expect(getPatchStats(patch).linesAdded).toBe(0);
    });

    it("creates patch for modified lines", () => {
      const oldContent = "line1\noriginal\nline3";
      const newContent = "line1\nmodified\nline3";
      const patch = createPatch(oldContent, newContent);

      // Modified line = 1 deletion + 1 insertion
      expect(getPatchStats(patch).linesDeleted).toBe(1);
      expect(getPatchStats(patch).linesAdded).toBe(1);
    });

    it("handles empty to non-empty content", () => {
      const oldContent = "";
      const newContent = "line1\nline2";
      const patch = createPatch(oldContent, newContent);

      expect(getPatchStats(patch).linesAdded).toBe(2);
      expect(getPatchStats(patch).linesDeleted).toBe(0);
    });

    it("handles non-empty to empty content", () => {
      const oldContent = "line1\nline2";
      const newContent = "";
      const patch = createPatch(oldContent, newContent);

      expect(getPatchStats(patch).linesDeleted).toBe(2);
      expect(getPatchStats(patch).linesAdded).toBe(0);
    });
  });

  describe("applyPatch", () => {
    it("applies patch to produce new content", () => {
      const oldContent = "line1\nline2\nline3";
      const newContent = "line1\nmodified\nline3\nline4";
      const patch = createPatch(oldContent, newContent);

      const result = applyPatch(oldContent, patch);
      expect(result).toBe(newContent);
    });

    it("handles multiple changes", () => {
      const oldContent = "a\nb\nc\nd\ne";
      const newContent = "a\nB\nc\nD\ne\nf";
      const patch = createPatch(oldContent, newContent);

      const result = applyPatch(oldContent, patch);
      expect(result).toBe(newContent);
    });

    it("handles additions at start", () => {
      const oldContent = "line1\nline2";
      const newContent = "new\nline1\nline2";
      const patch = createPatch(oldContent, newContent);

      const result = applyPatch(oldContent, patch);
      expect(result).toBe(newContent);
    });

    it("handles deletions at end", () => {
      const oldContent = "line1\nline2\nline3";
      const newContent = "line1";
      const patch = createPatch(oldContent, newContent);

      const result = applyPatch(oldContent, patch);
      expect(result).toBe(newContent);
    });

    it("handles complete replacement", () => {
      const oldContent = "old1\nold2\nold3";
      const newContent = "new1\nnew2";
      const patch = createPatch(oldContent, newContent);

      const result = applyPatch(oldContent, patch);
      expect(result).toBe(newContent);
    });
  });

  describe("reversePatch", () => {
    it("reverses a patch", () => {
      const oldContent = "line1\nline2\nline3";
      const newContent = "line1\nmodified\nline3";

      const patch = createPatch(oldContent, newContent);
      const reversed = reversePatch(patch);

      // Apply original patch then reverse to get back to original
      const intermediate = applyPatch(oldContent, patch);
      const result = applyPatch(intermediate, reversed);

      expect(result).toBe(oldContent);
    });

    it("reverses additions to deletions", () => {
      const oldContent = "line1";
      const newContent = "line1\nline2";

      const patch = createPatch(oldContent, newContent);
      const reversed = reversePatch(patch);

      const stats = getPatchStats(patch);
      const reversedStats = getPatchStats(reversed);

      expect(stats.linesAdded).toBe(reversedStats.linesDeleted);
      expect(stats.linesDeleted).toBe(reversedStats.linesAdded);
    });
  });

  describe("serialization", () => {
    it("serializes and deserializes patch", () => {
      const oldContent = "line1\nline2\nline3";
      const newContent = "line1\nmodified\nline3\nline4";

      const patch = createPatch(oldContent, newContent);
      const serialized = serializePatch(patch);
      const deserialized = deserializePatch(serialized);

      // Apply deserialized patch
      const result = applyPatch(oldContent, deserialized);
      expect(result).toBe(newContent);
    });

    it("produces valid JSON", () => {
      const patch = createPatch("old", "new");
      const serialized = serializePatch(patch);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe("isPatchEmpty", () => {
    it("returns true for no changes", () => {
      const content = "same content";
      const patch = createPatch(content, content);
      expect(isPatchEmpty(patch)).toBe(true);
    });

    it("returns false when changes exist", () => {
      const patch = createPatch("old", "new");
      expect(isPatchEmpty(patch)).toBe(false);
    });
  });

  describe("getPatchStats", () => {
    it("returns correct statistics", () => {
      const oldContent = "keep1\ndelete\nkeep2";
      const newContent = "keep1\ninsert\nkeep2";
      const patch = createPatch(oldContent, newContent);
      const stats = getPatchStats(patch);

      expect(stats.linesUnchanged).toBe(2); // keep1 and keep2
      expect(stats.linesDeleted).toBe(1);
      expect(stats.linesAdded).toBe(1);
    });
  });
});
