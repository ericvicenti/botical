/**
 * Files Routes
 *
 * Provides filesystem access for project files.
 * Files are read from/written to the project's path on disk.
 */

import { Hono } from "hono";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { ProjectService } from "@/services/projects.ts";
import { DatabaseManager } from "@/database/index.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

const files = new Hono();

/**
 * File entry in directory listing
 */
interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
}

/**
 * Validate and resolve file path within project
 * Prevents path traversal attacks
 */
function resolveProjectPath(projectPath: string, filePath: string): string {
  // Normalize and join paths
  const resolvedPath = path.resolve(projectPath, filePath);

  // Ensure the resolved path is within the project directory
  if (!resolvedPath.startsWith(path.resolve(projectPath))) {
    throw new ValidationError("Path traversal not allowed");
  }

  return resolvedPath;
}

const ListQuerySchema = z.object({
  path: z.string().optional().default(""),
});

const WriteBodySchema = z.object({
  content: z.string(),
});

const MoveBodySchema = z.object({
  destination: z.string().min(1),
});

/**
 * GET /api/projects/:projectId/files
 * List files in a directory
 */
files.get("/:projectId/files", async (c) => {
  const { projectId } = c.req.param();

  const rawQuery = {
    path: c.req.query("path"),
  };

  const queryResult = ListQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    throw new ValidationError(
      queryResult.error.errors[0]?.message || "Invalid query parameters"
    );
  }

  const { path: dirPath } = queryResult.data;

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    return c.json({ data: [] });
  }

  const fullPath = resolveProjectPath(project.path, dirPath);

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      throw new ValidationError("Path is not a directory");
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const fileList: FileEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files and common ignored directories
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const entryPath = dirPath ? path.join(dirPath, entry.name) : entry.name;
      const fullEntryPath = path.join(fullPath, entry.name);

      try {
        const entryStat = await fs.stat(fullEntryPath);
        fileList.push({
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? "directory" : "file",
          size: entry.isFile() ? entryStat.size : undefined,
          modified: entryStat.mtimeMs,
        });
      } catch {
        // Skip entries we can't stat
      }
    }

    // Sort: directories first, then alphabetically
    fileList.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return c.json({ data: fileList });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({ data: [] });
    }
    throw err;
  }
});

/**
 * GET /api/projects/:projectId/files/:path
 * Read file content
 */
files.get("/:projectId/files/*", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path.replace(`/api/projects/${projectId}/files/`, "");

  if (!filePath) {
    throw new ValidationError("File path required");
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new NotFoundError("File", filePath);
  }

  const fullPath = resolveProjectPath(project.path, decodeURIComponent(filePath));

  try {
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      throw new ValidationError("Path is a directory, not a file");
    }

    // Check file size (limit to 5MB for text files)
    if (stat.size > 5 * 1024 * 1024) {
      throw new ValidationError("File too large (max 5MB)");
    }

    const content = await fs.readFile(fullPath, "utf-8");

    return c.json({
      data: {
        content,
        path: filePath,
        size: stat.size,
        modified: stat.mtimeMs,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError("File", filePath);
    }
    throw err;
  }
});

/**
 * PUT /api/projects/:projectId/files/:path
 * Write file content
 */
files.put("/:projectId/files/*", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path.replace(`/api/projects/${projectId}/files/`, "");

  if (!filePath) {
    throw new ValidationError("File path required");
  }

  const body = await c.req.json();
  const bodyResult = WriteBodySchema.safeParse(body);
  if (!bodyResult.success) {
    throw new ValidationError(
      bodyResult.error.errors[0]?.message || "Invalid request body"
    );
  }

  const { content } = bodyResult.data;

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }

  const fullPath = resolveProjectPath(project.path, decodeURIComponent(filePath));

  // Ensure parent directory exists
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(fullPath, content, "utf-8");

  const stat = await fs.stat(fullPath);

  return c.json({
    data: {
      path: filePath,
      size: stat.size,
      modified: stat.mtimeMs,
    },
  });
});

/**
 * DELETE /api/projects/:projectId/files/:path
 * Delete a file
 */
files.delete("/:projectId/files/*", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path.replace(`/api/projects/${projectId}/files/`, "");

  if (!filePath) {
    throw new ValidationError("File path required");
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }

  const fullPath = resolveProjectPath(project.path, decodeURIComponent(filePath));

  try {
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    return c.json({ success: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError("File", filePath);
    }
    throw err;
  }
});

/**
 * POST /api/projects/:projectId/files/:path/move
 * Move/rename a file
 */
files.post("/:projectId/files/*/move", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path
    .replace(`/api/projects/${projectId}/files/`, "")
    .replace("/move", "");

  if (!filePath) {
    throw new ValidationError("File path required");
  }

  const body = await c.req.json();
  const bodyResult = MoveBodySchema.safeParse(body);
  if (!bodyResult.success) {
    throw new ValidationError(
      bodyResult.error.errors[0]?.message || "Invalid request body"
    );
  }

  const { destination } = bodyResult.data;

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }

  const sourcePath = resolveProjectPath(project.path, decodeURIComponent(filePath));
  const destPath = resolveProjectPath(project.path, destination);

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  await fs.mkdir(destDir, { recursive: true });

  await fs.rename(sourcePath, destPath);

  return c.json({
    data: {
      path: destination,
    },
  });
});

export default files;
