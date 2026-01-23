/**
 * View Actions
 *
 * Actions for navigation and view management.
 */

import { z } from "zod";
import { defineAction, navigate, ui } from "./types.ts";

/**
 * view.openFile - Open a file in the editor
 */
export const openFile = defineAction({
  id: "view.openFile",
  label: "Open File",
  description: "Open a file in the editor",
  category: "navigation",
  icon: "file",

  params: z.object({
    path: z.string().describe("File path to open"),
  }),

  execute: async ({ path }) => {
    return navigate("file", { path });
  },
});

/**
 * view.openProject - Open a project
 */
export const openProject = defineAction({
  id: "view.openProject",
  label: "Open Project",
  description: "Open a project",
  category: "navigation",
  icon: "folder",

  params: z.object({
    projectId: z.string().describe("Project ID to open"),
  }),

  execute: async ({ projectId }) => {
    return navigate("project", { projectId });
  },
});

/**
 * view.openTask - Open a task/session
 */
export const openTask = defineAction({
  id: "view.openTask",
  label: "Open Task",
  description: "Open a task conversation",
  category: "navigation",
  icon: "message-square",

  params: z.object({
    sessionId: z.string().describe("Session ID to open"),
  }),

  execute: async ({ sessionId }) => {
    return navigate("task", { sessionId });
  },
});

/**
 * view.openSettings - Open settings
 */
export const openSettings = defineAction({
  id: "view.openSettings",
  label: "Open Settings",
  description: "Open the settings page",
  category: "navigation",
  icon: "settings",

  params: z.object({}),

  execute: async () => {
    return navigate("settings", {});
  },
});

/**
 * view.closeTab - Close a tab
 */
export const closeTab = defineAction({
  id: "view.closeTab",
  label: "Close Tab",
  description: "Close the current or specified tab",
  category: "navigation",
  icon: "x",

  params: z.object({
    tabId: z.string().optional().describe("Tab ID to close (defaults to active tab)"),
  }),

  execute: async ({ tabId }) => {
    return ui("closeTab", tabId || "active", "Tab closed");
  },
});

/**
 * view.closeAllTabs - Close all tabs
 */
export const closeAllTabs = defineAction({
  id: "view.closeAllTabs",
  label: "Close All Tabs",
  description: "Close all open tabs",
  category: "navigation",
  icon: "x-circle",

  params: z.object({}),

  execute: async () => {
    return ui("closeAllTabs", null, "All tabs closed");
  },
});

/**
 * All view actions
 */
export const viewActions = [
  openFile,
  openProject,
  openTask,
  openSettings,
  closeTab,
  closeAllTabs,
];
