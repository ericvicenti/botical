/**
 * Task Commands
 *
 * Commands for task management via the command palette.
 */

import type { Command } from "../types";

export const taskCommands: Command[] = [
  {
    id: "task:new",
    label: "New Task",
    description: "Create a new task with templates",
    category: "action",
    shortcut: { key: "n", mod: true, shift: true },
    when: (ctx) => !!ctx.selectedProjectId,
    execute: (ctx) => {
      ctx.ui.openNewTaskModal();
    },
  },
];
