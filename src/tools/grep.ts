/**
 * Grep Tool
 *
 * Searches file contents for patterns.
 * Supports regex patterns and context lines.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { Glob } from "bun";
import { defineTool } from "./types.ts";
import { isErrnoException } from "@/utils/error-guards.ts";

const MAX_RESULTS = 100;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

interface Match {
  file: string;
  line: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export const grepTool = defineTool("grep", {
  description: `Search file contents for a pattern.

Usage:
- Searches all text files in the project (or specified path)
- Supports regular expressions
- Use glob patterns to filter which files to search
- Returns matching lines with line numbers

Examples:
- Pattern "function.*Error" finds function declarations with "Error"
- Pattern "TODO" finds all TODO comments
- With filePattern "**/*.ts" to search only TypeScript files`,

  parameters: z.object({
    pattern: z.string().describe("The search pattern (regex supported)"),
    path: z
      .string()
      .optional()
      .describe("Directory or file to search in (default: project root)"),
    filePattern: z
      .string()
      .optional()
      .describe("Glob pattern to filter files (e.g., '**/*.ts')"),
    caseInsensitive: z
      .boolean()
      .optional()
      .default(false)
      .describe("Case insensitive search"),
    contextLines: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe("Number of context lines to show around matches"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS)
      .optional()
      .describe(`Maximum number of matches to return (default: ${MAX_RESULTS})`),
    description: z
      .string()
      .optional()
      .describe("Brief description of what you're searching for (shown in UI)"),
  }),

  async execute(args, context) {
    const {
      pattern,
      path: searchPath,
      filePattern = "**/*",
      caseInsensitive = false,
      contextLines = 0,
      limit = MAX_RESULTS,
    } = args;

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
      // Compile regex
      const flags = caseInsensitive ? "gi" : "g";
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch {
        return {
          title: "Invalid pattern",
          output: `Error: Invalid regex pattern: "${pattern}"`,
          success: false,
        };
      }

      // Find files to search
      const glob = new Glob(filePattern);
      const matches: Match[] = [];
      let filesSearched = 0;

      for await (const file of glob.scan({
        cwd: normalizedBase,
        absolute: true,
        onlyFiles: true,
        dot: false,
      })) {
        // Security check
        if (!file.startsWith(context.projectPath)) {
          continue;
        }

        // Skip large files and binary files
        try {
          const stat = await fs.stat(file);
          if (stat.size > MAX_FILE_SIZE) {
            continue;
          }

          // Simple binary detection (skip files with null bytes in first 1KB)
          const sample = await fs.readFile(file);
          const firstKb = sample.slice(0, 1024);
          if (firstKb.includes(0)) {
            continue;
          }

          filesSearched++;

          // Search file content
          const content = sample.toString("utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            regex.lastIndex = 0; // Reset regex state

            if (regex.test(line)) {
              const match: Match = {
                file: path.relative(context.projectPath, file),
                line: i + 1,
                content: line.slice(0, 200) + (line.length > 200 ? "..." : ""),
              };

              // Add context if requested
              if (contextLines > 0) {
                match.context = {
                  before: lines
                    .slice(Math.max(0, i - contextLines), i)
                    .map((l) => l.slice(0, 200)),
                  after: lines
                    .slice(i + 1, i + 1 + contextLines)
                    .map((l) => l.slice(0, 200)),
                };
              }

              matches.push(match);

              if (matches.length >= limit) {
                break;
              }
            }
          }

          if (matches.length >= limit) {
            break;
          }
        } catch {
          // Skip files we can't read
          continue;
        }
      }

      // Format output
      let output: string;
      if (matches.length === 0) {
        output = `No matches found for pattern "${pattern}" in ${filesSearched} files`;
      } else {
        const lines: string[] = [];
        for (const match of matches) {
          if (match.context?.before?.length) {
            for (const contextLine of match.context.before) {
              lines.push(`${match.file}:  ${contextLine}`);
            }
          }

          lines.push(`${match.file}:${match.line}: ${match.content}`);

          if (match.context?.after?.length) {
            for (const contextLine of match.context.after) {
              lines.push(`${match.file}:  ${contextLine}`);
            }
            lines.push(""); // Separator between matches with context
          }
        }
        output = lines.join("\n");
      }

      let title = `Found ${matches.length} match${matches.length !== 1 ? "es" : ""}`;
      if (matches.length >= limit) {
        title += " (limit reached)";
      }
      title += ` in ${filesSearched} files`;

      return {
        title,
        output,
        metadata: {
          pattern,
          matches: matches.length,
          filesSearched,
        },
        success: true,
      };
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        return {
          title: "Path not found",
          output: `Error: Path not found: "${searchPath}"`,
          success: false,
        };
      }

      throw error;
    }
  },
});
