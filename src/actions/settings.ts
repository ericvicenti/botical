/**
 * Settings Actions
 *
 * Actions for application settings like theme, sidebar, etc.
 * These are UI-only actions that return ActionUIResult.
 */

import { z } from "zod";
import { defineAction, ui } from "./types.ts";

/**
 * settings.setTheme - Set the application theme
 */
export const setTheme = defineAction({
  id: "settings.setTheme",
  label: "Set Theme",
  description: "Set the application theme (dark, light, or system)",
  category: "other",
  icon: "palette",

  params: z.object({
    theme: z.enum(["dark", "light", "system"]).describe("Theme preference"),
  }),

  execute: async ({ theme }) => {
    return ui("setTheme", theme, `Theme set to ${theme}`);
  },
});

/**
 * settings.toggleSidebar - Toggle the sidebar
 */
export const toggleSidebar = defineAction({
  id: "settings.toggleSidebar",
  label: "Toggle Sidebar",
  description: "Show or hide the sidebar",
  category: "other",
  icon: "panel-left",

  params: z.object({}),

  execute: async () => {
    return ui("toggleSidebar", null, "Sidebar toggled");
  },
});

/**
 * settings.setSidebarPanel - Set the active sidebar panel
 */
export const setSidebarPanel = defineAction({
  id: "settings.setSidebarPanel",
  label: "Set Sidebar Panel",
  description: "Switch to a specific sidebar panel",
  category: "other",
  icon: "layout",

  params: z.object({
    panel: z.enum(["tasks", "files", "git", "run", "services", "settings"]).describe("Panel to show"),
  }),

  execute: async ({ panel }) => {
    return ui("setSidebarPanel", panel, `Switched to ${panel} panel`);
  },
});

/**
 * All settings actions
 */
export const settingsActions = [
  setTheme,
  toggleSidebar,
  setSidebarPanel,
];
