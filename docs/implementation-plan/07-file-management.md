# File Management

## Overview

Iris provides per-project file management with:
- Read/write operations scoped to project
- File versioning for undo/history
- Integration with git for git-based projects
- Virtual filesystem for remote projects

## File Service

```typescript
// src/services/files.ts
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseManager } from '../database';
import { ProjectService } from './projects';
import { EventBus } from '../bus';

export const FileInfo = z.object({
  id: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  hash: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export class FileService {
  // List files in directory
  static async list(
    projectId: string,
    dirPath: string = '/',
    options: { recursive?: boolean; pattern?: string } = {}
  ): Promise<FileEntry[]> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new NotFoundError('Project not found');

    if (project.type === 'remote') {
      return this.listVirtual(projectId, dirPath, options);
    }

    return this.listFilesystem(project.path!, dirPath, options);
  }

  // List from real filesystem
  private static async listFilesystem(
    basePath: string,
    dirPath: string,
    options: { recursive?: boolean; pattern?: string }
  ): Promise<FileEntry[]> {
    const fullPath = path.join(basePath, dirPath);
    const entries: FileEntry[] = [];

    try {
      const items = await fs.readdir(fullPath, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files and common ignores
        if (item.name.startsWith('.')) continue;
        if (['node_modules', 'dist', 'build', '.git'].includes(item.name)) continue;

        const itemPath = path.join(dirPath, item.name);
        const stat = await fs.stat(path.join(basePath, itemPath));

        const entry: FileEntry = {
          name: item.name,
          path: itemPath,
          type: item.isDirectory() ? 'directory' : 'file',
          size: item.isFile() ? stat.size : undefined,
          modifiedAt: stat.mtimeMs,
        };

        entries.push(entry);

        // Recursive listing
        if (options.recursive && item.isDirectory()) {
          const children = await this.listFilesystem(basePath, itemPath, options);
          entries.push(...children);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return entries;
  }

  // List from virtual filesystem (database)
  private static async listVirtual(
    projectId: string,
    dirPath: string,
    options: { recursive?: boolean }
  ): Promise<FileEntry[]> {
    const db = DatabaseManager.getProjectDb(projectId);

    let query = `SELECT * FROM files WHERE deleted_at IS NULL`;
    const params: any[] = [];

    if (options.recursive) {
      query += ` AND path LIKE ?`;
      params.push(dirPath === '/' ? '%' : `${dirPath}/%`);
    } else {
      // Direct children only
      const pattern = dirPath === '/' ? '[^/]+' : `${dirPath.slice(1)}/[^/]+`;
      query += ` AND path REGEXP ?`;
      params.push(`^${pattern}$`);
    }

    return db.prepare(query).all(...params).map(row => ({
      name: path.basename(row.path),
      path: row.path,
      type: row.type,
      size: row.size,
      mimeType: row.mime_type,
      modifiedAt: row.updated_at,
    }));
  }

  // Read file contents
  static async read(
    projectId: string,
    filePath: string,
    options: { offset?: number; limit?: number } = {}
  ): Promise<FileContent | null> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new NotFoundError('Project not found');

    if (project.type === 'remote') {
      return this.readVirtual(projectId, filePath, options);
    }

    return this.readFilesystem(project.path!, filePath, options);
  }

  // Read from filesystem
  private static async readFilesystem(
    basePath: string,
    filePath: string,
    options: { offset?: number; limit?: number }
  ): Promise<FileContent | null> {
    const fullPath = path.join(basePath, filePath);

    try {
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        throw new ValidationError('Cannot read directory');
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      let text = content;
      let lineCount = lines.length;
      let truncated = false;

      // Apply line limits
      if (options.offset !== undefined || options.limit !== undefined) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : lines.length;
        const selectedLines = lines.slice(start, end);
        text = selectedLines.join('\n');
        truncated = end < lines.length;
        lineCount = selectedLines.length;
      }

      return {
        text,
        lineCount,
        totalLines: lines.length,
        truncated,
        mimeType: getMimeType(filePath),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // Read from virtual filesystem
  private static async readVirtual(
    projectId: string,
    filePath: string,
    options: { offset?: number; limit?: number }
  ): Promise<FileContent | null> {
    const db = DatabaseManager.getProjectDb(projectId);

    // Get file record
    const file = db.prepare(
      'SELECT * FROM files WHERE path = ? AND deleted_at IS NULL'
    ).get(filePath);

    if (!file) return null;

    // Get latest version content
    const version = db.prepare(`
      SELECT * FROM file_versions WHERE file_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(file.id);

    if (!version) return null;

    // Read from content store
    const contentPath = path.join(
      DatabaseManager.getProjectFilesPath(projectId),
      'content',
      version.hash
    );

    const content = await fs.readFile(contentPath, 'utf-8');
    // Apply same line limiting as filesystem
    // ...

    return {
      text: content,
      lineCount: content.split('\n').length,
      totalLines: content.split('\n').length,
      truncated: false,
      mimeType: file.mime_type,
    };
  }

  // Write file
  static async write(
    projectId: string,
    filePath: string,
    content: string,
    context?: { sessionId?: string; messageId?: string }
  ): Promise<FileWriteResult> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new NotFoundError('Project not found');

    if (project.type === 'remote') {
      return this.writeVirtual(projectId, filePath, content, context);
    }

    return this.writeFilesystem(project.path!, projectId, filePath, content, context);
  }

  // Write to filesystem
  private static async writeFilesystem(
    basePath: string,
    projectId: string,
    filePath: string,
    content: string,
    context?: { sessionId?: string; messageId?: string }
  ): Promise<FileWriteResult> {
    const fullPath = path.join(basePath, filePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Read existing content for versioning
    let previousContent: string | null = null;
    try {
      previousContent = await fs.readFile(fullPath, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    // Write new content
    await fs.writeFile(fullPath, content, 'utf-8');

    // Track in database for versioning
    const db = DatabaseManager.getProjectDb(projectId);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    let file = db.prepare(
      'SELECT * FROM files WHERE path = ?'
    ).get(filePath);

    if (!file) {
      const fileId = generateId('file');
      db.prepare(`
        INSERT INTO files (id, path, type, mime_type, size, hash, created_at, updated_at)
        VALUES (?, ?, 'file', ?, ?, ?, ?, ?)
      `).run(fileId, filePath, getMimeType(filePath), content.length, hash, Date.now(), Date.now());
      file = { id: fileId };
    } else {
      db.prepare(`
        UPDATE files SET size = ?, hash = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(content.length, hash, Date.now(), file.id);
    }

    // Create version record
    const versionId = generateId('version');
    const version = db.prepare('SELECT MAX(version) as v FROM file_versions WHERE file_id = ?').get(file.id);
    const nextVersion = (version?.v || 0) + 1;

    db.prepare(`
      INSERT INTO file_versions (id, file_id, version, hash, session_id, message_id, patch, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      file.id,
      nextVersion,
      hash,
      context?.sessionId,
      context?.messageId,
      previousContent ? createPatch(previousContent, content) : null,
      Date.now()
    );

    // Emit event
    EventBus.publish(projectId, {
      type: 'file.updated',
      payload: {
        path: filePath,
        sessionId: context?.sessionId,
      },
    });

    return {
      path: filePath,
      size: content.length,
      hash,
      version: nextVersion,
    };
  }

  // Write to virtual filesystem
  private static async writeVirtual(
    projectId: string,
    filePath: string,
    content: string,
    context?: { sessionId?: string; messageId?: string }
  ): Promise<FileWriteResult> {
    const db = DatabaseManager.getProjectDb(projectId);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    // Store content
    const contentDir = path.join(
      DatabaseManager.getProjectFilesPath(projectId),
      'content'
    );
    await fs.mkdir(contentDir, { recursive: true });
    await fs.writeFile(path.join(contentDir, hash), content, 'utf-8');

    // Same DB operations as filesystem write
    // ...

    return {
      path: filePath,
      size: content.length,
      hash,
      version: 1,
    };
  }

  // Delete file
  static async delete(projectId: string, filePath: string): Promise<void> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new NotFoundError('Project not found');

    if (project.type === 'remote') {
      // Soft delete in database
      const db = DatabaseManager.getProjectDb(projectId);
      db.prepare(
        'UPDATE files SET deleted_at = ? WHERE path = ?'
      ).run(Date.now(), filePath);
    } else {
      // Delete from filesystem
      const fullPath = path.join(project.path!, filePath);
      await fs.unlink(fullPath);

      // Mark as deleted in database
      const db = DatabaseManager.getProjectDb(projectId);
      db.prepare(
        'UPDATE files SET deleted_at = ? WHERE path = ?'
      ).run(Date.now(), filePath);
    }

    EventBus.publish(projectId, {
      type: 'file.deleted',
      payload: { path: filePath },
    });
  }

  // Check if file exists
  static async exists(projectId: string, filePath: string): Promise<boolean> {
    const project = await ProjectService.get(projectId);
    if (!project) return false;

    if (project.type === 'remote') {
      const db = DatabaseManager.getProjectDb(projectId);
      const file = db.prepare(
        'SELECT id FROM files WHERE path = ? AND deleted_at IS NULL'
      ).get(filePath);
      return !!file;
    }

    try {
      await fs.access(path.join(project.path!, filePath));
      return true;
    } catch {
      return false;
    }
  }
}
```

## File Versioning

```typescript
// src/services/file-versions.ts
import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

// Create patch from two versions
export function createPatch(oldText: string, newText: string): string {
  const patches = dmp.patch_make(oldText, newText);
  return dmp.patch_toText(patches);
}

// Apply patch to get new version
export function applyPatch(oldText: string, patchText: string): string {
  const patches = dmp.patch_fromText(patchText);
  const [result] = dmp.patch_apply(patches, oldText);
  return result;
}

export class FileVersionService {
  // Get version history for a file
  static async getHistory(
    projectId: string,
    filePath: string,
    limit: number = 50
  ): Promise<FileVersion[]> {
    const db = DatabaseManager.getProjectDb(projectId);

    const file = db.prepare(
      'SELECT id FROM files WHERE path = ?'
    ).get(filePath);

    if (!file) return [];

    return db.prepare(`
      SELECT fv.*, m.role as message_role, s.title as session_title
      FROM file_versions fv
      LEFT JOIN messages m ON fv.message_id = m.id
      LEFT JOIN sessions s ON fv.session_id = s.id
      WHERE fv.file_id = ?
      ORDER BY fv.version DESC
      LIMIT ?
    `).all(file.id, limit).map(row => ({
      id: row.id,
      version: row.version,
      hash: row.hash,
      sessionId: row.session_id,
      sessionTitle: row.session_title,
      messageId: row.message_id,
      createdAt: row.created_at,
    }));
  }

  // Get content at specific version
  static async getVersion(
    projectId: string,
    filePath: string,
    version: number
  ): Promise<string | null> {
    const db = DatabaseManager.getProjectDb(projectId);

    const file = db.prepare(
      'SELECT id FROM files WHERE path = ?'
    ).get(filePath);

    if (!file) return null;

    // Get all versions up to requested version
    const versions = db.prepare(`
      SELECT * FROM file_versions
      WHERE file_id = ? AND version <= ?
      ORDER BY version ASC
    `).all(file.id, version);

    if (versions.length === 0) return null;

    // Reconstruct content by applying patches
    let content = '';
    for (const v of versions) {
      if (v.version === 1 || !v.patch) {
        // First version or no patch - read full content
        const contentPath = path.join(
          DatabaseManager.getProjectFilesPath(projectId),
          'content',
          v.hash
        );
        content = await fs.readFile(contentPath, 'utf-8');
      } else {
        // Apply patch
        content = applyPatch(content, v.patch);
      }
    }

    return content;
  }

  // Restore file to specific version
  static async restore(
    projectId: string,
    filePath: string,
    version: number,
    context?: { sessionId?: string; messageId?: string }
  ): Promise<FileWriteResult> {
    const content = await this.getVersion(projectId, filePath, version);

    if (content === null) {
      throw new NotFoundError('Version not found');
    }

    return FileService.write(projectId, filePath, content, context);
  }

  // Get diff between two versions
  static async getDiff(
    projectId: string,
    filePath: string,
    fromVersion: number,
    toVersion: number
  ): Promise<FileDiff> {
    const fromContent = await this.getVersion(projectId, filePath, fromVersion);
    const toContent = await this.getVersion(projectId, filePath, toVersion);

    if (fromContent === null || toContent === null) {
      throw new NotFoundError('Version not found');
    }

    const diffs = dmp.diff_main(fromContent, toContent);
    dmp.diff_cleanupSemantic(diffs);

    return {
      fromVersion,
      toVersion,
      hunks: diffsToHunks(diffs, fromContent),
    };
  }
}
```

## Snapshot System

```typescript
// src/services/snapshots.ts
import { glob } from 'glob';
import crypto from 'crypto';

export class SnapshotService {
  // Create snapshot of current project state
  static async create(
    projectId: string,
    context?: { sessionId?: string; messageId?: string }
  ): Promise<Snapshot> {
    const project = await ProjectService.get(projectId);
    if (!project || project.type === 'remote') {
      throw new ValidationError('Snapshots only supported for local projects');
    }

    const files = await this.collectFiles(project.path!);
    const hash = this.computeHash(files);

    const db = DatabaseManager.getProjectDb(projectId);
    const id = generateId('snapshot');

    db.prepare(`
      INSERT INTO snapshots (id, session_id, message_id, hash, file_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, context?.sessionId, context?.messageId, hash, files.length, Date.now());

    // Store file list
    for (const file of files) {
      db.prepare(`
        INSERT INTO snapshot_files (snapshot_id, path, hash, size)
        VALUES (?, ?, ?, ?)
      `).run(id, file.path, file.hash, file.size);
    }

    return { id, hash, fileCount: files.length, createdAt: Date.now() };
  }

  // Collect all tracked files
  private static async collectFiles(basePath: string): Promise<SnapshotFile[]> {
    const pattern = '**/*';
    const ignore = ['node_modules/**', '.git/**', 'dist/**', 'build/**'];

    const matches = await glob(pattern, {
      cwd: basePath,
      nodir: true,
      ignore,
    });

    const files: SnapshotFile[] = [];

    for (const match of matches) {
      const fullPath = path.join(basePath, match);
      const stat = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

      files.push({
        path: match,
        hash,
        size: stat.size,
      });
    }

    return files;
  }

  // Compute overall hash from files
  private static computeHash(files: SnapshotFile[]): string {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const combined = sorted.map(f => `${f.path}:${f.hash}`).join('\n');
    return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
  }

  // Get diff between two snapshots
  static async diff(
    projectId: string,
    fromSnapshotId: string,
    toSnapshotId: string
  ): Promise<SnapshotDiff> {
    const db = DatabaseManager.getProjectDb(projectId);

    const fromFiles = new Map(
      db.prepare('SELECT path, hash FROM snapshot_files WHERE snapshot_id = ?')
        .all(fromSnapshotId)
        .map(f => [f.path, f.hash])
    );

    const toFiles = new Map(
      db.prepare('SELECT path, hash FROM snapshot_files WHERE snapshot_id = ?')
        .all(toSnapshotId)
        .map(f => [f.path, f.hash])
    );

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    // Find added and modified
    for (const [path, hash] of toFiles) {
      if (!fromFiles.has(path)) {
        added.push(path);
      } else if (fromFiles.get(path) !== hash) {
        modified.push(path);
      }
    }

    // Find deleted
    for (const path of fromFiles.keys()) {
      if (!toFiles.has(path)) {
        deleted.push(path);
      }
    }

    return { added, modified, deleted };
  }

  // Restore to snapshot
  static async restore(
    projectId: string,
    snapshotId: string
  ): Promise<void> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new NotFoundError('Project not found');

    const db = DatabaseManager.getProjectDb(projectId);
    const files = db.prepare(
      'SELECT * FROM snapshot_files WHERE snapshot_id = ?'
    ).all(snapshotId);

    // Get current snapshot
    const currentFiles = await this.collectFiles(project.path!);
    const currentPaths = new Set(currentFiles.map(f => f.path));

    // Restore each file
    for (const file of files) {
      const version = await FileVersionService.getVersionByHash(projectId, file.path, file.hash);
      if (version) {
        const content = await FileVersionService.getVersion(projectId, file.path, version);
        if (content) {
          await FileService.write(projectId, file.path, content);
        }
      }
    }

    // Delete files not in snapshot
    const snapshotPaths = new Set(files.map(f => f.path));
    for (const currentPath of currentPaths) {
      if (!snapshotPaths.has(currentPath)) {
        await FileService.delete(projectId, currentPath);
      }
    }
  }
}
```

## File Watcher

```typescript
// src/services/file-watcher.ts
import { watch } from 'fs';
import { EventBus } from '../bus';

export class FileWatcher {
  private watchers = new Map<string, fs.FSWatcher>();

  // Start watching a project
  async start(projectId: string): Promise<void> {
    const project = await ProjectService.get(projectId);
    if (!project || project.type === 'remote') return;

    if (this.watchers.has(projectId)) return;

    const watcher = watch(
      project.path!,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        // Ignore common patterns
        if (filename.includes('node_modules')) return;
        if (filename.includes('.git')) return;
        if (filename.startsWith('.')) return;

        EventBus.publish(projectId, {
          type: eventType === 'rename' ? 'file.created' : 'file.updated',
          payload: {
            path: filename,
            external: true, // Changed outside of Iris
          },
        });
      }
    );

    this.watchers.set(projectId, watcher);
  }

  // Stop watching a project
  stop(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectId);
    }
  }

  // Stop all watchers
  stopAll(): void {
    for (const [id, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

export const fileWatcher = new FileWatcher();
```
