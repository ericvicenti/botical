/**
 * Git Actions
 *
 * Actions for git operations - available to both AI agents and GUI.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

/**
 * git.commit - Create a git commit with all changes
 */
export const gitCommit = defineAction({
  id: "git.commit",
  label: "Create Commit",
  description: "Create a git commit with all staged and unstaged changes",
  category: "git",
  icon: "git-commit",

  params: z.object({
    message: z.string().min(1).describe("The commit message"),
  }),

  execute: async ({ message }, context) => {
    const { projectPath } = context;

    try {
      const proc = Bun.spawn(["git", "commit", "-am", message], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        if (stderr.includes("nothing to commit") || stderr.includes("no changes added")) {
          return success("No Changes", "No changes to commit. Working tree is clean.");
        }
        return error(stderr || stdout);
      }

      const hashMatch = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
      const hash = hashMatch ? hashMatch[1] : "unknown";

      return success(
        "Commit Created",
        `Created commit ${hash}\n\nMessage: ${message}\n\n${stdout}`,
        { hash, message }
      );
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },
});

/**
 * git.status - Get repository status
 */
export const gitStatus = defineAction({
  id: "git.status",
  label: "Git Status",
  description: "Get the current git repository status",
  category: "git",
  icon: "git-branch",

  params: z.object({}),

  execute: async (_params, context) => {
    const { projectPath } = context;

    try {
      const proc = Bun.spawn(["git", "status"], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return error(stderr || stdout);
      }

      return success("Git Status", stdout);
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },
});

/**
 * git.diff - Show uncommitted changes
 */
export const gitDiff = defineAction({
  id: "git.diff",
  label: "Git Diff",
  description: "Show the diff of uncommitted changes",
  category: "git",
  icon: "diff",

  params: z.object({
    path: z.string().optional().describe("File path to show diff for"),
    staged: z.boolean().optional().describe("Show staged changes only"),
  }),

  execute: async ({ path, staged }, context) => {
    const { projectPath } = context;

    try {
      const args = ["diff"];
      if (staged) args.push("--staged");
      if (path) args.push(path);

      const proc = Bun.spawn(["git", ...args], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return error(stderr || stdout);
      }

      if (!stdout.trim()) {
        return success("Git Diff", "No changes to display.");
      }

      return success("Git Diff", stdout);
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },
});

/**
 * git.log - Show commit history
 */
export const gitLog = defineAction({
  id: "git.log",
  label: "Git Log",
  description: "Show recent commit history",
  category: "git",
  icon: "history",

  params: z.object({
    count: z.number().int().min(1).max(50).default(10).describe("Number of commits"),
    oneline: z.boolean().default(true).describe("Compact one-line format"),
  }),

  execute: async ({ count, oneline }, context) => {
    const { projectPath } = context;

    try {
      const args = ["log", `-${count}`];
      if (oneline) args.push("--oneline");

      const proc = Bun.spawn(["git", ...args], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return error(stderr || stdout);
      }

      return success("Git Log", stdout || "No commits found.");
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  },
});

/**
 * All git actions
 */
export const gitActions = [
  gitCommit,
  gitStatus,
  gitDiff,
  gitLog,
];
