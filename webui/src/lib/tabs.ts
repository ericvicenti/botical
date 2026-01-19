import type { Tab, TabData, TabType } from "@/types/tabs";

/**
 * Generate a unique ID for a tab based on its data.
 * This ID is used as the key for the tab in the tabs list.
 */
export function generateTabId(data: TabData): string {
  switch (data.type) {
    case "projects":
      return "projects";
    case "project":
      return `project:${data.projectId}`;
    case "mission":
      return `mission:${data.missionId}`;
    case "file":
      return `file:${data.projectId}:${data.path}`;
    case "process":
      return `process:${data.processId}`;
    case "diff":
      return `diff:${data.projectId}:${data.path}:${data.base || "working"}`;
    case "settings":
      return "settings";
    case "create-project":
      return "create-project";
    case "task":
      return `task:${data.sessionId}`;
  }
}

/**
 * Generate a display label for a tab based on its data.
 */
export function generateTabLabel(data: TabData): string {
  switch (data.type) {
    case "projects":
      return "Projects";
    case "project":
      return data.projectName;
    case "mission":
      return data.missionTitle;
    case "file":
      return data.path.split("/").pop() || "File";
    case "process":
      return data.label || "Process";
    case "diff":
      return `Diff: ${data.path.split("/").pop()}`;
    case "settings":
      return "Settings";
    case "create-project":
      return "New Project";
    case "task":
      return data.title || "Task";
  }
}

/**
 * Get the router path and params for a tab.
 */
export function getTabRoute(tab: Tab): { to: string; params?: Record<string, string> } {
  switch (tab.data.type) {
    case "projects":
      return { to: "/" };
    case "project":
      return { to: "/projects/$projectId", params: { projectId: tab.data.projectId } };
    case "mission":
      return { to: "/projects/$projectId", params: { projectId: tab.data.projectId } };
    case "file":
      return { to: `/files/${tab.data.projectId}/${tab.data.path}` };
    case "process":
      return { to: "/processes/$processId", params: { processId: tab.data.processId } };
    case "task":
      return { to: "/tasks/$sessionId", params: { sessionId: tab.data.sessionId } };
    case "settings":
      return { to: "/settings" };
    case "create-project":
      return { to: "/create-project" };
    default:
      return { to: "/" };
  }
}

/**
 * Parse a URL pathname into tab data. Used for creating preview tabs
 * when navigating to a URL that doesn't have an open tab.
 */
export function parseUrlToTabData(pathname: string): { data: TabData; label: string; type: TabType } | null {
  // /projects/:projectId
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    return {
      type: "project",
      data: { type: "project", projectId: projectMatch[1], projectName: "Project" },
      label: "Project",
    };
  }

  // /tasks/:sessionId
  const taskMatch = pathname.match(/^\/tasks\/([^/]+)$/);
  if (taskMatch) {
    return {
      type: "task",
      data: { type: "task", sessionId: taskMatch[1], projectId: "", title: "Task" },
      label: "Task",
    };
  }

  // /processes/:processId
  const processMatch = pathname.match(/^\/processes\/([^/]+)$/);
  if (processMatch) {
    return {
      type: "process",
      data: { type: "process", processId: processMatch[1], projectId: "" },
      label: "Process",
    };
  }

  // /files/:projectId/:path
  const fileMatch = pathname.match(/^\/files\/([^/]+)\/(.+)$/);
  if (fileMatch) {
    const path = fileMatch[2];
    return {
      type: "file",
      data: { type: "file", projectId: fileMatch[1], path },
      label: path.split("/").pop() || "File",
    };
  }

  // /settings
  if (pathname === "/settings") {
    return {
      type: "settings",
      data: { type: "settings" },
      label: "Settings",
    };
  }

  // /create-project
  if (pathname === "/create-project") {
    return {
      type: "create-project",
      data: { type: "create-project" },
      label: "New Project",
    };
  }

  // / (home/projects list)
  if (pathname === "/") {
    return {
      type: "projects",
      data: { type: "projects" },
      label: "Projects",
    };
  }

  return null;
}

/**
 * Truncate a command string for display purposes.
 */
export function truncateCommand(command: string, maxLength = 40): string {
  return command.length > maxLength ? command.slice(0, maxLength) + "..." : command;
}
