/**
 * Schedule Commands
 *
 * Commands for schedule management via the command palette.
 */

import type { Command } from "../types";

export const scheduleCommands: Command[] = [
  {
    id: "schedule:new",
    label: "New Schedule",
    description: "Create a new scheduled task",
    category: "action",
    shortcut: { key: "s", mod: true, shift: true, alt: true },
    when: (ctx) => !!ctx.selectedProjectId,
    execute: (ctx) => {
      // Switch to schedules panel to show the create form
      // ctx.ui.setSidebarPanel("schedules");
    },
  },
  {
    id: "schedule:list",
    label: "Show Schedules",
    description: "Show the schedules panel in the sidebar",
    category: "view",
    when: (ctx) => !!ctx.selectedProjectId,
    execute: (ctx) => {
      // ctx.ui.setSidebarPanel("schedules");
    },
  },
];
