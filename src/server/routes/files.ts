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
import * as fsSync from "fs";
import simpleGit from "simple-git";
import { ProjectService } from "@/services/projects.ts";
import { DatabaseManager } from "@/database/index.ts";
import { GitService } from "@/services/git.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

const files = new Hono();

/**
 * Type guard to check if error is a Node.js ErrnoException
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

/**
 * File entry in directory listing
 */
interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
  isHidden?: boolean;
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
 * Detailed file entry with ls -al style info
 */
interface DetailedFileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modified: number;
  created: number;
  accessed: number;
  mode: number;
  permissions: string;
  isHidden: boolean;
}

/**
 * Folder details response
 */
interface FolderDetails {
  path: string;
  name: string;
  totalSize: number;
  fileCount: number;
  folderCount: number;
  entries: DetailedFileEntry[];
}

/**
 * Convert mode to permission string like -rwxr-xr-x
 */
function modeToPermissions(mode: number, isDirectory: boolean): string {
  const types = isDirectory ? "d" : "-";
  const perms = [
    (mode & 0o400) ? "r" : "-",
    (mode & 0o200) ? "w" : "-",
    (mode & 0o100) ? "x" : "-",
    (mode & 0o040) ? "r" : "-",
    (mode & 0o020) ? "w" : "-",
    (mode & 0o010) ? "x" : "-",
    (mode & 0o004) ? "r" : "-",
    (mode & 0o002) ? "w" : "-",
    (mode & 0o001) ? "x" : "-",
  ];
  return types + perms.join("");
}

/**
 * Calculate directory size recursively
 */
async function calculateDirSize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          totalSize += await calculateDirSize(entryPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(entryPath);
          totalSize += stat.size;
        }
      } catch {
        // Skip entries we can't access
      }
    }
  } catch {
    // Return 0 if we can't read the directory
  }
  return totalSize;
}

/**
 * Directories to skip when walking the file tree
 */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "__pycache__",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".cache",
  "coverage",
  ".turbo",
]);

/**
 * Maximum number of files to return from file tree
 */
const MAX_FILE_TREE_SIZE = 10000;

/**
 * Recursively collect all file paths in a directory
 */
async function collectFilesRecursively(
  basePath: string,
  currentPath: string,
  files: string[],
  maxFiles: number
): Promise<void> {
  if (files.length >= maxFiles) return;

  const fullPath = path.join(basePath, currentPath);

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      // Skip ignored directories but allow hidden files
      // if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

      const relativePath = currentPath ? path.join(currentPath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await collectFilesRecursively(basePath, relativePath, files, maxFiles);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * GET /api/projects/:projectId/files/tree
 * List all files recursively for file palette
 * For git repos, uses git ls-files to respect .gitignore
 * For non-git repos, walks the filesystem skipping common ignored dirs
 */
files.get("/:projectId/files/tree", async (c) => {
  const { projectId } = c.req.param();

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    return c.json({ data: [] });
  }

  const projectPath = project.path;

  // Check if this is a git repo
  const gitDir = path.join(projectPath, ".git");
  const isGitRepo = fsSync.existsSync(gitDir);

  let fileList: string[] = [];

  if (isGitRepo) {
    // Use git ls-files to get tracked files (respects .gitignore)
    try {
      const git = simpleGit(projectPath);
      const result = await git.raw(["ls-files", "--cached", "--others", "--exclude-standard"]);
      fileList = result
        .trim()
        .split("\n")
        .filter((f) => f.length > 0)
        .slice(0, MAX_FILE_TREE_SIZE);
    } catch {
      // Fall back to filesystem walk if git command fails
      await collectFilesRecursively(projectPath, "", fileList, MAX_FILE_TREE_SIZE);
    }
  } else {
    // Walk filesystem for non-git repos
    await collectFilesRecursively(projectPath, "", fileList, MAX_FILE_TREE_SIZE);
  }

  // Sort alphabetically
  fileList.sort((a, b) => a.localeCompare(b));

  return c.json({ data: fileList });
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
      // Skip common ignored directories but allow hidden files
      if (entry.name === "node_modules") {
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
          isHidden: entry.name.startsWith("."),
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
    if (isErrnoException(err) && err.code === "ENOENT") {
      return c.json({ data: [] });
    }
    throw err;
  }
});

/**
 * GET /api/projects/:projectId/folders
 * Get detailed folder information (ls -al and du -sh style)
 * Query params:
 * - path: folder path within project
 * - commit: optional commit hash to view folder at that version
 */
files.get("/:projectId/folders", async (c) => {
  const { projectId } = c.req.param();
  const rawQuery = { path: c.req.query("path") };
  const commit = c.req.query("commit");
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
    return c.json({ data: null });
  }

  // If commit is specified, get folder listing from git history
  if (commit) {
    try {
      const entries = await GitService.listTree(project.path, dirPath, commit);

      // Sort: directories first, then by name
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === "directory") return -1;
          if (b.type === "directory") return 1;
        }
        return a.name.localeCompare(b.name);
      });

      const folderDetails = {
        path: dirPath || "/",
        name: dirPath ? path.basename(dirPath) : project.name,
        commit,
        entries: entries.map(e => ({
          name: e.name,
          path: e.path,
          type: e.type,
          isHidden: e.name.startsWith("."),
        })),
      };

      return c.json({ data: folderDetails });
    } catch (err) {
      throw new NotFoundError("Folder", `${dirPath || "/"} at ${commit}`);
    }
  }

  const fullPath = resolveProjectPath(project.path, dirPath);

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      throw new ValidationError("Path is not a directory");
    }

    // Read all entries including hidden files
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const detailedEntries: DetailedFileEntry[] = [];
    let fileCount = 0;
    let folderCount = 0;
    let totalSize = 0;

    for (const entry of entries) {
      const entryPath = dirPath ? path.join(dirPath, entry.name) : entry.name;
      const fullEntryPath = path.join(fullPath, entry.name);

      try {
        const entryStat = await fs.lstat(fullEntryPath);
        const isDirectory = entry.isDirectory();
        const isSymlink = entryStat.isSymbolicLink();

        let size = entryStat.size;
        if (isDirectory) {
          // Calculate directory size (can be slow for large dirs)
          size = await calculateDirSize(fullEntryPath);
          folderCount++;
        } else {
          fileCount++;
          totalSize += size;
        }

        detailedEntries.push({
          name: entry.name,
          path: entryPath,
          type: isSymlink ? "symlink" : (isDirectory ? "directory" : "file"),
          size,
          modified: entryStat.mtimeMs,
          created: entryStat.birthtimeMs,
          accessed: entryStat.atimeMs,
          mode: entryStat.mode,
          permissions: modeToPermissions(entryStat.mode, isDirectory),
          isHidden: entry.name.startsWith("."),
        });
      } catch {
        // Skip entries we can't stat
      }
    }

    // Sort: directories first, then by name
    detailedEntries.sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === "directory") return -1;
        if (b.type === "directory") return 1;
      }
      return a.name.localeCompare(b.name);
    });

    const folderDetails: FolderDetails = {
      path: dirPath || "/",
      name: dirPath ? path.basename(dirPath) : project.name,
      totalSize: totalSize + detailedEntries
        .filter(e => e.type === "directory")
        .reduce((sum, e) => sum + e.size, 0),
      fileCount,
      folderCount,
      entries: detailedEntries,
    };

    return c.json({ data: folderDetails });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new NotFoundError("Folder", dirPath);
    }
    throw err;
  }
});

