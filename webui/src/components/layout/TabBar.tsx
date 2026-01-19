import { useTabs } from "@/contexts/tabs";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  X,
  Circle,
  Folder,
  FolderTree,
  Target,
  FileText,
  Terminal,
  GitCompare,
  Settings,
  Plus,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Tab, TabData, TabType } from "@/types/tabs";

const TAB_ICONS = {
  projects: FolderTree,
  project: Folder,
  mission: Target,
  file: FileText,
  process: Terminal,
  diff: GitCompare,
  settings: Settings,
  "create-project": Plus,
  task: MessageSquare,
} as const;

function getTabRoute(tab: Tab): { to: string; params?: Record<string, string> } {
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

// Parse current URL path into tab data
function parseUrlToTabData(pathname: string): { data: TabData; label: string; type: TabType } | null {
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

function getTabIdFromData(data: TabData): string {
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
    case "task":
      return `task:${data.sessionId}`;
    case "settings":
      return "settings";
    case "create-project":
      return "create-project";
    default:
      return "unknown";
  }
}

export function TabBar() {
  const { tabs, setActiveTab, closeTab, openTab } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse current URL and check if it matches any existing tab
  const currentTabData = parseUrlToTabData(location.pathname);
  const currentTabId = currentTabData ? getTabIdFromData(currentTabData.data) : null;
  const hasMatchingTab = currentTabId ? tabs.some((t) => t.id === currentTabId) : true;

  // Determine what should appear as "active" - either the matching tab or the preview
  const effectiveActiveId = hasMatchingTab ? currentTabId : null;

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab.id);
    const route = getTabRoute(tab);
    navigate({ to: route.to, params: route.params });
  };

  const handlePreviewClick = () => {
    if (currentTabData) {
      openTab(currentTabData.data);
    }
  };

  if (tabs.length === 0 && !currentTabData) {
    return (
      <div className="h-9 bg-bg-secondary border-b border-border flex items-center px-3">
        <span className="text-sm text-text-muted">No open tabs</span>
      </div>
    );
  }

  return (
    <div className="h-9 bg-bg-secondary border-b border-border flex overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.type];
        const isActive = tab.id === effectiveActiveId;
        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={cn(
              "group h-full px-3 flex items-center gap-2 border-r border-border cursor-pointer shrink-0",
              "hover:bg-bg-elevated transition-colors max-w-48",
              isActive
                ? "bg-bg-primary text-text-primary border-b-2 border-b-accent-primary"
                : "text-text-secondary border-b-2 border-b-transparent"
            )}
          >
            <Icon className="w-4 h-4 shrink-0 opacity-60" />

            <span className="truncate text-sm">{tab.label}</span>

            {tab.dirty ? (
              <Circle className="w-2 h-2 fill-current shrink-0" />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-bg-elevated rounded p-0.5 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Preview tab for current URL that doesn't have a matching tab */}
      {!hasMatchingTab && currentTabData && (
        <div
          onClick={handlePreviewClick}
          className={cn(
            "group h-full px-3 flex items-center gap-2 border-r border-border cursor-pointer shrink-0",
            "hover:bg-bg-elevated transition-colors max-w-48",
            "bg-bg-primary text-text-primary border-b-2 border-b-accent-primary italic"
          )}
          title="Click to open as tab"
        >
          {TAB_ICONS[currentTabData.type] && (
            <span className="w-4 h-4 shrink-0 opacity-60">
              {(() => {
                const Icon = TAB_ICONS[currentTabData.type];
                return <Icon className="w-4 h-4" />;
              })()}
            </span>
          )}
          <span className="truncate text-sm">{currentTabData.label}</span>
        </div>
      )}
    </div>
  );
}
