/**
 * Write Tool
 *
 * Writes content to files in the project filesystem.
 * Creates parent directories if they don't exist.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { defineTool } from "./types.ts";
import { isErrnoException } from "@/utils/error-guards.ts";

export const writeTool = defineTool("write", {
  description: `Write content to a file. Creates the file if it doesn't exist, or overwrites if it does.

Usage:
- Provide an absolute path or a path relative to the project root
- Parent directories are created automatically if they don't exist
- Use this for creating new files or completely replacing existing files
- For partial edits, use the edit tool instead`,

  parameters: z.object({
    path: z.string().describe("The file path to write to (absolute or relative to project root)"),
    content: z.string().describe("The content to write to the file"),
    description: z
      .string()
      .optional()
      .describe("Brief description of what you're writing (shown in UI)"),
  }),

  async execute(args, context) {
    const { path: filePath, content } = args;

    // Resolve path relative to project root if not absolute
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.projectPath, filePath);

    // Security: ensure the path is within the project
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(context.projectPath)) {
      return {
        title: "Access denied",
        output: `Error: Cannot write files outside the project directory`,
        success: false,
      };
    }

    try {
      // Create parent directories if needed
      const parentDir = path.dirname(normalizedPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Check if file exists to determine if creating or updating
      let isNew = true;
      try {
        await fs.access(normalizedPath);
        isNew = false;
      } catch {
        // File doesn't exist, will be created
      }

      // Write the file
      await fs.writeFile(normalizedPath, content, "utf-8");

      const lineCount = content.split("\n").length;
      const byteCount = Buffer.byteLength(content, "utf-8");

      return {
        title: `${isNew ? "Created" : "Wrote"} ${path.basename(normalizedPath)}`,
        output: `Successfully ${isNew ? "created" : "wrote"} ${normalizedPath} (${lineCount} lines, ${byteCount} bytes)`,
        metadata: {
          path: normalizedPath,
          isNew,
          lines: lineCount,
          bytes: byteCount,
        },
        success: true,
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === "EACCES") {
        return {
          title: "Permission denied",
          output: `Error: Permission denied writing to: "${filePath}"`,
          success: false,
        };
      }

      if (isErrnoException(error) && error.code === "EISDIR") {
        return {
          title: "Cannot write to directory",
          output: `Error: "${filePath}" is a directory`,
          success: false,
        };
      }

      throw error;
    }
  },
});
