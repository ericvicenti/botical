import type { Tab, TabData, TabType, SettingsPage } from "@/types/tabs";
import { getPageUrl, matchPageRoute } from "@/primitives/registry";

const SETTINGS_PAGE_LABELS: Record<SettingsPage, string> = {
  "api-keys": "Model Provider",
  "theme": "Theme",
  "shortcuts": "Keyboard Shortcuts",
  "experiments": "Experiments",
  "about": "About",
};

/**
 * Generate a stable, unique ID for a tab based on its data.
 *
 * IMPORTANT: This function must generate consistent IDs regardless of whether
 * the tab was created from URL parsing or from a direct openTab call.
 *
 * For page-type tabs, we generate IDs like:
 * - "home.projects-list" (no params)
 * - "project.overview:prj_123" (with key param)
 * - "file.view:prj_123:/src/index.ts" (with multiple key params)
 */
export function generateTabId(data: TabData): string {
  switch (data.type) {
    // Legacy types - generate IDs that match their page primitive equivalents
    case "projects":
      return "home.projects-list";
    case "project":
      return `project.overview:${data.projectId}`;
    case "project-settings":
      return `project.settings:${data.projectId}`;
    case "mission":
      return `mission:${data.missionId}`;
    case "file":
      return `file.view:${data.projectId}:${data.path}`;
    case "folder":
      return `folder.view:${data.projectId}:${data.path}`;
    case "process":
      return `process.terminal:${data.processId}`;
    case "diff":
      return `diff:${data.projectId}:${data.path}:${data.base || "working"}`;
    case "settings":
      return `settings.${data.page}`;
    case "create-project":
      return "project.create";
    case "task":
      return `task.chat:${data.sessionId}`;
    case "commit":
      return `git.commit-view:${data.projectId}:${data.hash}`;
    case "review-commit":
      return `git.review-commit:${data.projectId}`;
    case "page":
      return generatePageTabId(data.pageId, data.params);
  }
}

/**
 * Generate a stable tab ID for a page primitive.
 * Format: pageId or pageId:param1:param2:...
 */
function generatePageTabId(pageId: string, params: Record<string, unknown>): string {
  // Build ID based on page category and key params
  switch (pageId) {
    case "home.projects-list":
      return "home.projects-list";
    case "project.create":
      return "project.create";
    case "project.overview":
      return `project.overview:${params.projectId}`;
    case "project.settings":
      return `project.settings:${params.projectId}`;
    case "task.chat":
      return `task.chat:${params.sessionId}`;
    case "process.terminal":
      return `process.terminal:${params.processId}`;
    case "file.view":
      return `file.view:${params.projectId}:${params.path}`;
    case "folder.view":
      return `folder.view:${params.projectId}:${params.path}`;
    case "git.review-commit":
      return `git.review-commit:${params.projectId}`;
    case "git.commit-view":
      return `git.commit-view:${params.projectId}:${params.hash}`;
    case "settings.api-keys":
      return "settings.api-keys";
    case "settings.theme":
      return "settings.theme";
    case "settings.shortcuts":
      return "settings.shortcuts";
    case "settings.about":
      return "settings.about";
    case "workflow.editor":
      return `workflow.editor:${params.workflowId}`;
    case "workflow.execution":
      return `workflow.execution:${params.executionId}`;
    default:
      // Fallback for unknown pages: use pageId + sorted params
      const sortedParams = Object.keys(params)
        .sort()
        .map(k => params[k])
        .filter(v => v !== undefined && v !== "")
        .join(":");
      return sortedParams ? `${pageId}:${sortedParams}` : pageId;
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
 *
 * IMPORTANT: This function ALWAYS returns page-type tab data to ensure
 * consistent tab IDs regardless of how the tab was created.
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

  // Handle splat routes that the page registry can't match directly
  // These return page-type tabs with the appropriate page IDs

  // /files/:projectId/:path (splat route)
  const fileMatch = pathname.match(/^\/files\/([^/]+)\/(.+)$/);
  if (fileMatch) {
    const projectId = fileMatch[1];
    const path = fileMatch[2];
    const label = path.split("/").pop() || "File";
    return {
      type: "page",
      data: {
        type: "page",
        pageId: "file.view",
        params: { projectId, path },
        label,
        icon: "file-code",
      },
      label,
    };
  }

  // /folders/:projectId/:path (splat route)
  const folderMatch = pathname.match(/^\/folders\/([^/]+)\/(.*)$/);
  if (folderMatch) {
    const projectId = folderMatch[1];
    const path = folderMatch[2] || "";
    const label = path ? path.split("/").pop() || "Folder" : "Root";
    return {
      type: "page",
      data: {
        type: "page",
        pageId: "folder.view",
        params: { projectId, path },
        label,
        icon: "folder",
      },
      label,
    };
  }

  // /settings (redirect to api-keys)
  if (pathname === "/settings") {
    return {
      type: "page",
      data: {
        type: "page",
        pageId: "settings.api-keys",
        params: {},
        label: "Model Provider",
        icon: "key",
      },
      label: "Model Provider",
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
