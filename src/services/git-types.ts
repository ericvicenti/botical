/**
 * Git service types for version control operations
 */

/** File change status codes */
export type FileStatus = "M" | "A" | "D" | "R" | "?" | "C";

/** A file that has changed in the working tree */
export interface FileChange {
  path: string;
  status: FileStatus;
  oldPath?: string; // For renames
}

/** Git working tree status */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
  /** All uncommitted changes (modified, added, deleted, untracked) */
  files: FileChange[];
  /** Whether this is a git repository */
  isRepo: boolean;
}

/** Branch information */
export interface BranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Commit hash at tip of branch */
  commit: string;
  /** Remote tracking branch if any */
  remote?: string;
}

/** Commit information */
export interface CommitInfo {
  /** Full commit hash */
  hash: string;
  /** Short (7 char) commit hash */
  hashShort: string;
  /** Commit message (first line) */
  message: string;
  /** Full commit message including body */
  body?: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit timestamp (ms since epoch) */
  date: number;
  /** Files changed in this commit (only for single commit view) */
  files?: FileChange[];
}

/** Result of creating a commit */
export interface CommitResult {
  /** Hash of the new commit */
  hash: string;
  /** Commit message */
  message: string;
  /** Summary of changes */
  summary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
}

/** Options for getting commit log */
export interface LogOptions {
  /** Maximum number of commits to return */
  limit?: number;
  /** Only show commits affecting this file */
  file?: string;
  /** Start from this commit */
  from?: string;
  /** End at this commit */
  to?: string;
}

/** Options for getting diff */
export interface DiffOptions {
  /** Get diff for specific file */
  file?: string;
  /** Compare against specific commit */
  commit?: string;
}

/** Result of cloning a repository */
export interface CloneResult {
  /** Path where repo was cloned */
  path: string;
  /** Name of the repository */
  name: string;
  /** Default branch */
  branch: string;
}

/** Options for cloning a repository */
export interface CloneOptions {
  /** URL to clone from */
  url: string;
  /** Target path (optional, will use default workspace) */
  path?: string;
  /** Branch to checkout (optional, uses default) */
  branch?: string;
}

/** Sync operation status */
export type SyncState =
  | "idle"
  | "fetching"
  | "pushing"
  | "rebasing"
  | "conflict"
  | "error";

/** Git sync status for a project */
export interface GitSyncStatus {
  /** Current sync state */
  state: SyncState;
  /** Commits ahead of remote */
  ahead: number;
  /** Commits behind remote */
  behind: number;
  /** Whether there's a remote configured */
  hasRemote: boolean;
  /** Whether tracking a remote branch */
  hasUpstream: boolean;
  /** Error message if state is "error" */
  error?: string;
  /** Conflicted files if state is "conflict" */
  conflictedFiles?: string[];
  /** Last sync time (ms since epoch) */
  lastSyncTime?: number;
}
