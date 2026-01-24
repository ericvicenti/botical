import { z } from "zod";
import { definePage } from "../registry";
import WorkflowEditorPage from "./WorkflowEditorPage";
import WorkflowExecutionPage from "./WorkflowExecutionPage";

/**
 * Page: Workflow Editor
 *
 * Shows the workflow editor for creating and editing workflows.
 */
export const workflowEditorPage = definePage({
  id: "workflow.editor",
  icon: "git-branch",
  category: "workflow",
  description: "Edit workflow definition",

  getLabel: (params) => params.label || "Workflow",
  getTitle: (params) => `${params.label || "Workflow"} - Editor`,

  params: z.object({
    workflowId: z.string(),
    label: z.string().optional(),
  }),

  route: "/workflows/$workflowId",

  parseParams: (routeParams) => ({
    workflowId: routeParams.workflowId,
  }),

  getRouteParams: (params) => ({
    workflowId: params.workflowId,
  }),

  component: WorkflowEditorPage,
});

/**
 * Page: Workflow Execution
 *
 * Shows the execution details for a workflow run.
 */
export const workflowExecutionPage = definePage({
  id: "workflow.execution",
  icon: "play-circle",
  category: "workflow",
  description: "View workflow execution details",

  getLabel: (params) => params.label || "Workflow Run",
  getTitle: (params) => `${params.label || "Workflow Run"} - Execution`,

  params: z.object({
    executionId: z.string(),
    label: z.string().optional(),
  }),

  route: "/workflow-runs/$executionId",

  parseParams: (routeParams) => ({
    executionId: routeParams.executionId,
  }),

  getRouteParams: (params) => ({
    executionId: params.executionId,
  }),

  component: WorkflowExecutionPage,
});
