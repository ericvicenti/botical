import { z } from "zod";
import { defineAction } from "../registry";
import { apiClient } from "@/lib/api/client";
import type { CommitResult } from "@/lib/api/types";

/**
 * Action: Create a git commit
 *
 * Creates a commit with all changes (staged and unstaged).
 * On success, navigates to the commit view page.
 */
export const createCommitAction = defineAction({
  id: "git.create-commit",
  label: "Create Commit",
  description: "Create a git commit with all changes",

  params: z.object({
    projectId: z.string().describe("The project ID"),
    message: z.string().min(1).describe("The commit message"),
  }),

  execute: async (params) => {
    try {
      const result = await apiClient<CommitResult>(
        `/api/projects/${params.projectId}/git/commit`,
        {
          method: "POST",
          body: JSON.stringify({ message: params.message }),
        }
      );

      return {
        type: "navigate",
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
