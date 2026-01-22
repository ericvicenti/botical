/**
 * Action Tool
 *
 * Allows AI agents to execute registered actions (primitives).
 * Actions are high-level operations like creating commits, opening files, etc.
 */

import { z } from "zod";
import { defineTool } from "./types.ts";

/**
 * Schema for available actions
 * This will be dynamically populated based on registered actions
 */
const actionParamsSchema = z.object({
  actionId: z.string().describe("The ID of the action to execute (e.g., 'git.create-commit')"),
  params: z.record(z.unknown()).describe("Parameters to pass to the action"),
});

/**
 * Action tool - executes registered actions
 *
 * Actions are defined in the frontend primitives system and exposed here.
 * The tool validates the action exists and executes it with the provided params.
 */
export const actionTool = defineTool("action", {
  description: `Execute a registered action. Available actions:
- git.create-commit: Create a git commit with a message. Params: { message: string }

Use this tool to perform high-level operations that go beyond file editing and bash commands.`,

  parameters: actionParamsSchema,

  execute: async (args, context) => {
    const { actionId, params } = args;

    // For now, we handle known actions directly
    // In the future, this could be extended to call a registry of actions

    if (actionId === "git.create-commit") {
      // Execute git commit
      const message = params.message as string;
      if (!message) {
        return {
          title: "Action Failed",
          output: "Error: Missing 'message' parameter for git.create-commit action",
          success: false,
        };
      }

      // Use the project path from context to run git commit
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
          // Try staging first if nothing to commit
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

        // Extract commit hash from output
        const hashMatch = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
        const hash = hashMatch ? hashMatch[1] : "unknown";

        return {
          title: "Commit Created",
          output: `Successfully created commit ${hash}\n\nMessage: ${message}\n\n${stdout}`,
          success: true,
          metadata: {
            hash,
            message,
          },
        };
      } catch (error) {
        return {
          title: "Commit Failed",
          output: `Error executing git commit: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
        };
      }
    }

    // Unknown action
    return {
      title: "Unknown Action",
      output: `Error: Action '${actionId}' is not recognized. Available actions: git.create-commit`,
      success: false,
    };
  },
});
