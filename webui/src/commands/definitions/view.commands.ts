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
    id: "view.showTasksPanel",
    label: "Show Tasks Panel",
    description: "Switch to the Tasks panel in the sidebar",
    category: "view",
    shortcut: { key: "1", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("tasks");
    },
  },
  {
    id: "view.showFilesPanel",
    label: "Show Files Panel",
    description: "Switch to the Files panel in the sidebar",
    category: "view",
    shortcut: { key: "2", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("files");
    },
  },
  {
    id: "view.showGitPanel",
    label: "Show Git Panel",
    description: "Switch to the Git panel in the sidebar",
    category: "view",
    shortcut: { key: "3", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("git");
    },
  },
  {
    id: "view.showRunPanel",
    label: "Show Run Panel",
    description: "Switch to the Run panel in the sidebar",
    category: "view",
    shortcut: { key: "4", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("run");
    },
  },
  {
    id: "view.showSettingsPanel",
    label: "Show Settings Panel",
    description: "Switch to the Settings panel in the sidebar",
    category: "view",
    shortcut: { key: "0", alt: true },
    execute: (ctx) => {
      ctx.ui.setSidebarPanel("settings");
    },
  },
  {
    id: "view.setThemeSystem",
    label: "Appearance: System Theme",
    description: "Match your operating system theme",
    category: "view",
    execute: (ctx) => {
      ctx.ui.setTheme("system");
    },
  },
  {
    id: "view.setThemeDark",
    label: "Appearance: Dark Theme",
    description: "Switch to dark theme",
    category: "view",
    execute: (ctx) => {
      ctx.ui.setTheme("dark");
    },
  },
  {
    id: "view.setThemeLight",
    label: "Appearance: Light Theme",
    description: "Switch to light theme",
    category: "view",
    execute: (ctx) => {
      ctx.ui.setTheme("light");
    },
  },
];
