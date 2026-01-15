/**
 * File Service with Versioning
 *
 * Manages files with automatic version tracking within a project.
 * Versions are stored efficiently using patches (diffs) from the previous version.
 * See: docs/knowledge-base/02-data-model.md#file-versioning
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import crypto from "crypto";
import path from "path";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import {
  createPatch,
  applyPatch,
  reversePatch,
  serializePatch,
  deserializePatch,
  getPatchStats,
  type Patch,
} from "@/utils/diff.ts";
import type { Database } from "bun:sqlite";

/**
 * File type
 */
export type FileType = "file" | "directory";

/**
 * File entity
 */
export interface File {
  id: string;
  path: string;
  type: FileType;
  mimeType: string | null;
  size: number | null;
  hash: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * File version entity
 */
export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  hash: string;
  sessionId: string | null;
  messageId: string | null;
  patch: Patch | null;
  createdAt: number;
}

/**
 * Context for file operations (tracking which session/message made changes)
 */
export interface FileContext {
  sessionId?: string;
  messageId?: string;
}

/**
 * File list options
 */
export interface FileListOptions {
  pattern?: string;
  type?: FileType;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Database row types
 */
interface FileRow {
  id: string;
  path: string;
  type: string;
  mime_type: string | null;
  size: number | null;
  hash: string | null;
  metadata: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface FileVersionRow {
  id: string;
  file_id: string;
  version: number;
  hash: string;
  session_id: string | null;
  message_id: string | null;
  patch: string | null;
  created_at: number;
}

interface FileContentRow {
  id: string;
  version_id: string;
  content: string;
}

/**
 * Convert database row to file entity
 */
function rowToFile(row: FileRow): File {
  return {
    id: row.id,
    path: row.path,
    type: row.type as FileType,
    mimeType: row.mime_type,
    size: row.size,
    hash: row.hash,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Convert database row to file version entity
 */
function rowToFileVersion(row: FileVersionRow): FileVersion {
  return {
    id: row.id,
    fileId: row.file_id,
    version: row.version,
    hash: row.hash,
    sessionId: row.session_id,
    messageId: row.message_id,
    patch: row.patch ? deserializePatch(row.patch) : null,
    createdAt: row.created_at,
  };
}

/**
 * Validate file path to prevent path traversal
 */
function validatePath(filePath: string): string {
  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for path traversal attempts
  if (normalized.includes("..")) {
    throw new ValidationError("Path traversal detected: path cannot contain '..'");
  }

  // Ensure path is not empty
  if (!normalized || normalized === ".") {
    throw new ValidationError("Invalid file path");
  }

  // Remove leading slash for consistency
  return normalized.replace(/^\/+/, "");
}

/**
 * Compute content hash
 */
function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Detect MIME type from extension
 */
function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".tsx": "application/typescript",
    ".jsx": "application/javascript",
    ".html": "text/html",
    ".css": "text/css",
    ".py": "text/x-python",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".java": "text/x-java",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
    ".sh": "application/x-sh",
    ".yml": "application/x-yaml",
    ".yaml": "application/x-yaml",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Match path against glob pattern
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*\*\//g, "{{GLOBSTARSLASH}}") // Handle **/ (matches 0+ directories)
    .replace(/\*\*/g, "{{GLOBSTAR}}") // Handle ** at end
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/\?/g, "[^/]") // ? matches single char except /
    .replace(/{{GLOBSTARSLASH}}/g, "(?:.*/)?") // **/ matches zero or more directories
    .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches anything including /

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * File Service for managing files with version history
 */
export class FileService {
  /**
   * Read file content
   * Returns the latest version's content
   */
  static read(db: Database, filePath: string): string | null {
    const normalized = validatePath(filePath);

    const file = db
      .prepare("SELECT * FROM files WHERE path = ? AND deleted_at IS NULL")
      .get(normalized) as FileRow | undefined;

    if (!file) return null;

    // Get latest version
    const latestVersion = db
      .prepare(
        "SELECT * FROM file_versions WHERE file_id = ? ORDER BY version DESC LIMIT 1"
      )
      .get(file.id) as FileVersionRow | undefined;

    if (!latestVersion) return null;

    return this.reconstructContent(db, file.id, latestVersion.version);
  }

  /**
   * Write file content with automatic versioning
   */
  static write(
    db: Database,
    filePath: string,
    content: string,
    context: FileContext = {}
  ): File {
    const normalized = validatePath(filePath);
    const now = Date.now();
    const hash = computeHash(content);
    const mimeType = detectMimeType(normalized);
    const size = Buffer.byteLength(content, "utf8");

    // Check if file exists
    let file = db
      .prepare("SELECT * FROM files WHERE path = ?")
      .get(normalized) as FileRow | undefined;

    if (file) {
      // File exists - check if content changed
      if (file.hash === hash && !file.deleted_at) {
        // Content unchanged, return existing file
        return rowToFile(file);
      }

      // Undelete if was deleted
      if (file.deleted_at) {
        db.prepare(
          "UPDATE files SET deleted_at = NULL, updated_at = ?, hash = ?, size = ? WHERE id = ?"
        ).run(now, hash, size, file.id);
      } else {
        // Update file metadata
        db.prepare(
          "UPDATE files SET updated_at = ?, hash = ?, size = ? WHERE id = ?"
        ).run(now, hash, size, file.id);
      }

      // Create new version with patch
      this.createVersion(db, file.id, content, hash, context);

      return this.getByIdOrThrow(db, file.id);
    }

    // Create new file
    const fileId = generateId(IdPrefixes.file);

    db.prepare(
      `
      INSERT INTO files (id, path, type, mime_type, size, hash, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(fileId, normalized, "file", mimeType, size, hash, "{}", now, now);

    // Create first version (stores full content)
    this.createVersion(db, fileId, content, hash, context);

    return {
      id: fileId,
      path: normalized,
      type: "file",
      mimeType,
      size,
      hash,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  /**
   * Delete a file (soft delete)
   */
  static delete(db: Database, filePath: string): void {
    const normalized = validatePath(filePath);
    const now = Date.now();

    const file = db
      .prepare("SELECT * FROM files WHERE path = ? AND deleted_at IS NULL")
      .get(normalized) as FileRow | undefined;

    if (!file) {
      throw new NotFoundError("File", normalized);
    }

    db.prepare("UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ?").run(
      now,
      now,
      file.id
    );
  }

  /**
   * List files with optional filtering
   */
  static list(db: Database, options: FileListOptions = {}): File[] {
    let query = "SELECT * FROM files WHERE 1=1";
    const params: (string | number | null)[] = [];

    if (!options.includeDeleted) {
      query += " AND deleted_at IS NULL";
    }

    if (options.type) {
      query += " AND type = ?";
      params.push(options.type);
    }

    query += " ORDER BY path ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    let rows = db.prepare(query).all(...params) as FileRow[];

    // Filter by glob pattern if provided
    if (options.pattern) {
      rows = rows.filter((row) => matchGlob(row.path, options.pattern!));
    }

    return rows.map(rowToFile);
  }

  /**
   * Get file metadata without content
   */
  static getMetadata(db: Database, filePath: string): File | null {
    const normalized = validatePath(filePath);

    const row = db
      .prepare("SELECT * FROM files WHERE path = ? AND deleted_at IS NULL")
      .get(normalized) as FileRow | undefined;

    if (!row) return null;
    return rowToFile(row);
  }

  /**
   * Get file by ID
   */
  static getById(db: Database, fileId: string): File | null {
    const row = db
      .prepare("SELECT * FROM files WHERE id = ?")
      .get(fileId) as FileRow | undefined;

    if (!row) return null;
    return rowToFile(row);
  }

  /**
   * Get file by ID or throw
   */
  static getByIdOrThrow(db: Database, fileId: string): File {
    const file = this.getById(db, fileId);
    if (!file) {
      throw new NotFoundError("File", fileId);
    }
    return file;
  }

  /**
   * Count files
   */
  static count(db: Database, options: { includeDeleted?: boolean } = {}): number {
    let query = "SELECT COUNT(*) as count FROM files WHERE type = 'file'";
    if (!options.includeDeleted) {
      query += " AND deleted_at IS NULL";
    }
    const result = db.prepare(query).get() as { count: number };
    return result.count;
  }

  // ============================================
  // VERSION MANAGEMENT
  // ============================================

  /**
   * Get all versions of a file
   */
  static getVersions(db: Database, fileId: string): FileVersion[] {
    this.getByIdOrThrow(db, fileId);

    const rows = db
      .prepare(
        "SELECT * FROM file_versions WHERE file_id = ? ORDER BY version DESC"
      )
      .all(fileId) as FileVersionRow[];

    return rows.map(rowToFileVersion);
  }

  /**
   * Get a specific version
   */
  static getVersion(
    db: Database,
    fileId: string,
    version: number
  ): FileVersion | null {
    const row = db
      .prepare(
        "SELECT * FROM file_versions WHERE file_id = ? AND version = ?"
      )
      .get(fileId, version) as FileVersionRow | undefined;

    if (!row) return null;
    return rowToFileVersion(row);
  }

  /**
   * Get content for a specific version
   */
  static getVersionContent(
    db: Database,
    fileId: string,
    version: number
  ): string | null {
    const ver = this.getVersion(db, fileId, version);
    if (!ver) return null;

    return this.reconstructContent(db, fileId, version);
  }

  /**
   * Revert file to a previous version
   */
  static revertToVersion(
    db: Database,
    fileId: string,
    version: number,
    context: FileContext = {}
  ): File {
    const file = this.getByIdOrThrow(db, fileId);
    const content = this.getVersionContent(db, fileId, version);

    if (content === null) {
      throw new NotFoundError("FileVersion", `${fileId}@${version}`);
    }

    // Write creates a new version with the old content
    return this.write(db, file.path, content, context);
  }

  /**
   * Get diff between two versions
   */
  static diff(
    db: Database,
    fileId: string,
    fromVersion: number,
    toVersion: number
  ): {
    fromContent: string;
    toContent: string;
    patch: Patch;
    stats: { linesAdded: number; linesDeleted: number; linesUnchanged: number };
  } {
    const fromContent = this.getVersionContent(db, fileId, fromVersion);
    const toContent = this.getVersionContent(db, fileId, toVersion);

    if (fromContent === null) {
      throw new NotFoundError("FileVersion", `${fileId}@${fromVersion}`);
    }
    if (toContent === null) {
      throw new NotFoundError("FileVersion", `${fileId}@${toVersion}`);
    }

    const patch = createPatch(fromContent, toContent);
    const stats = getPatchStats(patch);

    return {
      fromContent,
      toContent,
      patch,
      stats,
    };
  }

  /**
   * Get latest version number
   */
  static getLatestVersion(db: Database, fileId: string): number | null {
    const row = db
      .prepare(
        "SELECT MAX(version) as version FROM file_versions WHERE file_id = ?"
      )
      .get(fileId) as { version: number | null };

    return row.version;
  }

  // ============================================
  // INTERNAL HELPERS
  // ============================================

  /**
   * Create a new version for a file
   */
  private static createVersion(
    db: Database,
    fileId: string,
    content: string,
    hash: string,
    context: FileContext
  ): FileVersion {
    const now = Date.now();
    const versionId = generateId(IdPrefixes.version);

    // Get current latest version
    const latestVersion = this.getLatestVersion(db, fileId);
    const newVersion = (latestVersion ?? 0) + 1;

    let patchData: string | null = null;
    let storeFullContent = false;

    if (newVersion === 1) {
      // First version - store full content
      storeFullContent = true;
    } else {
      // Subsequent version - store patch from previous
      const previousContent = this.reconstructContent(db, fileId, latestVersion!);
      if (previousContent !== null) {
        const patch = createPatch(previousContent, content);
        patchData = serializePatch(patch);
      } else {
        // If we can't get previous content, store full content
        storeFullContent = true;
      }
    }

    // Insert version record first (file_content has FK to file_versions)
    db.prepare(
      `
      INSERT INTO file_versions (id, file_id, version, hash, session_id, message_id, patch, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      versionId,
      fileId,
      newVersion,
      hash,
      context.sessionId ?? null,
      context.messageId ?? null,
      patchData,
      now
    );

    // Then insert content if needed
    if (storeFullContent) {
      db.prepare(
        `
        INSERT INTO file_content (id, version_id, content)
        VALUES (?, ?, ?)
      `
      ).run(generateId("content"), versionId, content);
    }

    return {
      id: versionId,
      fileId,
      version: newVersion,
      hash,
      sessionId: context.sessionId ?? null,
      messageId: context.messageId ?? null,
      patch: patchData ? deserializePatch(patchData) : null,
      createdAt: now,
    };
  }

  /**
   * Reconstruct file content for a specific version
   * Works backwards from the first version (which has full content)
   */
  private static reconstructContent(
    db: Database,
    fileId: string,
    targetVersion: number
  ): string | null {
    // Get all versions up to target
    const versions = db
      .prepare(
        `SELECT * FROM file_versions
         WHERE file_id = ? AND version <= ?
         ORDER BY version ASC`
      )
      .all(fileId, targetVersion) as FileVersionRow[];

    if (versions.length === 0) return null;

    // Find the first version (should have full content)
    const firstVersion = versions[0];

    // Get full content from first version
    const contentRow = db
      .prepare("SELECT content FROM file_content WHERE version_id = ?")
      .get(firstVersion.id) as { content: string } | undefined;

    if (!contentRow) {
      // No base content found - this shouldn't happen for well-formed data
      return null;
    }

    let content = contentRow.content;

    // Apply patches from version 2 onwards
    for (let i = 1; i < versions.length; i++) {
      const version = versions[i];
      if (version.patch) {
        const patch = deserializePatch(version.patch);
        content = applyPatch(content, patch);
      } else {
        // Version has no patch - check for full content
        const versionContent = db
          .prepare("SELECT content FROM file_content WHERE version_id = ?")
          .get(version.id) as { content: string } | undefined;

        if (versionContent) {
          content = versionContent.content;
        }
      }
    }

    return content;
  }
}
