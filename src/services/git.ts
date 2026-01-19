/**
 * Git Service
 *
 * Provides git operations for project repositories.
 * Uses simple-git library for git operations.
 */

import simpleGit, { type SimpleGit, type StatusResult } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import type {
  GitStatus,
  FileChange,
  FileStatus,
  BranchInfo,
  CommitInfo,
  CommitResult,
  LogOptions,
  DiffOptions,
  CloneResult,
  CloneOptions,
  GitSyncStatus,
  SyncState,
} from "./git-types";

// Default workspace directory for cloned repos
const DEFAULT_WORKSPACES_DIR = path.join(homedir(), ".iris", "workspaces");

/**
 * Ensure workspaces directory exists
 */
function ensureWorkspacesDir(): void {
  if (!fs.existsSync(DEFAULT_WORKSPACES_DIR)) {
    fs.mkdirSync(DEFAULT_WORKSPACES_DIR, { recursive: true });
  }
}

/**
 * Extract repository name from a git URL
 */
function extractRepoName(url: string): string {
  // Handle various URL formats:
  // https://github.com/user/repo.git
  // https://github.com/user/repo
  // git@github.com:user/repo.git
  // git@github.com:user/repo
  const cleaned = url.replace(/\.git$/, "");
  const parts = cleaned.split(/[/:]/);
  return parts[parts.length - 1] || "repo";
}

/**
 * Map simple-git status to our FileStatus
 */
function mapFileStatus(index: string, workingDir: string): FileStatus {
  // Priority: working dir changes over staged changes
  if (workingDir === "M" || index === "M") return "M";
  if (workingDir === "D" || index === "D") return "D";
  if (workingDir === "A" || index === "A") return "A";
  if (workingDir === "R" || index === "R") return "R";
  if (workingDir === "?" || index === "?") return "?";
  if (workingDir === "C" || index === "C") return "C";
  return "M"; // Default to modified
}

/**
 * Git Service for version control operations
 */
