import type { Command } from "../types";

export const viewCommands: Command[] = [
  {
    id: "view.toggleSidebar",
    label: "Toggle Sidebar",
    description: "Show or hide the sidebar",
    category: "view",
    shortcut: { key: "b", mod: true },
    execute: (ctx) => {
      ctx.ui.toggleSidebar();
    },
  },
  {
    id: "view.toggleBottomPanel",
    label: "Toggle Bottom Panel",
    description: "Show or hide the bottom panel",
    category: "view",
    shortcut: { key: "j", mod: true },
    execute: (ctx) => {
      ctx.ui.toggleBottomPanel();
    },
  },
  {
    id: "view.showFilesPanel",
    label: "Show Files Panel",
    description: "Switch to the Files panel in the sidebar",
    category: "view",
    shortcut: { key: "1", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("files");
    },
  },
  {
    id: "view.showGitPanel",
    label: "Show Git Panel",
    description: "Switch to the Git panel in the sidebar",
    category: "view",
    shortcut: { key: "2", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("git");
    },
  },
  {
    id: "view.showRunPanel",
    label: "Show Run Panel",
    description: "Switch to the Run panel in the sidebar",
    category: "view",
    shortcut: { key: "3", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("run");
    },
  },
  {
    id: "view.setThemeDark",
    label: "Set Dark Theme",
    description: "Switch to dark theme",
    category: "view",
    execute: (ctx) => {
      ctx.ui.setTheme("dark");
    },
  },
  {
    id: "view.setThemeLight",
    label: "Set Light Theme",
    description: "Switch to light theme",
    category: "view",
    execute: (ctx) => {
      ctx.ui.setTheme("light");
    },
  },
];
