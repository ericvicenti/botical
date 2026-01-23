/**
 * File Actions
 *
 * Actions for file operations - read, write, and edit files.
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { defineAction, success, error } from "./types.ts";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

/**
 * file.read - Read file contents
 */
export const fileRead = defineAction({
  id: "file.read",
  label: "Read File",
  description: `Read the contents of a file. Returns file contents with line numbers.`,
  category: "file",
  icon: "file-text",

  params: z.object({
    path: z.string().describe("File path (absolute or relative to project root)"),
    offset: z.number().int().min(0).optional().describe("Line to start from (0-indexed)"),
    limit: z.number().int().min(1).max(MAX_LINES).optional().describe("Max lines to read"),
  }),

  execute: async ({ path: filePath, offset = 0, limit = MAX_LINES }, context) => {
    const { projectPath } = context;

    // Resolve path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    // Security check
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(projectPath)) {
      return error("Cannot read files outside the project directory");
    }

    try {
      const stat = await fs.stat(normalizedPath);

      if (stat.isDirectory()) {
        return error(`"${filePath}" is a directory. Use glob to list contents.`);
      }

      const content = await fs.readFile(normalizedPath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      const startLine = Math.min(offset, totalLines);
      const endLine = Math.min(startLine + limit, totalLines);
      const selectedLines = lines.slice(startLine, endLine);

      const formattedLines = selectedLines.map((line, index) => {
        const lineNum = startLine + index + 1;
        const padding = String(endLine).length;
        const truncatedLine = line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH) + "..."
          : line;
        return `${String(lineNum).padStart(padding)}|${truncatedLine}`;
      });

      const output = formattedLines.join("\n");
      let title = path.basename(normalizedPath);
      if (startLine > 0 || endLine < totalLines) {
        title += ` (lines ${startLine + 1}-${endLine} of ${totalLines})`;
      }

      return success(title, output || "(empty file)", {
        path: normalizedPath,
        totalLines,
        linesReturned: selectedLines.length,
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return error(`File not found: "${filePath}"`);
      if (e.code === "EACCES") return error(`Permission denied: "${filePath}"`);
      throw err;
    }
  },
});

/**
 * file.write - Write file contents
 */
export const fileWrite = defineAction({
  id: "file.write",
  label: "Write File",
  description: `Write content to a file. Creates parent directories if needed.`,
  category: "file",
  icon: "file-plus",

  params: z.object({
    path: z.string().describe("File path (absolute or relative to project root)"),
    content: z.string().describe("Content to write"),
  }),

  execute: async ({ path: filePath, content }, context) => {
    const { projectPath } = context;

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(projectPath)) {
      return error("Cannot write files outside the project directory");
    }

    try {
      const parentDir = path.dirname(normalizedPath);
      await fs.mkdir(parentDir, { recursive: true });

      let isNew = true;
      try {
        await fs.access(normalizedPath);
        isNew = false;
      } catch {
        // File doesn't exist
      }

      await fs.writeFile(normalizedPath, content, "utf-8");

      const lineCount = content.split("\n").length;
      const byteCount = Buffer.byteLength(content, "utf-8");

      return success(
        `${isNew ? "Created" : "Wrote"} ${path.basename(normalizedPath)}`,
        `Successfully ${isNew ? "created" : "wrote"} ${normalizedPath} (${lineCount} lines, ${byteCount} bytes)`,
        { path: normalizedPath, isNew, lines: lineCount, bytes: byteCount }
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EACCES") return error(`Permission denied: "${filePath}"`);
      if (e.code === "EISDIR") return error(`"${filePath}" is a directory`);
      throw err;
    }
  },
});

/**
 * file.edit - Edit file with search/replace
 */
export const fileEdit = defineAction({
  id: "file.edit",
  label: "Edit File",
  description: `Edit a file by replacing specific text.`,
  category: "file",
  icon: "file-edit",

  params: z.object({
    path: z.string().describe("File path (absolute or relative to project root)"),
    old_string: z.string().describe("Text to find"),
    new_string: z.string().describe("Text to replace with"),
    replace_all: z.boolean().optional().default(false).describe("Replace all occurrences"),
  }),

  execute: async ({ path: filePath, old_string, new_string, replace_all }, context) => {
    const { projectPath } = context;

    if (old_string === new_string) {
      return error("old_string and new_string are identical");
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(projectPath)) {
      return error("Cannot edit files outside the project directory");
    }

    try {
      const content = await fs.readFile(normalizedPath, "utf-8");
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return error(`Text not found in "${path.basename(normalizedPath)}"`);
      }

      if (!replace_all && occurrences > 1) {
        return error(`Found ${occurrences} occurrences. Use replace_all or add more context.`);
      }

      let newContent: string;
      let replacementCount: number;

      if (replace_all) {
        newContent = content.split(old_string).join(new_string);
        replacementCount = occurrences;
      } else {
        newContent = content.replace(old_string, new_string);
        replacementCount = 1;
      }

      await fs.writeFile(normalizedPath, newContent, "utf-8");

      return success(
        `Edited ${path.basename(normalizedPath)}`,
        `Replaced ${replacementCount} occurrence${replacementCount > 1 ? "s" : ""} in ${normalizedPath}`,
        { path: normalizedPath, replacements: replacementCount }
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return error(`File not found: "${filePath}"`);
      if (e.code === "EACCES") return error(`Permission denied: "${filePath}"`);
      throw err;
    }
  },
});

/**
 * All file actions
 */
export const fileActions = [
  fileRead,
  fileWrite,
  fileEdit,
];
