/**
 * Project Actions
 *
 * Actions for managing projects.
 */

import { z } from "zod";
import { defineAction, success, error, navigate } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { Config } from "@/config/index.ts";

/**
 * project.delete - Archive a project (soft delete)
 */
export const projectDelete = defineAction({
  id: "project.delete",
  label: "Delete Project",
  description: "Archive a project. The project data remains on disk and can be manually deleted if needed.",
  category: "project",
  icon: "trash",

  params: z.object({
    projectId: z.string().describe("Project ID to delete"),
  }),

  execute: async ({ projectId }) => {
    const rootDb = DatabaseManager.getRootDb();

    try {
      const project = ProjectService.getById(rootDb, projectId);
      if (!project) {
        return error("Project not found");
      }

      ProjectService.delete(rootDb, projectId);

      // Get the archive location for user info
      const projectDir = Config.getProjectDir(projectId);

      return success(
        "Project Archived",
        `Project "${project.name}" has been archived.\n\nThe project data is still stored at:\n${projectDir}\n\nYou can manually delete this directory if you want to permanently remove the project data.`
      );
    } catch (err) {
      return error(err instanceof Error ? err.message : "Failed to delete project");
    }
  },
});

/**
 * project.open - Open a project
 */
export const projectOpen = defineAction({
  id: "project.open",
  label: "Open Project",
  description: "Open a project in the workspace",
  category: "project",
  icon: "folder-open",

  params: z.object({
    projectId: z.string().describe("Project ID to open"),
  }),

  execute: async ({ projectId }) => {
    return navigate("project", { projectId });
  },
});

/**
 * All project actions
 */
export const projectActions = [
  projectDelete,
  projectOpen,
];
