import { z } from "zod";
import { defineAction } from "../registry";
import { apiClient } from "@/lib/api/client";
import type { CommitResult } from "@/lib/api/types";

/**
 * Action: Create a git commit
 *
 * Creates a commit with all staged and unstaged changes.
 * On success, opens the commit view page.
 */
export const createCommitAction = defineAction({
  id: "git.createCommit",
  label: "Create Commit",
  description: "Create a git commit with all changes",

  params: z.object({
    projectId: z.string().describe("The project ID"),
    message: z.string().min(1).describe("The commit message"),
  }),

  execute: async (params, _ctx) => {
    try {
      const result = await apiClient<CommitResult>(
        `/api/projects/${params.projectId}/git/commit`,
        {
          method: "POST",
          body: JSON.stringify({ message: params.message }),
        }
      );

      return {
        type: "page",
        pageId: "git.commit-view",
        params: {
          projectId: params.projectId,
          hash: result.hash,
        },
      };
    } catch (error) {
      return {
        type: "error",
        message: error instanceof Error ? error.message : "Failed to create commit",
      };
    }
  },
});

/**
 * Action: View a commit
 *
 * Opens the commit view page for a specific commit hash.
 */
export const viewCommitAction = defineAction({
  id: "git.viewCommit",
  label: "View Commit",
  description: "Open the commit details page",

  params: z.object({
    projectId: z.string().describe("The project ID"),
    hash: z.string().describe("The commit hash"),
  }),

  execute: async (params, _ctx) => {
    return {
      type: "page",
      pageId: "git.commit-view",
      params: {
        projectId: params.projectId,
        hash: params.hash,
      },
    };
  },
});
