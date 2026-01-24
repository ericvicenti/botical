import { z } from "zod";
import { definePage } from "../registry";
import ProcessTerminalPage from "./ProcessTerminalPage";

/**
 * Page: Process Terminal
 *
 * Shows a process terminal with output and controls.
 */
export const processTerminalPage = definePage({
  id: "process.terminal",
  icon: "terminal",
  category: "process",
  description: "View process terminal",

  getLabel: (params) => params.label || "Process",
  getTitle: (params) => params.label || "Process",

  params: z.object({
    processId: z.string(),
    projectId: z.string().optional(),
    label: z.string().optional(),
  }),

  route: "/processes/$processId",

  parseParams: (routeParams) => ({
    processId: routeParams.processId,
  }),

  getRouteParams: (params) => ({
    processId: params.processId,
  }),

  component: ProcessTerminalPage,
});
