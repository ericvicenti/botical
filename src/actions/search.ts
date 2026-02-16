/**
 * Search Actions
 *
 * Actions for searching files - glob patterns and content search.
 */

import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { Glob } from "bun";
import { defineAction, success, error } from "./types.ts";
import { isErrnoException } from "@/utils/error-guards.ts";

const MAX_GLOB_RESULTS = 1000;
const MAX_GREP_RESULTS = 100;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * search.glob - Find files by pattern
 */
export const searchGlob = defineAction({
  id: "search.glob",
  label: "Find Files",
  description: `Find files matching a glob pattern. Use ** for directories, * for filenames.`,
  category: "search",
  icon: "folder-search",

  params: z.object({
    pattern: z.string().describe("Glob pattern (e.g., **/*.ts)"),
    path: z.string().optional().describe("Directory to search in"),
    limit: z.number().int().min(1).max(MAX_GLOB_RESULTS).optional().describe("Max results"),
  }),

  execute: async ({ pattern, path: searchPath, limit = MAX_GLOB_RESULTS }, context) => {
    const { projectPath } = context;

    const baseDir = searchPath
      ? path.isAbsolute(searchPath) ? searchPath : path.join(projectPath, searchPath)
      : projectPath;

    const normalizedBase = path.normalize(baseDir);
    if (!normalizedBase.startsWith(projectPath)) {
      return error("Cannot search outside the project directory");
    }

    try {
      const glob = new Glob(pattern);
      const matches: { path: string; mtime: number }[] = [];

      for await (const file of glob.scan({
        cwd: normalizedBase,
        absolute: true,
        onlyFiles: true,
        dot: false,
      })) {
        if (!file.startsWith(projectPath)) continue;

        try {
          const stat = await fs.stat(file);
          matches.push({ path: file, mtime: stat.mtimeMs });
        } catch {
          continue;
        }

        if (matches.length >= limit * 2) break;
      }

      matches.sort((a, b) => b.mtime - a.mtime);
      const limited = matches.slice(0, limit);

      const relativePaths = limited.map((m) => path.relative(projectPath, m.path));
      const output = relativePaths.length > 0 ? relativePaths.join("\n") : "(no matches)";

      let title = `Found ${limited.length} file${limited.length !== 1 ? "s" : ""}`;
      if (matches.length > limit) {
        title += ` (showing first ${limit} of ${matches.length})`;
      }

      return success(title, output, { pattern, totalMatches: matches.length });
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        return error(`Directory not found: "${searchPath}"`);
      }
      throw err;
    }
  },
});

/**
 * search.grep - Search file contents
 */
export const searchGrep = defineAction({
  id: "search.grep",
  label: "Search Code",
  description: `Search file contents for a pattern. Supports regex.`,
  category: "search",
  icon: "search",

  params: z.object({
    pattern: z.string().describe("Search pattern (regex supported)"),
    path: z.string().optional().describe("Directory or file to search"),
    filePattern: z.string().optional().describe("Glob to filter files (e.g., **/*.ts)"),
    caseInsensitive: z.boolean().optional().default(false).describe("Case insensitive"),
    limit: z.number().int().min(1).max(MAX_GREP_RESULTS).optional().describe("Max matches"),
  }),

  execute: async ({
    pattern,
    path: searchPath,
    filePattern = "**/*",
    caseInsensitive = false,
    limit = MAX_GREP_RESULTS,
  }, context) => {
    const { projectPath } = context;

    const baseDir = searchPath
      ? path.isAbsolute(searchPath) ? searchPath : path.join(projectPath, searchPath)
      : projectPath;

    const normalizedBase = path.normalize(baseDir);
    if (!normalizedBase.startsWith(projectPath)) {
      return error("Cannot search outside the project directory");
    }

    try {
      const flags = caseInsensitive ? "gi" : "g";
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch {
        return error(`Invalid regex pattern: "${pattern}"`);
      }

      const glob = new Glob(filePattern);
      const matches: { file: string; line: number; content: string }[] = [];
      let filesSearched = 0;

      for await (const file of glob.scan({
        cwd: normalizedBase,
        absolute: true,
        onlyFiles: true,
        dot: false,
      })) {
        if (!file.startsWith(projectPath)) continue;

        try {
          const stat = await fs.stat(file);
          if (stat.size > MAX_FILE_SIZE) continue;

          const sample = await fs.readFile(file);
          const firstKb = sample.slice(0, 1024);
          if (firstKb.includes(0)) continue; // Skip binary

          filesSearched++;

          const content = sample.toString("utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i]!)) {
              matches.push({
                file: path.relative(projectPath, file),
                line: i + 1,
                content: lines[i]!.slice(0, 200) + (lines[i]!.length > 200 ? "..." : ""),
              });

              if (matches.length >= limit) break;
            }
          }

          if (matches.length >= limit) break;
        } catch {
          continue;
        }
      }

      let output: string;
      if (matches.length === 0) {
        output = `No matches found for "${pattern}" in ${filesSearched} files`;
      } else {
        output = matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join("\n");
      }

      let title = `Found ${matches.length} match${matches.length !== 1 ? "es" : ""}`;
      if (matches.length >= limit) title += " (limit reached)";
      title += ` in ${filesSearched} files`;

      return success(title, output, { pattern, matches: matches.length, filesSearched });
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        return error(`Path not found: "${searchPath}"`);
      }
      throw err;
    }
  },
});

/**
 * All search actions
 */
export const searchActions = [
  searchGlob,
  searchGrep,
];
