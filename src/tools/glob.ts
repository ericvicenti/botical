/**
 * Glob Tool
 *
 * Finds files matching glob patterns.
 * Uses fast-glob for efficient pattern matching.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import path from "path";
import { Glob } from "bun";
import fs from "fs/promises";
import { defineTool } from "./types.ts";

const MAX_RESULTS = 1000;

export const globTool = defineTool("glob", {
  description: `Find files matching a glob pattern.

Usage:
- Use ** to match any number of directories
- Use * to match any characters in a filename
- Use ? to match a single character
- Results are sorted by modification time (newest first)

Examples:
- "**/*.ts" - All TypeScript files
- "src/**/*.test.ts" - All test files in src
- "*.json" - JSON files in project root
- "src/{components,utils}/**" - Files in components or utils`,

  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z
      .string()
      .optional()
      .describe("Directory to search in (default: project root)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS)
      .optional()
      .describe(`Maximum number of results (default: ${MAX_RESULTS})`),
  }),

  async execute(args, context) {
    const { pattern, path: searchPath, limit = MAX_RESULTS } = args;

    // Resolve search directory
    const baseDir = searchPath
      ? path.isAbsolute(searchPath)
        ? searchPath
        : path.join(context.projectPath, searchPath)
      : context.projectPath;

    // Security: ensure the path is within the project
    const normalizedBase = path.normalize(baseDir);
    if (!normalizedBase.startsWith(context.projectPath)) {
      return {
        title: "Access denied",
        output: `Error: Cannot search outside the project directory`,
        success: false,
      };
    }

    try {
      // Use Bun's Glob for pattern matching
      const glob = new Glob(pattern);
      const matches: { path: string; mtime: number }[] = [];

      for await (const file of glob.scan({
        cwd: normalizedBase,
        absolute: true,
        onlyFiles: true,
        dot: false, // Don't include hidden files by default
      })) {
        // Security check: ensure match is within project
        if (!file.startsWith(context.projectPath)) {
          continue;
        }

        try {
          const stat = await fs.stat(file);
          matches.push({
            path: file,
            mtime: stat.mtimeMs,
          });
        } catch {
          // Skip files we can't stat
          continue;
        }

        // Stop early if we've hit the limit (we'll sort, so collect a bit more)
        if (matches.length >= limit * 2) {
          break;
        }
      }

      // Sort by modification time (newest first)
      matches.sort((a, b) => b.mtime - a.mtime);

      // Apply limit
      const limited = matches.slice(0, limit);

      // Format output as relative paths
      const relativePaths = limited.map((m) =>
        path.relative(context.projectPath, m.path)
      );

      const output = relativePaths.length > 0
        ? relativePaths.join("\n")
        : "(no matches)";

      let title = `Found ${limited.length} file${limited.length !== 1 ? "s" : ""}`;
      if (matches.length > limit) {
        title += ` (showing first ${limit} of ${matches.length})`;
      }

      return {
        title,
        output,
        metadata: {
          pattern,
          searchPath: normalizedBase,
          totalMatches: matches.length,
          returned: limited.length,
        },
        success: true,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          title: "Directory not found",
          output: `Error: Directory not found: "${searchPath}"`,
          success: false,
        };
      }

      throw error;
    }
  },
});