/**
 * GET /api/projects/:projectId/files/:path
 * Read file content
 * Query params:
 * - commit: optional commit hash to view file at that version
 */
files.get("/:projectId/files/*", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path.replace(`/api/projects/${projectId}/files/`, "");
  const commit = c.req.query("commit");

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

  const decodedPath = decodeURIComponent(filePath);

  // If commit is specified, get file from git history
  if (commit) {
    try {
      const content = await GitService.showFile(project.path, decodedPath, commit);
      return c.json({
        data: {
          content,
          path: decodedPath,
          commit,
        },
      });
    } catch (err) {
      throw new NotFoundError("File", `${decodedPath} at ${commit}`);
    }
  }

  // Otherwise, read from filesystem
  const fullPath = resolveProjectPath(project.path, decodedPath);

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
        path: decodedPath,
        size: stat.size,
        modified: stat.mtimeMs,
      },
    });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new NotFoundError("File", decodedPath);
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
    if (isErrnoException(err) && err.code === "ENOENT") {
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

/**
 * POST /api/projects/:projectId/folders/:path
 * Create a new folder
 */
files.post("/:projectId/folders/*", async (c) => {
  const { projectId } = c.req.param();
  // Extract folder path from URL using same pattern as files endpoints
  const folderPath = c.req.path.replace(
    new RegExp(`^/api/projects/${projectId}/folders/`),
    ""
  );

  if (!folderPath) {
    throw new ValidationError("Folder path is required");
  }

  // Decode URL-encoded path (consistent with files endpoints)
  const decodedPath = decodeURIComponent(folderPath);

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }

  const fullPath = resolveProjectPath(project.path, decodedPath);

  await fs.mkdir(fullPath, { recursive: true });

  return c.json({
    data: {
      path: decodedPath,
    },
  }, 201);
});

/**
 * POST /api/projects/:projectId/upload/*
 * Upload files via multipart/form-data
 * The wildcard path is the target directory within the project
 */
files.post("/:projectId/upload/*", async (c) => {
  const { projectId } = c.req.param();
  // Extract target directory from URL
  const targetDir = c.req.path.replace(
    new RegExp(`^/api/projects/${projectId}/upload/?`),
    ""
  );

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);

  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }

  const body = await c.req.parseBody({ all: true });

  // Collect files from the parsed body
  const files: globalThis.File[] = [];
  for (const [, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v instanceof globalThis.File) files.push(v);
      }
    } else if (value instanceof globalThis.File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    throw new ValidationError("No files provided");
  }

  const decodedDir = decodeURIComponent(targetDir);
  const uploaded: string[] = [];

  for (const file of files) {
    const relativePath = decodedDir ? `${decodedDir}/${file.name}` : file.name;
    const fullPath = resolveProjectPath(project.path, relativePath);

    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(fullPath, Buffer.from(arrayBuffer));

    uploaded.push(relativePath);
  }

  return c.json({
    data: {
      uploaded,
      count: uploaded.length,
    },
  });
});

/**
 * GET /api/projects/:projectId/files-raw/*
 * Serve raw file with correct Content-Type (for images, SVGs, etc.)
 */
files.get("/:projectId/files-raw/*", async (c) => {
  const { projectId } = c.req.param();
  const filePath = c.req.path.replace(`/api/projects/${projectId}/files-raw/`, "");

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

  const decodedPath = decodeURIComponent(filePath);
  const fullPath = resolveProjectPath(project.path, decodedPath);

  try {
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      throw new ValidationError("Path is a directory, not a file");
    }

    // Limit to 20MB for raw files
    if (stat.size > 20 * 1024 * 1024) {
      throw new ValidationError("File too large (max 20MB)");
    }

    const buffer = await fs.readFile(fullPath);
    const ext = path.extname(decodedPath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new NotFoundError("File", decodedPath);
    }
    throw err;
  }
});

export default files;
