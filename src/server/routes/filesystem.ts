/**
 * Filesystem Routes
 *
 * Provides filesystem browsing for opening existing projects.
 * These routes are not scoped to a specific project.
 *
 * Endpoints:
 * - GET /api/filesystem/browse - Browse a directory
 * - POST /api/filesystem/validate - Validate a path exists and is a directory
 */

import { Hono } from "hono";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ValidationError } from "@/utils/errors.ts";

const filesystem = new Hono();

/**
 * Directory entry for browsing
 */
interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  isHidden: boolean;
  isGitRepo?: boolean;
  hasPackageJson?: boolean;
}

/**
 * Browse response with directory info
 */
interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
  isGitRepo: boolean;
  hasPackageJson: boolean;
}

const BrowseQuerySchema = z.object({
  path: z.string().optional(),
});

const ValidateBodySchema = z.object({
  path: z.string().min(1),
});

/**
 * GET /api/filesystem/browse
 * Browse a directory on the local filesystem.
 * Returns entries sorted with directories first.
 */
filesystem.get("/browse", async (c) => {
  const rawQuery = {
    path: c.req.query("path"),
  };

  const queryResult = BrowseQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    throw new ValidationError(
      queryResult.error.errors[0]?.message || "Invalid query parameters"
    );
  }

  // Default to home directory if no path provided
  let dirPath = queryResult.data.path || os.homedir();

  // Expand ~ to home directory
  if (dirPath.startsWith("~")) {
    dirPath = path.join(os.homedir(), dirPath.slice(1));
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath);

  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new ValidationError("Path is not a directory");
    }

    const rawEntries = await fs.readdir(dirPath, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];

    for (const entry of rawEntries) {
      // Skip certain system directories and files
      if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      const isDirectory = entry.isDirectory();

      const dirEntry: DirectoryEntry = {
        name: entry.name,
        path: entryPath,
        type: isDirectory ? "directory" : "file",
        isHidden: entry.name.startsWith("."),
      };

      // For directories, check if they're git repos or have package.json
      if (isDirectory && !entry.name.startsWith(".")) {
        try {
          const subEntries = await fs.readdir(entryPath);
          const subEntrySet = new Set(subEntries);
          if (subEntrySet.has(".git")) {
            dirEntry.isGitRepo = true;
          }
          if (subEntrySet.has("package.json")) {
            dirEntry.hasPackageJson = true;
          }
        } catch {
          // Ignore errors reading subdirectories (permission denied, etc.)
        }
      }

      entries.push(dirEntry);
    }

    // Sort: directories first, then alphabetically (hidden files last within each group)
    entries.sort((a, b) => {
      // First sort by type (directories first)
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      // Then by hidden status (non-hidden first)
      if (a.isHidden !== b.isHidden) {
        return a.isHidden ? 1 : -1;
      }
      // Then alphabetically (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    // Check if this looks like a project directory
    const entryNames = new Set(rawEntries.map((e) => e.name));
    const isGitRepo = entryNames.has(".git");
    const hasPackageJson = entryNames.has("package.json");

    // Get parent directory (null if at root)
    const parent = dirPath === "/" ? null : path.dirname(dirPath);

    const response: BrowseResponse = {
      path: dirPath,
      parent,
      entries,
      isGitRepo,
      hasPackageJson,
    };

    return c.json({ data: response });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ValidationError(`Directory not found: ${dirPath}`);
    }
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      throw new ValidationError(`Permission denied: ${dirPath}`);
    }
    throw err;
  }
});

/**
 * POST /api/filesystem/validate
 * Validate that a path exists and is a directory.
 * Returns info about the directory if valid.
 */
filesystem.post("/validate", async (c) => {
  const body = await c.req.json();
  const result = ValidateBodySchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid request body"
    );
  }

  let dirPath = result.data.path;

  // Expand ~ to home directory
  if (dirPath.startsWith("~")) {
    dirPath = path.join(os.homedir(), dirPath.slice(1));
  }

  // Resolve to absolute path
  dirPath = path.resolve(dirPath);

  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return c.json({
        data: {
          valid: false,
          error: "Path is not a directory",
          path: dirPath,
        },
      });
    }

    // Check for project indicators
    const entries = await fs.readdir(dirPath);
    const entrySet = new Set(entries);
    const isGitRepo = entrySet.has(".git");
    const hasPackageJson = entrySet.has("package.json");

    // Get suggested name from directory name
    const suggestedName = path.basename(dirPath);

    return c.json({
      data: {
        valid: true,
        path: dirPath,
        suggestedName,
        isGitRepo,
        hasPackageJson,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({
        data: {
          valid: false,
          error: "Directory not found",
          path: dirPath,
        },
      });
    }
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      return c.json({
        data: {
          valid: false,
          error: "Permission denied",
          path: dirPath,
        },
      });
    }
    throw err;
  }
});

export { filesystem };
