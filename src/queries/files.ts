/**
 * File Query Definitions
 *
 * Queries and mutations for file operations with versioning support.
 * Files are project-scoped and support version history.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  FileService,
  type File,
  type FileType,
  type FileVersion,
} from "../services/files.ts";
import { serializePatch } from "../utils/diff.ts";

// ============================================
// Query Result Types
// ============================================

/**
 * File returned by queries
 */
export interface FileQueryResult {
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
 * File with content
 */
export interface FileWithContentQueryResult extends FileQueryResult {
  content: string | null;
}

/**
 * File version returned by queries
 */
export interface FileVersionQueryResult {
  id: string;
  fileId: string;
  version: number;
  hash: string;
  patch: string | null; // Serialized patch
  createdAt: number;
  sessionId: string | null;
  messageId: string | null;
}

/**
 * File diff result
 */
export interface FileDiffResult {
  fromContent: string;
  toContent: string;
  patch: string; // Serialized patch
  stats: {
    linesAdded: number;
    linesDeleted: number;
    linesUnchanged: number;
  };
}

// ============================================
// Query Parameters
// ============================================

export interface FilesListParams {
  projectId: string;
  pattern?: string;
  type?: FileType;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface FilesGetParams {
  projectId: string;
  fileId: string;
}

export interface FilesGetByPathParams {
  projectId: string;
  filePath: string;
}

export interface FilesReadParams {
  projectId: string;
  filePath: string;
}

export interface FilesCountParams {
  projectId: string;
  includeDeleted?: boolean;
}

export interface FileVersionsListParams {
  projectId: string;
  fileId: string;
}

export interface FileVersionGetParams {
  projectId: string;
  fileId: string;
  version: number;
}

export interface FileVersionContentParams {
  projectId: string;
  fileId: string;
  version: number;
}

export interface FileDiffParams {
  projectId: string;
  fileId: string;
  fromVersion: number;
  toVersion: number;
}

// ============================================
// Mutation Parameters
// ============================================

export interface FilesWriteParams {
  projectId: string;
  filePath: string;
  content: string;
  sessionId?: string;
  messageId?: string;
}

export interface FilesDeleteParams {
  projectId: string;
  filePath: string;
}

export interface FilesRevertParams {
  projectId: string;
  fileId: string;
  version: number;
  sessionId?: string;
  messageId?: string;
}

// ============================================
// Helper Functions
// ============================================

function toFileQueryResult(file: File): FileQueryResult {
  return {
    id: file.id,
    path: file.path,
    type: file.type,
    mimeType: file.mimeType,
    size: file.size,
    hash: file.hash,
    metadata: file.metadata,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt,
  };
}

function toFileVersionQueryResult(version: FileVersion): FileVersionQueryResult {
  return {
    id: version.id,
    fileId: version.fileId,
    version: version.version,
    hash: version.hash,
    patch: version.patch ? serializePatch(version.patch) : null,
    createdAt: version.createdAt,
    sessionId: version.sessionId,
    messageId: version.messageId,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List files in a project
 */
export const filesListQuery = defineQuery<FileQueryResult[], FilesListParams>({
  name: "files.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const files = FileService.list(db, {
      pattern: params.pattern,
      type: params.type,
      includeDeleted: params.includeDeleted,
      limit: params.limit,
      offset: params.offset,
    });

    return files.map(toFileQueryResult);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["files.list", params.projectId];
      if (params.pattern) keyParts.push(`pattern:${params.pattern}`);
      if (params.type) keyParts.push(`type:${params.type}`);
      if (params.includeDeleted) keyParts.push("includeDeleted");
      return keyParts;
    },
  },

  realtime: {
    events: ["file.created", "file.updated", "file.deleted"],
  },

  description: "List files in a project",
});

/**
 * Get a file by ID
 */
export const filesGetQuery = defineQuery<FileQueryResult, FilesGetParams>({
  name: "files.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const file = FileService.getByIdOrThrow(db, params.fileId);
    return toFileQueryResult(file);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["files.get", params.projectId, params.fileId],
  },

  realtime: {
    events: ["file.updated", "file.deleted"],
  },

  description: "Get a file by ID",
});

/**
 * Get a file by path
 */
export const filesGetByPathQuery = defineQuery<FileQueryResult | null, FilesGetByPathParams>({
  name: "files.getbypath",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const file = FileService.getMetadata(db, params.filePath);
    return file ? toFileQueryResult(file) : null;
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["files.getbypath", params.projectId, params.filePath],
  },

  description: "Get a file by path",
});

