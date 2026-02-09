import { z } from "zod";
import { definePage } from "../registry";
import ApiKeysPage from "./ApiKeysPage";
import ModelsPage from "./ModelsPage";
import ShortcutsPage from "./ShortcutsPage";
import ThemePage from "./ThemePage";
import AboutPage from "./AboutPage";

/**
 * Page: Model Provider Settings
 *
 * Configure AI model providers.
 */
export const apiKeysPage = definePage({
  id: "settings.api-keys",
  icon: "key",
  category: "settings",
  description: "Configure AI model providers",

  getLabel: () => "Model Provider",
  getTitle: () => "Model Provider - Settings",

  params: z.object({}),

  route: "/settings/api-keys",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: ApiKeysPage,
});

/**
 * Page: Model Provider Settings (new URL)
 */
export const modelsPage = definePage({
  id: "settings.models",
  icon: "key",
  category: "settings",
  description: "Configure AI model providers",

  getLabel: () => "Model Providers",
  getTitle: () => "Model Providers - Settings",

  params: z.object({}),

  route: "/settings/models",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: ModelsPage,
});

/**
 * Page: Keyboard Shortcuts
 *
 * Reference for all keyboard shortcuts.
 */
export const shortcutsPage = definePage({
  id: "settings.shortcuts",
  icon: "keyboard",
  category: "settings",
  description: "View all keyboard shortcuts",

  getLabel: () => "Shortcuts",
  getTitle: () => "Keyboard Shortcuts - Settings",

  params: z.object({}),

  route: "/settings/shortcuts",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: ShortcutsPage,
});

/**
 * Page: Theme Settings
 *
 * Choose color theme for the interface.
 */
export const themePage = definePage({
  id: "settings.theme",
  icon: "palette",
  category: "settings",
  description: "Choose interface color theme",

  getLabel: () => "Theme",
  getTitle: () => "Theme - Settings",

  params: z.object({}),

  route: "/settings/theme",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: ThemePage,
});

/**
 * Page: About
 *
 * Information about the application.
 */
export const aboutPage = definePage({
  id: "settings.about",
  icon: "info",
  category: "settings",
  description: "About the application",

  getLabel: () => "About",
  getTitle: () => "About - Botical",

  params: z.object({}),

  route: "/settings/about",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: AboutPage,
});
