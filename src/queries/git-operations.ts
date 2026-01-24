/**
 * Git Operation Query Definitions
 *
 * Queries and mutations for git operations.
 * These work with the filesystem directly rather than a database.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { ProjectService } from "../services/projects.ts";
import { DatabaseManager } from "../database/index.ts";
import { GitService } from "../services/git.ts";
import type {
  GitStatus,
  BranchInfo,
  CommitInfo,
  GitSyncStatus,
  FileChange,
} from "../services/git-types.ts";

// ============================================
// Query Result Types (re-exported from git-types)
// ============================================

// Re-export types directly
export type { GitStatus, BranchInfo, CommitInfo, GitSyncStatus, FileChange };

/**
 * Remote info result
 */
export interface RemoteInfoResult {
  name: string;
  url: string;
}

// ============================================
// Query Parameters
// ============================================

export interface GitStatusParams {
  projectId: string;
}

export interface GitBranchesParams {
  projectId: string;
}

export interface GitLogParams {
  projectId: string;
  limit?: number;
  file?: string;
}

export interface GitCommitGetParams {
  projectId: string;
  hash: string;
}

export interface GitDiffParams {
  projectId: string;
  commit?: string;
  file?: string;
}

export interface GitCommitDiffParams {
  projectId: string;
  hash: string;
}

export interface GitCommitFileDiffParams {
  projectId: string;
  hash: string;
  file: string;
}

export interface GitShowFileParams {
  projectId: string;
  filePath: string;
  commit: string;
}

export interface GitListTreeParams {
  projectId: string;
  dirPath: string;
  commit: string;
}

export interface GitRemotesParams {
  projectId: string;
}

export interface GitSyncStatusParams {
  projectId: string;
}

// ============================================
// Mutation Parameters
// ============================================

export interface GitCheckoutParams {
  projectId: string;
  branch: string;
}

export interface GitCreateBranchParams {
  projectId: string;
  name: string;
  from?: string;
}

export interface GitDeleteBranchParams {
  projectId: string;
  name: string;
  force?: boolean;
}

export interface GitCommitParams {
  projectId: string;
  message: string;
}

export interface GitFetchParams {
  projectId: string;
  remote?: string;
}

export interface GitPullParams {
  projectId: string;
  remote?: string;
  branch?: string;
}

export interface GitPushParams {
  projectId: string;
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
}

export interface GitAddRemoteParams {
  projectId: string;
  name: string;
  url: string;
}

export interface GitInitParams {
  projectId: string;
}

export interface GitDiscardParams {
  projectId: string;
  file: string;
}

export interface GitDiscardAllParams {
  projectId: string;
}

export interface GitRebaseParams {
  projectId: string;
  upstream?: string;
}

export interface GitAbortRebaseParams {
  projectId: string;
}

export interface GitSyncParams {
  projectId: string;
}

// ============================================
// Helper Functions
// ============================================

async function getProjectPath(projectId: string): Promise<string> {
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  if (!project.path) {
    throw new Error(`Project ${projectId} does not have a local path`);
  }
  return project.path;
}

// ============================================
// Query Definitions
// ============================================

/**
 * Get git status for a project
 */
export const gitStatusQuery = defineQuery<GitStatus, GitStatusParams>({
  name: "git.status",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.status(projectPath);
  },

  cache: {
    ttl: 2_000, // Short TTL - status changes frequently
    scope: "project",
    key: (params) => ["git.status", params.projectId],
  },

  realtime: {
    events: ["git.status.changed"],
  },

  description: "Get git status for a project",
});

/**
 * List git branches
 */
export const gitBranchesQuery = defineQuery<BranchInfo[], GitBranchesParams>({
  name: "git.branches",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.branches(projectPath);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["git.branches", params.projectId],
  },

  realtime: {
    events: ["git.branch.created", "git.branch.deleted", "git.checkout"],
  },

  description: "List git branches",
});

/**
 * Get commit log
 */
