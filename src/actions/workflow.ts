/**
 * Workflow Actions
 *
 * Actions for managing and executing workflows.
 */

import { z } from "zod";
import { defineAction, navigate, success, error } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import { WorkflowService } from "@/services/workflows.ts";

/**
 * workflow.new - Create a new workflow and open editor
 */
export const workflowNew = defineAction({
  id: "workflow.new",
  label: "New Workflow",
  description: "Create a new workflow",
  category: "other",
  icon: "git-branch-plus",

  params: z.object({
    projectId: z.string().describe("Project ID"),
  }),

  execute: async ({ projectId }) => {
    const db = DatabaseManager.getProjectDb(projectId);

    // Generate a unique name
    let baseName = "new-workflow";
    let name = baseName;
    let counter = 1;

    while (WorkflowService.getByName(db, projectId, name)) {
      name = `${baseName}-${counter}`;
      counter++;
    }

    // Create the workflow
    const workflow = WorkflowService.create(db, projectId, {
      name,
      label: "New Workflow",
      description: "",
      category: "other",
      inputSchema: { fields: [] },
      steps: [],
    });

    // Navigate to the editor
    return navigate("workflow", { workflowId: workflow.id, projectId });
  },
});

/**
 * workflow.open - Open an existing workflow in editor
 */
export const workflowOpen = defineAction({
  id: "workflow.open",
  label: "Open Workflow",
  description: "Open a workflow in the editor",
  category: "other",
  icon: "git-branch",

  params: z.object({
    workflowId: z.string().describe("Workflow ID"),
    projectId: z.string().describe("Project ID"),
  }),

  execute: async ({ workflowId, projectId }) => {
    return navigate("workflow", { workflowId, projectId });
  },
});

/**
 * workflow.delete - Delete a workflow
 */
export const workflowDelete = defineAction({
  id: "workflow.delete",
  label: "Delete Workflow",
  description: "Delete a workflow",
  category: "other",
  icon: "trash",

  params: z.object({
    workflowId: z.string().describe("Workflow ID"),
    projectId: z.string().describe("Project ID"),
  }),

  execute: async ({ workflowId, projectId }) => {
    const db = DatabaseManager.getProjectDb(projectId);

    try {
      const workflow = WorkflowService.getById(db, workflowId);
      if (!workflow) {
        return error("Workflow not found");
      }

      WorkflowService.delete(db, workflowId);
      return success("Workflow Deleted", `Deleted workflow "${workflow.label}"`);
    } catch (err) {
      return error(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  },
});

/**
 * All workflow actions
 */
export const workflowActions = [
  workflowNew,
  workflowOpen,
  workflowDelete,
];
