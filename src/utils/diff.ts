/**
 * Diff Utility for File Versioning
 *
 * Implements line-based diff and patch operations for file versioning.
 * Uses a longest common subsequence (LCS) algorithm for generating diffs.
 * See: docs/knowledge-base/02-data-model.md#file-versioning
 *
 * The diff format stores changes as a JSON array of operations:
 * - { op: 'keep', lines: [...] } - unchanged lines
 * - { op: 'delete', lines: [...] } - removed lines
 * - { op: 'insert', lines: [...] } - added lines
 */

/**
 * Diff operation types
 */
export type DiffOp =
  | { op: "keep"; lines: string[] }
  | { op: "delete"; lines: string[] }
  | { op: "insert"; lines: string[] };

/**
 * Patch format for storage
 */
export interface Patch {
  ops: DiffOp[];
}

/**
 * Create a diff (patch) between two strings
 *
 * @param oldContent - The original content
 * @param newContent - The new content
 * @returns A patch that can be applied to oldContent to produce newContent
 */
export function createPatch(oldContent: string, newContent: string): Patch {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const ops = diffLines(oldLines, newLines);
  return { ops };
}

/**
 * Apply a patch to content to produce the new version
 *
 * @param content - The content to patch
 * @param patch - The patch to apply
 * @returns The patched content
 */
export function applyPatch(content: string, patch: Patch): string {
  const lines = splitLines(content);
  const result: string[] = [];
  let lineIndex = 0;

  for (const op of patch.ops) {
    switch (op.op) {
      case "keep":
        // Advance through kept lines
        for (let i = 0; i < op.lines.length; i++) {
          const line = lines[lineIndex];
          if (lineIndex < lines.length && line !== undefined) {
            result.push(line);
            lineIndex++;
          }
        }
        break;
      case "delete":
        // Skip deleted lines
        lineIndex += op.lines.length;
        break;
      case "insert":
        // Add inserted lines
        result.push(...op.lines);
        break;
    }
  }

  return joinLines(result);
}

/**
 * Reverse a patch to get the inverse operation
 *
 * @param patch - The patch to reverse
 * @returns A patch that undoes the original patch
 */
export function reversePatch(patch: Patch): Patch {
  const ops: DiffOp[] = [];

  for (const op of patch.ops) {
    switch (op.op) {
      case "keep":
        ops.push(op);
        break;
      case "delete":
        ops.push({ op: "insert", lines: op.lines });
        break;
      case "insert":
        ops.push({ op: "delete", lines: op.lines });
        break;
    }
  }

  return { ops };
}

/**
 * Serialize a patch for storage
 */
export function serializePatch(patch: Patch): string {
  return JSON.stringify(patch);
}

/**
 * Deserialize a patch from storage
 */
export function deserializePatch(serialized: string): Patch {
  return JSON.parse(serialized) as Patch;
}

/**
 * Check if a patch is empty (no changes)
 */
export function isPatchEmpty(patch: Patch): boolean {
  return patch.ops.every((op) => op.op === "keep");
}

/**
 * Get statistics about a patch
 */
export function getPatchStats(patch: Patch): {
  linesAdded: number;
  linesDeleted: number;
  linesUnchanged: number;
} {
  let linesAdded = 0;
  let linesDeleted = 0;
  let linesUnchanged = 0;

  for (const op of patch.ops) {
    switch (op.op) {
      case "keep":
        linesUnchanged += op.lines.length;
        break;
      case "delete":
        linesDeleted += op.lines.length;
        break;
      case "insert":
        linesAdded += op.lines.length;
        break;
    }
  }

  return { linesAdded, linesDeleted, linesUnchanged };
}

/**
 * Split content into lines, preserving line endings
 */
function splitLines(content: string): string[] {
  if (content === "") return [];
  // Split on newlines but keep track of them
  return content.split(/\n/);
}

/**
 * Join lines back into content
 */
function joinLines(lines: string[]): string {
  return lines.join("\n");
}

/**
 * Compute diff operations using LCS (Longest Common Subsequence)
 */
