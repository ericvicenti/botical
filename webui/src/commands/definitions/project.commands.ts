import type { Command } from "../types";

export const projectCommands: Command[] = [
  {
    id: "project.create",
    label: "Create Project",
    description: "Create a new project",
    category: "project",
    shortcut: { key: "n", mod: true, shift: true },
    execute: (ctx) => {
      ctx.tabActions.openTab({ type: "create-project" });
      ctx.navigate({ to: "/create-project" });
    },
  },
  {
    id: "project.openSettings",
    label: "Open Settings",
    description: "Open application settings",
    category: "project",
    shortcut: { key: ",", mod: true },
    execute: (ctx) => {
      // Navigate to settings - preview tab will show, user can pin it
      ctx.navigate({ to: "/settings/api-keys" });
    },
  },
];
