import { z } from "zod";
import { definePage } from "../registry";
import ProjectsListPage from "./ProjectsListPage";

/**
 * Page: Projects List (Home)
 *
 * Shows all projects with ability to open or create new ones.
 */
export const projectsListPage = definePage({
  id: "home.projects-list",
  icon: "home",
  category: "home",
  description: "View all projects",

  getLabel: () => "Projects",
  getTitle: () => "Projects",

  params: z.object({}),

  route: "/",

  parseParams: () => ({}),

  getRouteParams: () => ({}),

  component: ProjectsListPage,
});
