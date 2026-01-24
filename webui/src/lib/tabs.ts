import type { Tab, TabData, TabType, SettingsPage } from "@/types/tabs";
import { getPageUrl, matchPageRoute } from "@/primitives/registry";

const SETTINGS_PAGE_LABELS: Record<SettingsPage, string> = {
  "api-keys": "API Keys",
  "theme": "Theme",
  "shortcuts": "Keyboard Shortcuts",
  "about": "About",
};

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
    case "project-settings":
      return `project-settings:${data.projectId}`;
    case "mission":
      return `mission:${data.missionId}`;
    case "file":
      return `file:${data.projectId}:${data.path}`;
    case "folder":
      return `folder:${data.projectId}:${data.path}`;
    case "process":
      return `process:${data.processId}`;
    case "diff":
      return `diff:${data.projectId}:${data.path}:${data.base || "working"}`;
    case "settings":
      return `settings:${data.page}`;
    case "create-project":
      return "create-project";
    case "task":
      return `task:${data.sessionId}`;
    case "commit":
      return `commit:${data.projectId}:${data.hash}`;
    case "review-commit":
      return `review-commit:${data.projectId}`;
    case "page": {
      // Generate stable ID from pageId, params, and search
      const searchPart = data.search ? `:${JSON.stringify(data.search)}` : "";
      return `page:${data.pageId}:${JSON.stringify(data.params)}${searchPart}`;
    }
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
    case "project-settings":
      return `${data.projectName} Settings`;
    case "mission":
      return data.missionTitle;
    case "file":
      return data.path.split("/").pop() || "File";
    case "folder":
      return data.path.split("/").pop() || "Folder";
    case "process":
      return data.label || "Process";
    case "diff":
      return `Diff: ${data.path.split("/").pop()}`;
    case "settings":
      return SETTINGS_PAGE_LABELS[data.page] || "Settings";
    case "create-project":
      return "New Project";
    case "task":
      return data.title || "Task";
    case "commit":
      return data.hash.substring(0, 7);
    case "review-commit":
      return "Review Commit";
    case "page":
      return data.label;
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
    case "project-settings":
      return { to: "/projects/$projectId/settings", params: { projectId: tab.data.projectId } };
    case "mission":
      return { to: "/projects/$projectId", params: { projectId: tab.data.projectId } };
    case "file":
      return { to: `/files/${tab.data.projectId}/${tab.data.path}` };
    case "folder":
      return { to: `/folders/${tab.data.projectId}/${tab.data.path}` };
    case "process":
      return { to: "/processes/$processId", params: { processId: tab.data.processId } };
    case "task":
      return { to: "/tasks/$sessionId", params: { sessionId: tab.data.sessionId } };
    case "settings":
      return { to: `/settings/${tab.data.page}` };
    case "create-project":
      return { to: "/create-project" };
    case "commit":
      return { to: "/projects/$projectId/commits/$hash", params: { projectId: tab.data.projectId, hash: tab.data.hash } };
    case "review-commit":
      return { to: "/projects/$projectId/commit", params: { projectId: tab.data.projectId } };
    case "page": {
      // Get URL from page primitive, including search params
      try {
        const url = getPageUrl(tab.data.pageId, tab.data.params, tab.data.search);
        return { to: url };
      } catch {
        return { to: "/" };
      }
    }
    default:
      return { to: "/" };
  }
}

/**
 * Parse a URL pathname into tab data. Used for creating preview tabs
 * when navigating to a URL that doesn't have an open tab.
 */
export function parseUrlToTabData(
  pathname: string,
  search?: string
): { data: TabData; label: string; type: TabType } | null {
  // First, try to match against the page registry
  const searchParams = search ? new URLSearchParams(search) : undefined;
  const pageMatch = matchPageRoute(pathname, searchParams);

  if (pageMatch && pageMatch.parsedParams) {
    const { page, parsedParams, parsedSearch } = pageMatch;
    const label = page.getLabel(parsedParams, parsedSearch ?? undefined);
    return {
      type: "page",
      data: {
        type: "page",
        pageId: page.id,
        params: parsedParams,
        search: parsedSearch ?? undefined,
        label,
        icon: page.icon,
      },
      label,
    };
  }

  // Fall back to legacy route parsing for routes not yet migrated to page primitives

  // /projects/:projectId/settings
  const projectSettingsMatch = pathname.match(/^\/projects\/([^/]+)\/settings$/);
  if (projectSettingsMatch) {
    return {
      type: "project-settings",
      data: { type: "project-settings", projectId: projectSettingsMatch[1], projectName: "Project" },
      label: "Settings",
    };
  }

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

  // /folders/:projectId/:path
  const folderMatch = pathname.match(/^\/folders\/([^/]+)\/(.*)$/);
  if (folderMatch) {
    const path = folderMatch[2] || "";
    return {
      type: "folder",
      data: { type: "folder", projectId: folderMatch[1], path },
      label: path.split("/").pop() || "Folder",
    };
  }

  // /settings/:page
  const settingsMatch = pathname.match(/^\/settings\/([^/]+)$/);
  if (settingsMatch) {
    const page = settingsMatch[1] as SettingsPage;
    if (["api-keys", "theme", "shortcuts", "about"].includes(page)) {
      return {
        type: "settings",
        data: { type: "settings", page },
        label: SETTINGS_PAGE_LABELS[page] || "Settings",
      };
    }
  }

  // /settings (redirect to api-keys)
  if (pathname === "/settings") {
    return {
      type: "settings",
      data: { type: "settings", page: "api-keys" },
      label: "API Keys",
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
