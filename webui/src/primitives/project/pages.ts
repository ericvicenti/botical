import { z } from "zod";
import { definePage } from "../registry";
import CreateProjectPage from "./CreateProjectPage";
import ProjectOverviewPage from "./ProjectOverviewPage";
import ProjectSettingsPage from "./ProjectSettingsPage";

/**
 * Page: Create Project
 *
 * Form to create a new project (local or clone from URL).
 */
export const createProjectPage = definePage({
  id: "project.create",
  icon: "folder-plus",
  category: "project",
  description: "Create a new project",

  getLabel: () => "New Project",
  getTitle: () => "Create Project",

  params: z.object({}),

  route: "/create-project",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: CreateProjectPage,
});

/**
 * Page: Project Overview
 *
 * Shows project dashboard with files, tasks, processes, and missions.
 */
export const projectOverviewPage = definePage({
  id: "project.overview",
  icon: "folder",
  category: "project",
  description: "View project overview",

  getLabel: (params) => params.projectName || "Project",
  getTitle: (params) => params.projectName || "Project",

  params: z.object({
    projectId: z.string(),
    projectName: z.string().optional(),
  }),

  route: "/projects/$projectId",

  parseParams: (routeParams) => ({
    projectId: routeParams.projectId,
  }),

  getRouteParams: (params) => ({
    projectId: params.projectId,
  }),

  component: ProjectOverviewPage,
});

/**
 * Page: Project Settings
 *
 * Manage project configuration, path, and danger zone actions.
 */
export const projectSettingsPage = definePage({
  id: "project.settings",
  icon: "settings",
  category: "project",
  description: "Manage project settings",

  getLabel: (params) =>
    params.projectName ? `${params.projectName} Settings` : "Project Settings",
  getTitle: (params) =>
    params.projectName ? `${params.projectName} Settings` : "Project Settings",

  params: z.object({
    projectId: z.string(),
    projectName: z.string().optional(),
  }),

  route: "/projects/$projectId/settings",

  parseParams: (routeParams) => ({
    projectId: routeParams.projectId,
  }),

  getRouteParams: (params) => ({
    projectId: params.projectId,
  }),

  component: ProjectSettingsPage,
});