export const gitLogQuery = defineQuery<CommitInfo[], GitLogParams>({
  name: "git.log",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.log(projectPath, {
      limit: params.limit,
      file: params.file,
    });
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["git.log", params.projectId];
      if (params.limit) keyParts.push(`limit:${params.limit}`);
      if (params.file) keyParts.push(`file:${params.file}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["git.commit", "git.pull", "git.fetch"],
  },

  description: "Get commit log",
});

/**
 * Get a specific commit
 */
export const gitCommitGetQuery = defineQuery<CommitInfo | null, GitCommitGetParams>({
  name: "git.commit.get",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.getCommit(projectPath, params.hash);
  },

  cache: {
    ttl: 60_000, // Commits are immutable
    scope: "project",
    key: (params) => ["git.commit.get", params.projectId, params.hash],
  },

  description: "Get a specific commit",
});

/**
 * Get working tree diff
 */
export const gitDiffQuery = defineQuery<string, GitDiffParams>({
  name: "git.diff",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.diff(projectPath, {
      commit: params.commit,
      file: params.file,
    });
  },

  cache: {
    ttl: 2_000, // Short TTL - diff changes with working tree
    scope: "project",
    key: (params) => {
      const keyParts = ["git.diff", params.projectId];
      if (params.commit) keyParts.push(`commit:${params.commit}`);
      if (params.file) keyParts.push(`file:${params.file}`);
      return keyParts;
    },
  },

  description: "Get working tree diff",
});

/**
 * Get diff for a specific commit
 */
export const gitCommitDiffQuery = defineQuery<string, GitCommitDiffParams>({
  name: "git.commit.diff",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.commitDiff(projectPath, params.hash);
  },

  cache: {
    ttl: 60_000, // Commit diffs are immutable
    scope: "project",
    key: (params) => ["git.commit.diff", params.projectId, params.hash],
  },

  description: "Get diff for a specific commit",
});

/**
 * Get file diff within a commit
 */
export const gitCommitFileDiffQuery = defineQuery<string, GitCommitFileDiffParams>({
  name: "git.commit.file.diff",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.commitFileDiff(projectPath, params.hash, params.file);
  },

  cache: {
    ttl: 60_000, // Immutable
    scope: "project",
    key: (params) => ["git.commit.file.diff", params.projectId, params.hash, params.file],
  },

  description: "Get file diff within a commit",
});

/**
 * Get file content at a specific commit
 */
export const gitShowFileQuery = defineQuery<string, GitShowFileParams>({
  name: "git.show.file",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.showFile(projectPath, params.filePath, params.commit);
  },

  cache: {
    ttl: 60_000, // Immutable
    scope: "project",
    key: (params) => ["git.show.file", params.projectId, params.filePath, params.commit],
  },

  description: "Get file content at a specific commit",
});

/**
 * List directory at a specific commit
 */
export const gitListTreeQuery = defineQuery<Array<{ name: string; path: string; type: string }>, GitListTreeParams>({
  name: "git.ls.tree",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.listTree(projectPath, params.dirPath, params.commit);
  },

  cache: {
    ttl: 60_000, // Immutable
    scope: "project",
    key: (params) => ["git.ls.tree", params.projectId, params.dirPath, params.commit],
  },

  description: "List directory at a specific commit",
});

/**
 * Get git remotes
 */
export const gitRemotesQuery = defineQuery<RemoteInfoResult[], GitRemotesParams>({
  name: "git.remotes",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.remotes(projectPath);
  },

  cache: {
    ttl: 30_000,
    scope: "project",
    key: (params) => ["git.remotes", params.projectId],
  },

  realtime: {
    events: ["git.remote.added", "git.remote.removed"],
  },

  description: "Get git remotes",
});

/**
 * Get sync status
 */
export const gitSyncStatusQuery = defineQuery<GitSyncStatus, GitSyncStatusParams>({
  name: "git.sync.status",

  fetch: async (params, _context: QueryContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.getSyncStatus(projectPath);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["git.sync.status", params.projectId],
  },

  realtime: {
    events: ["git.fetch", "git.pull", "git.push", "git.commit"],
  },

  description: "Get sync status",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Checkout a branch
 */
export const gitCheckoutMutation = defineMutation<GitCheckoutParams, { success: boolean }>({
  name: "git.checkout",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.checkout(projectPath, params.branch);
    return { success: true };
  },

  invalidates: ["git.status", "git.branches", "git.diff"],

  description: "Checkout a branch",
});

/**
 * Create a new branch
 */
export const gitCreateBranchMutation = defineMutation<GitCreateBranchParams, BranchInfo>({
  name: "git.branch.create",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.createBranch(projectPath, params.name, params.from);
  },

  invalidates: ["git.branches"],

  description: "Create a new branch",
});

/**
 * Delete a branch
 */
export const gitDeleteBranchMutation = defineMutation<GitDeleteBranchParams, { deleted: boolean }>({
  name: "git.branch.delete",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.deleteBranch(projectPath, params.name, params.force);
    return { deleted: true };
  },

  invalidates: ["git.branches"],

  description: "Delete a branch",
});

/**
 * Create a commit
 */
export const gitCommitMutation = defineMutation<GitCommitParams, { hash: string; message: string; summary: { changes: number; insertions: number; deletions: number } }>({
  name: "git.commit",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.commit(projectPath, params.message);
  },

  invalidates: ["git.status", "git.log", "git.diff", "git.sync.status"],

  description: "Create a commit",
});

/**
 * Fetch from remote
 */
export const gitFetchMutation = defineMutation<GitFetchParams, { success: boolean }>({
  name: "git.fetch",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.fetch(projectPath, params.remote);
    return { success: true };
  },

  invalidates: ["git.status", "git.log", "git.branches", "git.sync.status"],

  description: "Fetch from remote",
});

/**
 * Pull from remote
 */
export const gitPullMutation = defineMutation<GitPullParams, { files: string[]; summary: { changes: number; insertions: number; deletions: number } }>({
  name: "git.pull",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.pull(projectPath, params.remote, params.branch);
  },

  invalidates: ["git.status", "git.log", "git.diff", "git.sync.status"],

  description: "Pull from remote",
});

/**
 * Push to remote
 */
export const gitPushMutation = defineMutation<GitPushParams, { success: boolean }>({
  name: "git.push",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.push(projectPath, params.remote, params.branch, params.setUpstream);
    return { success: true };
  },

  invalidates: ["git.status", "git.sync.status"],

  description: "Push to remote",
});

/**
 * Add a remote
 */
export const gitAddRemoteMutation = defineMutation<GitAddRemoteParams, { success: boolean }>({
  name: "git.remote.add",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.addRemote(projectPath, params.name, params.url);
    return { success: true };
  },

  invalidates: ["git.remotes"],

  description: "Add a remote",
});

/**
 * Initialize git repository
 */
export const gitInitMutation = defineMutation<GitInitParams, { success: boolean }>({
  name: "git.init",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.init(projectPath);
    return { success: true };
  },

  invalidates: ["git.status", "git.branches"],

  description: "Initialize git repository",
});

/**
 * Discard changes to a file
 */
export const gitDiscardMutation = defineMutation<GitDiscardParams, { success: boolean }>({
  name: "git.discard",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.discardChanges(projectPath, params.file);
    return { success: true };
  },

  invalidates: ["git.status", "git.diff"],

  description: "Discard changes to a file",
});

/**
 * Discard all changes
 */
export const gitDiscardAllMutation = defineMutation<GitDiscardAllParams, { success: boolean }>({
  name: "git.discard.all",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.discardAllChanges(projectPath);
    return { success: true };
  },

  invalidates: ["git.status", "git.diff"],

  description: "Discard all changes",
});

/**
 * Rebase onto upstream
 */
export const gitRebaseMutation = defineMutation<GitRebaseParams, { success: boolean; conflictedFiles?: string[] }>({
  name: "git.rebase",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.rebase(projectPath, params.upstream);
  },

  invalidates: ["git.status", "git.log", "git.sync.status"],

  description: "Rebase onto upstream",
});

/**
 * Abort rebase
 */
export const gitAbortRebaseMutation = defineMutation<GitAbortRebaseParams, { success: boolean }>({
  name: "git.rebase.abort",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    await GitService.abortRebase(projectPath);
    return { success: true };
  },

  invalidates: ["git.status", "git.log"],

  description: "Abort rebase",
});

/**
 * Full sync (fetch, rebase, push)
 */
export const gitSyncMutation = defineMutation<GitSyncParams, GitSyncStatus>({
  name: "git.sync",

  execute: async (params, _context: MutationContext) => {
    const projectPath = await getProjectPath(params.projectId);
    return GitService.sync(projectPath);
  },

  invalidates: ["git.status", "git.log", "git.diff", "git.sync.status"],

  description: "Full sync (fetch, rebase, push)",
});