/**
 * Read file content
 */
export const filesReadQuery = defineQuery<string | null, FilesReadParams>({
  name: "files.read",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return FileService.read(db, params.filePath);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["files.read", params.projectId, params.filePath],
  },

  realtime: {
    events: ["file.updated"],
  },

  description: "Read file content",
});

/**
 * Count files in a project
 */
export const filesCountQuery = defineQuery<number, FilesCountParams>({
  name: "files.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return FileService.count(db, {
      includeDeleted: params.includeDeleted,
    });
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["files.count", params.projectId];
      if (params.includeDeleted) keyParts.push("includeDeleted");
      return keyParts;
    },
  },

  description: "Count files in a project",
});

/**
 * List file versions
 */
export const fileVersionsListQuery = defineQuery<FileVersionQueryResult[], FileVersionsListParams>({
  name: "files.versions.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const versions = FileService.getVersions(db, params.fileId);
    return versions.map(toFileVersionQueryResult);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["files.versions.list", params.projectId, params.fileId],
  },

  realtime: {
    events: ["file.updated"],
  },

  description: "List file versions",
});

/**
 * Get a specific file version
 */
export const fileVersionGetQuery = defineQuery<FileVersionQueryResult | null, FileVersionGetParams>({
  name: "files.versions.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const version = FileService.getVersion(db, params.fileId, params.version);
    return version ? toFileVersionQueryResult(version) : null;
  },

  cache: {
    ttl: 30_000, // Versions are immutable, cache longer
    scope: "project",
    key: (params) => ["files.versions.get", params.projectId, params.fileId, String(params.version)],
  },

  description: "Get a specific file version",
});

/**
 * Get content for a specific file version
 */
export const fileVersionContentQuery = defineQuery<string | null, FileVersionContentParams>({
  name: "files.versions.content",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return FileService.getVersionContent(db, params.fileId, params.version);
  },

  cache: {
    ttl: 60_000, // Version content is immutable, cache longer
    scope: "project",
    key: (params) => ["files.versions.content", params.projectId, params.fileId, String(params.version)],
  },

  description: "Get content for a specific file version",
});

/**
 * Get diff between two file versions
 */
export const fileDiffQuery = defineQuery<FileDiffResult, FileDiffParams>({
  name: "files.diff",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const diff = FileService.diff(db, params.fileId, params.fromVersion, params.toVersion);
    return {
      fromContent: diff.fromContent,
      toContent: diff.toContent,
      patch: serializePatch(diff.patch),
      stats: diff.stats,
    };
  },

  cache: {
    ttl: 60_000, // Diffs are immutable, cache longer
    scope: "project",
    key: (params) => [
      "files.diff",
      params.projectId,
      params.fileId,
      String(params.fromVersion),
      String(params.toVersion),
    ],
  },

  description: "Get diff between two file versions",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Write file content
 */
export const filesWriteMutation = defineMutation<FilesWriteParams, FileQueryResult>({
  name: "files.write",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const file = FileService.write(db, params.filePath, params.content, {
      sessionId: params.sessionId,
      messageId: params.messageId,
    });
    return toFileQueryResult(file);
  },

  invalidates: ["files.list", "files.count"],
  invalidateKeys: (params) => [
    ["files.getbypath", params.projectId, params.filePath],
    ["files.read", params.projectId, params.filePath],
  ],

  description: "Write file content",
});

/**
 * Delete a file (soft delete)
 */
export const filesDeleteMutation = defineMutation<FilesDeleteParams, { deleted: boolean }>({
  name: "files.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    FileService.delete(db, params.filePath);
    return { deleted: true };
  },

  invalidates: ["files.list", "files.count"],
  invalidateKeys: (params) => [
    ["files.getbypath", params.projectId, params.filePath],
    ["files.read", params.projectId, params.filePath],
  ],

  description: "Delete a file",
});

/**
 * Revert file to a previous version
 */
export const filesRevertMutation = defineMutation<FilesRevertParams, FileQueryResult>({
  name: "files.revert",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const file = FileService.revertToVersion(db, params.fileId, params.version, {
      sessionId: params.sessionId,
      messageId: params.messageId,
    });
    return toFileQueryResult(file);
  },

  invalidates: ["files.list"],
  invalidateKeys: (params) => [
    ["files.get", params.projectId, params.fileId],
    ["files.versions.list", params.projectId, params.fileId],
  ],

  description: "Revert file to a previous version",
});
