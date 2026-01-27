/**
 * Read Tool
 *
 * Reads file contents from the project filesystem.
 * Supports line range selection and handles large files.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { defineTool } from "./types.ts";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

export const readTool = defineTool("read", {
  description: `Read the contents of a file from the filesystem. Returns the file contents with line numbers.

Usage:
- Provide an absolute path or a path relative to the project root
- By default, reads up to ${MAX_LINES} lines from the beginning of the file
- Use offset and limit to read specific line ranges for large files
- Lines longer than ${MAX_LINE_LENGTH} characters are truncated`,

  parameters: z.object({
    path: z.string().describe("The file path to read (absolute or relative to project root)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Line number to start reading from (0-indexed). Default: 0"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LINES)
      .optional()
      .describe(`Maximum number of lines to read. Default: ${MAX_LINES}`),
    description: z
      .string()
      .optional()
      .describe("Brief description of why you're reading this file (shown in UI)"),
  }),

  async execute(args, context) {
    const { path: filePath, offset = 0, limit = MAX_LINES } = args;

    // Resolve path relative to project root if not absolute
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.projectPath, filePath);

    // Security: ensure the path is within the project
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(context.projectPath)) {
      return {
        title: "Access denied",
        output: `Error: Cannot read files outside the project directory`,
        success: false,
      };
    }

    try {
      // Check if file exists
      const stat = await fs.stat(normalizedPath);

      if (stat.isDirectory()) {
        return {
          title: "Cannot read directory",
          output: `Error: "${filePath}" is a directory. Use the glob tool to list directory contents.`,
          success: false,
        };
      }

      // Read file content
      const content = await fs.readFile(normalizedPath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Apply offset and limit
      const startLine = Math.min(offset, totalLines);
      const endLine = Math.min(startLine + limit, totalLines);
      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers and truncate long lines
      const formattedLines = selectedLines.map((line, index) => {
        const lineNum = startLine + index + 1;
        const padding = String(endLine).length;
        const truncatedLine =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) + "..."
            : line;
        return `${String(lineNum).padStart(padding)}│${truncatedLine}`;
      });

      const output = formattedLines.join("\n");

      // Build title with line info
      let title = path.basename(normalizedPath);
      if (startLine > 0 || endLine < totalLines) {
        title += ` (lines ${startLine + 1}-${endLine} of ${totalLines})`;
      }

      return {
        title,
        output: output || "(empty file)",
        metadata: {
          path: normalizedPath,
          totalLines,
          linesReturned: selectedLines.length,
          startLine: startLine + 1,
          endLine,
        },
        success: true,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          title: "File not found",
          output: `Error: File not found: "${filePath}"`,
          success: false,
        };
      }

      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return {
          title: "Permission denied",
          output: `Error: Permission denied reading: "${filePath}"`,
          success: false,
        };
      }

      throw error;
    }
  },
});