export class GitService {
  /**
   * Get a SimpleGit instance for a project path
   */
  private static getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath, {
      binary: "git",
      maxConcurrentProcesses: 6,
      trimmed: true,
    });
  }

  /**
   * Check if a path is a git repository
   */
  static async isRepo(projectPath: string): Promise<boolean> {
    if (!projectPath || !fs.existsSync(projectPath)) {
      return false;
    }
    try {
      const git = this.getGit(projectPath);
      return await git.checkIsRepo();
    } catch {
      return false;
    }
  }

  /**
   * Get the working tree status (all uncommitted changes)
   */
  static async status(projectPath: string): Promise<GitStatus> {
    const isRepo = await this.isRepo(projectPath);
    if (!isRepo) {
      return {
        branch: "",
        ahead: 0,
        behind: 0,
        files: [],
        isRepo: false,
      };
    }

    const git = this.getGit(projectPath);
    const status: StatusResult = await git.status();

    // Combine all changes into a single list (no staging distinction in UI)
    const filesMap = new Map<string, FileChange>();

    // Add staged files
    for (const file of status.staged) {
      filesMap.set(file, { path: file, status: "M" });
    }

    // Add modified files (may override staged)
    for (const file of status.modified) {
      filesMap.set(file, { path: file, status: "M" });
    }

    // Add deleted files
    for (const file of status.deleted) {
      filesMap.set(file, { path: file, status: "D" });
    }

    // Add renamed files
    for (const file of status.renamed) {
      filesMap.set(file.to, {
        path: file.to,
        status: "R",
        oldPath: file.from,
      });
    }

    // Add created/added files
    for (const file of status.created) {
      filesMap.set(file, { path: file, status: "A" });
    }

    // Add untracked files
    for (const file of status.not_added) {
      filesMap.set(file, { path: file, status: "?" });
    }

    // Process files array for more accurate status
    for (const file of status.files) {
      const existing = filesMap.get(file.path);
      if (!existing) {
        filesMap.set(file.path, {
          path: file.path,
          status: mapFileStatus(file.index, file.working_dir),
        });
      }
    }

    return {
      branch: status.current || "HEAD",
      ahead: status.ahead,
      behind: status.behind,
      files: Array.from(filesMap.values()).sort((a, b) =>
        a.path.localeCompare(b.path)
      ),
      isRepo: true,
    };
  }

  /**
   * List all branches
   */
  static async branches(projectPath: string): Promise<BranchInfo[]> {
    const git = this.getGit(projectPath);
    const branchSummary = await git.branch(["-a"]);

    const branches: BranchInfo[] = [];
    for (const [name, data] of Object.entries(branchSummary.branches)) {
      // Skip remote tracking refs
      if (name.startsWith("remotes/")) continue;

      branches.push({
        name: data.name,
        current: data.current,
        commit: data.commit,
        remote: data.label || undefined,
      });
    }

    return branches.sort((a, b) => {
      // Current branch first
      if (a.current) return -1;
      if (b.current) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get current branch name
   */
  static async currentBranch(projectPath: string): Promise<string> {
    const git = this.getGit(projectPath);
    const branchSummary = await git.branch();
    return branchSummary.current || "HEAD";
  }

  /**
   * Switch to a branch
   */
  static async checkout(projectPath: string, branch: string): Promise<void> {
    const git = this.getGit(projectPath);
    await git.checkout(branch);
  }

  /**
   * Create a new branch
   */
  static async createBranch(
    projectPath: string,
    name: string,
    from?: string
  ): Promise<BranchInfo> {
    const git = this.getGit(projectPath);

    if (from) {
      await git.checkoutBranch(name, from);
    } else {
      await git.checkoutLocalBranch(name);
    }

    const branchSummary = await git.branch();
    const branch = branchSummary.branches[name];

    if (!branch) {
      throw new Error(`Branch ${name} not found after creation`);
    }

    return {
      name: branch.name,
      current: branch.current,
      commit: branch.commit,
    };
  }

  /**
   * Delete a branch
   */
  static async deleteBranch(
    projectPath: string,
    name: string,
    force = false
  ): Promise<void> {
    const git = this.getGit(projectPath);
    await git.deleteLocalBranch(name, force);
  }

  /**
   * Get commit log
   */
  static async log(
    projectPath: string,
    options: LogOptions = {}
  ): Promise<CommitInfo[]> {
    const git = this.getGit(projectPath);
    const limit = options.limit || 50;

    const logOptions: string[] = [`-n ${limit}`];

    if (options.file) {
      logOptions.push("--", options.file);
    }

    const log = await git.log(logOptions);

    return log.all.map((commit) => ({
      hash: commit.hash,
      hashShort: commit.hash.substring(0, 7),
      message: commit.message,
      body: commit.body || undefined,
      author: commit.author_name,
      email: commit.author_email,
      date: new Date(commit.date).getTime(), // Parse date string to milliseconds
    }));
  }

  /**
   * Get a single commit by hash
   */
  static async getCommit(
    projectPath: string,
    hash: string
  ): Promise<CommitInfo | null> {
    const git = this.getGit(projectPath);

    try {
      const log = await git.log(["-1", hash]);
      if (!log.latest) return null;

      // Get files changed in this commit
      // For the first commit (no parent), use --root option
      let files: FileChange[] = [];
      try {
        const diffSummary = await git.diffSummary([`${hash}^`, hash]);
        files = diffSummary.files.map((file) => ({
          path: file.file,
          status: file.binary
            ? "M"
            : file.insertions > 0 && file.deletions === 0
              ? "A"
              : file.deletions > 0 && file.insertions === 0
                ? "D"
                : "M",
        }));
      } catch {
        // First commit - use diff-tree with --root to get files
        const diffSummary = await git.diffSummary(["--root", hash]);
        files = diffSummary.files.map((file) => ({
          path: file.file,
          status: "A" as const, // All files are added in first commit
        }));
      }

      return {
        hash: log.latest.hash,
        hashShort: log.latest.hash.substring(0, 7),
        message: log.latest.message,
        body: log.latest.body || undefined,
        author: log.latest.author_name,
        email: log.latest.author_email,
        date: new Date(log.latest.date).getTime(), // Parse date string to milliseconds
        files,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a commit (auto-stages all changes)
   */
  static async commit(
    projectPath: string,
    message: string
  ): Promise<CommitResult> {
    const git = this.getGit(projectPath);

    // Stage all changes (tracked and untracked)
    await git.add("-A");

    // Create the commit
    const result = await git.commit(message);

    return {
      hash: result.commit,
      message,
      summary: {
        changes: result.summary.changes,
        insertions: result.summary.insertions,
        deletions: result.summary.deletions,
      },
    };
  }

  /**
   * Get diff for working tree changes
   */
  static async diff(
    projectPath: string,
    options: DiffOptions = {}
  ): Promise<string> {
    const git = this.getGit(projectPath);

    const args: string[] = [];

    if (options.commit) {
      args.push(options.commit);
    }

    if (options.file) {
      args.push("--", options.file);
    }

    // Include both staged and unstaged changes
    const stagedDiff = await git.diff(["--cached", ...args]);
    const unstagedDiff = await git.diff(args);

    // Combine diffs (if both exist)
    if (stagedDiff && unstagedDiff) {
      return `${stagedDiff}\n${unstagedDiff}`;
    }
    return stagedDiff || unstagedDiff || "";
  }

  /**
   * Get diff for a specific commit
   */
  static async commitDiff(projectPath: string, hash: string): Promise<string> {
    const git = this.getGit(projectPath);
    return await git.diff([`${hash}^`, hash]);
  }

  /**
   * Get diff for a specific file in a commit
   */
  static async commitFileDiff(
    projectPath: string,
    hash: string,
    file: string
  ): Promise<string> {
    const git = this.getGit(projectPath);
    return await git.diff([`${hash}^`, hash, "--", file]);
  }

  /**
   * Clone a repository
   */
  static async clone(options: CloneOptions): Promise<CloneResult> {
    ensureWorkspacesDir();

    const repoName = extractRepoName(options.url);
    const targetPath =
      options.path || path.join(DEFAULT_WORKSPACES_DIR, repoName);

    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      throw new Error(`Target path already exists: ${targetPath}`);
    }

    const git = simpleGit();

    const cloneOptions: string[] = [];
    if (options.branch) {
      cloneOptions.push("-b", options.branch);
    }

    await git.clone(options.url, targetPath, cloneOptions);

    // Get the default branch
    const clonedGit = this.getGit(targetPath);
    const branchSummary = await clonedGit.branch();

    return {
      path: targetPath,
      name: repoName,
      branch: branchSummary.current || "main",
    };
  }

  /**
   * Fetch from remote
   */
  static async fetch(
    projectPath: string,
    remote = "origin"
  ): Promise<void> {
    const git = this.getGit(projectPath);
    await git.fetch(remote);
  }

  /**
   * Pull from remote
   */
  static async pull(
    projectPath: string,
    remote = "origin",
    branch?: string
  ): Promise<{ files: string[]; summary: { changes: number; insertions: number; deletions: number } }> {
    const git = this.getGit(projectPath);

    const currentBranch = branch || (await this.currentBranch(projectPath));
    const result = await git.pull(remote, currentBranch);

    return {
      files: result.files,
      summary: {
        changes: result.summary.changes,
        insertions: result.summary.insertions,
        deletions: result.summary.deletions,
      },
    };
  }

  /**
   * Push to remote
   */
  static async push(
    projectPath: string,
    remote = "origin",
    branch?: string,
    setUpstream = false
  ): Promise<void> {
    const git = this.getGit(projectPath);

    const currentBranch = branch || (await this.currentBranch(projectPath));

    if (setUpstream) {
      await git.push(["-u", remote, currentBranch]);
    } else {
      await git.push(remote, currentBranch);
    }
  }

  /**
   * Get remotes
   */
  static async remotes(
    projectPath: string
  ): Promise<{ name: string; url: string }[]> {
    const git = this.getGit(projectPath);
    const remotes = await git.getRemotes(true);

    return remotes.map((r) => ({
      name: r.name,
      url: r.refs.fetch || r.refs.push || "",
    }));
  }

  /**
   * Add a remote
   */
  static async addRemote(
    projectPath: string,
    name: string,
    url: string
  ): Promise<void> {
    const git = this.getGit(projectPath);
    await git.addRemote(name, url);
  }

  /**
   * Initialize a new git repository
   */
  static async init(projectPath: string): Promise<void> {
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }
    const git = this.getGit(projectPath);
    await git.init();
  }

  /**
   * Discard changes to a file (restore from HEAD)
   */
  static async discardChanges(
    projectPath: string,
    file: string
  ): Promise<void> {
    const git = this.getGit(projectPath);
    await git.checkout(["--", file]);
  }

  /**
   * Discard all uncommitted changes
   */
  static async discardAllChanges(projectPath: string): Promise<void> {
    const git = this.getGit(projectPath);
    await git.checkout(["--", "."]);
    await git.clean("fd"); // Remove untracked files and directories
  }

  /**
   * Get file content at a specific commit
   */
  static async showFile(
    projectPath: string,
    filePath: string,
    commit: string
  ): Promise<string> {
    const git = this.getGit(projectPath);
    // git show <commit>:<path>
    const content = await git.show([`${commit}:${filePath}`]);
    return content;
  }

  /**
   * List directory contents at a specific commit
   */
  static async listTree(
    projectPath: string,
    dirPath: string,
    commit: string
  ): Promise<Array<{ name: string; path: string; type: "file" | "directory" }>> {
    const git = this.getGit(projectPath);

    // git ls-tree <commit> <path>
    // Format: <mode> <type> <hash>\t<name>
    const treePath = dirPath ? `${dirPath}/` : "";
    const result = await git.raw([
      "ls-tree",
      "--name-only",
      commit,
      treePath,
    ]);

    if (!result.trim()) {
      return [];
    }

    const entries: Array<{ name: string; path: string; type: "file" | "directory" }> = [];
    const lines = result.trim().split("\n");

    for (const line of lines) {
      if (!line) continue;

      // Get full info to determine type
      const fullInfo = await git.raw([
        "ls-tree",
        commit,
        line,
      ]);

      const match = fullInfo.match(/^(\d+)\s+(blob|tree)\s+/);
      const isDirectory = match?.[2] === "tree";
      const name = line.split("/").pop() || line;

      entries.push({
        name,
        path: line,
        type: isDirectory ? "directory" : "file",
      });
    }

    return entries;
  }

  /**
   * Check if currently in a rebase state
   */
  static async isRebasing(projectPath: string): Promise<boolean> {
    const gitDir = path.join(projectPath, ".git");
    return (
      fs.existsSync(path.join(gitDir, "rebase-merge")) ||
      fs.existsSync(path.join(gitDir, "rebase-apply"))
    );
  }

  /**
   * Get list of conflicted files during merge/rebase
   */
  static async getConflictedFiles(projectPath: string): Promise<string[]> {
    const git = this.getGit(projectPath);
    try {
      const result = await git.raw(["diff", "--name-only", "--diff-filter=U"]);
      return result.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Rebase current branch onto upstream
   */
  static async rebase(
    projectPath: string,
    upstream?: string
  ): Promise<{ success: boolean; conflictedFiles?: string[] }> {
    const git = this.getGit(projectPath);
    try {
      if (upstream) {
        await git.rebase([upstream]);
      } else {
        // Rebase onto tracking branch
        await git.rebase();
      }
      return { success: true };
    } catch (err) {
      // Check if it's a conflict
      const conflicted = await this.getConflictedFiles(projectPath);
      if (conflicted.length > 0) {
        return { success: false, conflictedFiles: conflicted };
      }
      throw err;
    }
  }

  /**
   * Abort an in-progress rebase
   */
  static async abortRebase(projectPath: string): Promise<void> {
    const git = this.getGit(projectPath);
    await git.rebase(["--abort"]);
  }

  /**
   * Check if branch has an upstream tracking branch
   */
  static async hasUpstream(projectPath: string, branch?: string): Promise<boolean> {
    const git = this.getGit(projectPath);
    const currentBranch = branch || (await this.currentBranch(projectPath));
    try {
      const result = await git.raw([
        "config",
        "--get",
        `branch.${currentBranch}.remote`,
      ]);
      return !!result.trim();
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive sync status
   */
  static async getSyncStatus(projectPath: string): Promise<GitSyncStatus> {
    const isRepo = await this.isRepo(projectPath);
    if (!isRepo) {
      return {
        state: "idle",
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
      };
    }

    const git = this.getGit(projectPath);

    // Check if rebasing
    if (await this.isRebasing(projectPath)) {
      const conflicted = await this.getConflictedFiles(projectPath);
      return {
        state: "conflict",
        ahead: 0,
        behind: 0,
        hasRemote: true,
        hasUpstream: true,
        conflictedFiles: conflicted,
      };
    }

    // Check for remotes
    const remotes = await this.remotes(projectPath);
    const hasRemote = remotes.length > 0;

    // Check for upstream
    const hasUpstream = await this.hasUpstream(projectPath);

    // Get ahead/behind counts
    const status = await git.status();

    return {
      state: "idle",
      ahead: status.ahead,
      behind: status.behind,
      hasRemote,
      hasUpstream,
      lastSyncTime: Date.now(),
    };
  }

  /**
   * Perform a sync operation: fetch, rebase if clean, push
   * Returns the updated sync status
   */
  static async sync(projectPath: string): Promise<GitSyncStatus> {
    const git = this.getGit(projectPath);

    // Get current state
    const status = await this.status(projectPath);
    if (!status.isRepo) {
      return {
        state: "idle",
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
      };
    }

    const hasUpstream = await this.hasUpstream(projectPath);
    const remotes = await this.remotes(projectPath);
    const hasRemote = remotes.length > 0;

    if (!hasRemote) {
      return {
        state: "idle",
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
      };
    }

    try {
      // Fetch from remote
      await this.fetch(projectPath);

      // Get updated status after fetch
      const gitStatus = await git.status();

      // If behind and working copy is clean, rebase
      if (gitStatus.behind > 0 && status.files.length === 0) {
        const currentBranch = gitStatus.current || "HEAD";
        const rebaseResult = await this.rebase(projectPath, `origin/${currentBranch}`);

        if (!rebaseResult.success) {
          return {
            state: "conflict",
            ahead: gitStatus.ahead,
            behind: gitStatus.behind,
            hasRemote,
            hasUpstream,
            conflictedFiles: rebaseResult.conflictedFiles,
          };
        }
      }

      // Get status after rebase
      const afterRebase = await git.status();

      // Push if we have commits ahead
      if (afterRebase.ahead > 0 && hasUpstream) {
        try {
          await this.push(projectPath);
        } catch (pushErr) {
          // Push failed - might need to set upstream or auth issue
          return {
            state: "error",
            ahead: afterRebase.ahead,
            behind: afterRebase.behind,
            hasRemote,
            hasUpstream,
            error: pushErr instanceof Error ? pushErr.message : "Push failed",
            lastSyncTime: Date.now(),
          };
        }
      }

      // Get final status
      const finalStatus = await git.status();

      return {
        state: "idle",
        ahead: finalStatus.ahead,
        behind: finalStatus.behind,
        hasRemote,
        hasUpstream,
        lastSyncTime: Date.now(),
      };
    } catch (err) {
      return {
        state: "error",
        ahead: 0,
        behind: 0,
        hasRemote,
        hasUpstream,
        error: err instanceof Error ? err.message : "Sync failed",
        lastSyncTime: Date.now(),
      };
    }
  }
}