function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // Use Myers-like approach for smaller memory footprint on large files
  // For very large files, we use a simpler greedy approach
  if (m > 10000 || n > 10000) {
    return diffLinesGreedy(oldLines, newLines);
  }

  // Standard LCS dynamic programming
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find the diff
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;

  // Collect operations in reverse order
  const reverseOps: DiffOp[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reverseOps.push({ op: "keep", lines: [oldLines[i - 1]!] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      reverseOps.push({ op: "insert", lines: [newLines[j - 1]!] });
      j--;
    } else {
      reverseOps.push({ op: "delete", lines: [oldLines[i - 1]!] });
      i--;
    }
  }

  // Reverse and merge consecutive operations of the same type
  return mergeOps(reverseOps.reverse());
}

/**
 * Greedy diff for very large files
 */
function diffLinesGreedy(oldLines: string[], newLines: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    // Find common prefix
    const keepLines: string[] = [];
    while (
      oldIdx < oldLines.length &&
      newIdx < newLines.length &&
      oldLines[oldIdx] === newLines[newIdx]
    ) {
      keepLines.push(oldLines[oldIdx]!);
      oldIdx++;
      newIdx++;
    }
    if (keepLines.length > 0) {
      ops.push({ op: "keep", lines: keepLines });
    }

    // Find differences
    const deleteLines: string[] = [];
    const insertLines: string[] = [];

    // Look ahead to find next common line
    let oldLookAhead = oldIdx;
    let newLookAhead = newIdx;
    let foundCommon = false;

    // Limit look-ahead to avoid O(n^2)
    const maxLookAhead = 100;

    for (let delta = 0; delta < maxLookAhead && !foundCommon; delta++) {
      // Check if newLines[newIdx] appears in oldLines soon
      for (
        let o = oldIdx;
        o <= Math.min(oldIdx + delta, oldLines.length - 1);
        o++
      ) {
        if (oldLines[o] === newLines[newIdx + delta]) {
          // Delete lines from old up to o
          for (let i = oldIdx; i < o; i++) {
            deleteLines.push(oldLines[i]!);
          }
          // Insert lines from new up to newIdx + delta
          for (let i = newIdx; i < newIdx + delta; i++) {
            insertLines.push(newLines[i]!);
          }
          oldLookAhead = o;
          newLookAhead = newIdx + delta;
          foundCommon = true;
          break;
        }
      }
      // Check if oldLines[oldIdx] appears in newLines soon
      if (!foundCommon) {
        for (
          let n = newIdx;
          n <= Math.min(newIdx + delta, newLines.length - 1);
          n++
        ) {
          if (newLines[n] === oldLines[oldIdx + delta]) {
            // Delete lines from old up to oldIdx + delta
            for (let i = oldIdx; i < oldIdx + delta; i++) {
              deleteLines.push(oldLines[i]!);
            }
            // Insert lines from new up to n
            for (let i = newIdx; i < n; i++) {
              insertLines.push(newLines[i]!);
            }
            oldLookAhead = oldIdx + delta;
            newLookAhead = n;
            foundCommon = true;
            break;
          }
        }
      }
    }

    if (!foundCommon) {
      // No common line found within look-ahead, treat rest as delete+insert
      while (oldIdx < oldLines.length) {
        deleteLines.push(oldLines[oldIdx++]!);
      }
      while (newIdx < newLines.length) {
        insertLines.push(newLines[newIdx++]!);
      }
    } else {
      oldIdx = oldLookAhead;
      newIdx = newLookAhead;
    }

    if (deleteLines.length > 0) {
      ops.push({ op: "delete", lines: deleteLines });
    }
    if (insertLines.length > 0) {
      ops.push({ op: "insert", lines: insertLines });
    }
  }

  return ops;
}

/**
 * Merge consecutive operations of the same type
 */
function mergeOps(ops: DiffOp[]): DiffOp[] {
  if (ops.length === 0) return [];

  const firstOp = ops[0]!;
  const merged: DiffOp[] = [];
  let current: DiffOp = { ...firstOp, lines: [...firstOp.lines] };

  for (let i = 1; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.op === current.op) {
      current.lines.push(...op.lines);
    } else {
      merged.push(current);
      current = { ...op, lines: [...op.lines] };
    }
  }

  merged.push(current);
  return merged;
}
