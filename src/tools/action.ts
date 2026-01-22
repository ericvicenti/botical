/**
 * Git Action Tools
 *
 * Individual tools for git operations that agents can call directly.
 * These are high-level actions that go beyond the basic bash tool.
 */

import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "./types.ts";

/**
 * Git Commit Tool - Create a git commit with all changes
 */
export const gitCommitTool = defineTool("git_commit", {
  description: `Create a git commit with all staged and unstaged changes. Use this instead of running git commands manually when you want to commit changes.`,

  parameters: z.object({
    message: z.string().min(1).describe("The commit message describing the changes"),
  }),

  execute: async (args, context) => {
    const { message } = args;
    const { projectPath } = context;

    try {
      // Stage all changes and commit
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
          return {
            title: "No Changes",
            output: "No changes to commit. Working tree is clean.",
            success: true,
          };
        }

        return {
          title: "Commit Failed",
          output: `Error: ${stderr || stdout}`,
          success: false,
        };
      }

      const hashMatch = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
      const hash = hashMatch ? hashMatch[1] : "unknown";

      return {
        title: "Commit Created",
        output: `Successfully created commit ${hash}\n\nMessage: ${message}\n\n${stdout}`,
        success: true,
        metadata: { hash, message },
      };
    } catch (error) {
      return {
        title: "Commit Failed",
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
      };
    }
  },
});

/**
 * Git Status Tool - Get the current git status
 */
export const gitStatusTool = defineTool("git_status", {
  description: `Get the current git repository status including branch, staged changes, and unstaged changes.`,

  parameters: z.object({}),

  execute: async (_args, context) => {
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
        return {
          title: "Git Status Failed",
          output: `Error: ${stderr || stdout}`,
          success: false,
        };
      }

      return {
        title: "Git Status",
        output: stdout,
        success: true,
      };
    } catch (error) {
      return {
        title: "Git Status Failed",
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
      };
    }
  },
});

/**
 * Git Diff Tool - Show uncommitted changes
 */
export const gitDiffTool = defineTool("git_diff", {
  description: `Show the diff of uncommitted changes. Optionally specify a file path to see changes for a specific file.`,

  parameters: z.object({
    path: z.string().optional().describe("Optional file path to show diff for"),
    staged: z.boolean().optional().describe("Show staged changes only (default: false)"),
  }),

  execute: async (args, context) => {
    const { path, staged } = args;
    const { projectPath } = context;

    try {
      const gitArgs = ["diff"];
      if (staged) gitArgs.push("--staged");
      if (path) gitArgs.push(path);

      const proc = Bun.spawn(["git", ...gitArgs], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          title: "Git Diff Failed",
          output: `Error: ${stderr || stdout}`,
          success: false,
        };
      }

      if (!stdout.trim()) {
        return {
          title: "Git Diff",
          output: "No changes to display.",
          success: true,
        };
      }

      return {
        title: "Git Diff",
        output: stdout,
        success: true,
      };
    } catch (error) {
      return {
        title: "Git Diff Failed",
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
      };
    }
  },
});

/**
 * Git Log Tool - Show recent commit history
 */
export const gitLogTool = defineTool("git_log", {
  description: `Show recent commit history. Returns the last N commits with hash, author, date, and message.`,

  parameters: z.object({
    count: z.number().int().min(1).max(50).default(10).describe("Number of commits to show (default: 10)"),
    oneline: z.boolean().default(true).describe("Show compact one-line format (default: true)"),
  }),

  execute: async (args, context) => {
    const { count, oneline } = args;
    const { projectPath } = context;

    try {
      const gitArgs = ["log", `-${count}`];
      if (oneline) gitArgs.push("--oneline");

      const proc = Bun.spawn(["git", ...gitArgs], {
        cwd: projectPath,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          title: "Git Log Failed",
          output: `Error: ${stderr || stdout}`,
          success: false,
        };
      }

      return {
        title: "Git Log",
        output: stdout || "No commits found.",
        success: true,
      };
    } catch (error) {
      return {
        title: "Git Log Failed",
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
      };
    }
  },
});

/**
 * All git action tools
 */
export const gitActionTools: AnyToolDefinition[] = [
  gitCommitTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
];
