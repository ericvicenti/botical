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
  GitCommit,
  GitPullRequestCreate,
  Settings,
  Plus,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getTabRoute, parseUrlToTabData, generateTabId } from "@/lib/tabs";
import type { Tab } from "@/types/tabs";

const TAB_ICONS = {
  projects: FolderTree,
  project: Folder,
  "project-settings": Settings,
  mission: Target,
  file: FileText,
  folder: Folder,
  process: Terminal,
  diff: GitCompare,
  settings: Settings,
  "create-project": Plus,
  task: MessageSquare,
  commit: GitCommit,
  "review-commit": GitPullRequestCreate,
} as const;

export function TabBar() {
  const { tabs, setActiveTab, closeTab, openTab, pinTab } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse current URL and check if it matches any existing tab
  const currentTabData = parseUrlToTabData(location.pathname);
  const currentTabId = currentTabData ? generateTabId(currentTabData.data) : null;
  const hasMatchingTab = currentTabId ? tabs.some((t) => t.id === currentTabId) : true;

  // Determine what should appear as "active" - either the matching tab or the preview
  const effectiveActiveId = hasMatchingTab ? currentTabId : null;

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab.id);
    const route = getTabRoute(tab);
    navigate({ to: route.to, params: route.params });
  };

  const handleTabDoubleClick = (tab: Tab) => {
    if (tab.preview) {
      pinTab(tab.id);
    }
  };

  const handlePreviewClick = () => {
    if (currentTabData) {
      openTab(currentTabData.data);
    }
  };

  const handleCloseTab = (tab: Tab) => {
    // If closing the tab that matches the current URL, navigate away first
    if (tab.id === currentTabId) {
      const tabIndex = tabs.findIndex((t) => t.id === tab.id);
      const remainingTabs = tabs.filter((t) => t.id !== tab.id);

      if (remainingTabs.length > 0) {
        // Navigate to the next tab, or previous if closing the last one
        const newIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const nextTab = remainingTabs[newIndex];
        const route = getTabRoute(nextTab);
        navigate({ to: route.to, params: route.params });
      } else {
        // No tabs remaining, go home
        navigate({ to: "/" });
      }
    }
    closeTab(tab.id);
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
        const Icon = TAB_ICONS[tab.type] || FileText; // Fallback to FileText if type not found
        const isActive = tab.id === effectiveActiveId;
        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            onDoubleClick={() => handleTabDoubleClick(tab)}
            className={cn(
              "group h-full px-3 flex items-center gap-2 border-r border-border cursor-pointer shrink-0",
              "hover:bg-bg-elevated transition-colors max-w-48",
              isActive
                ? "bg-bg-primary text-text-primary border-b-2 border-b-accent-primary"
                : "text-text-secondary border-b-2 border-b-transparent",
              tab.preview && "italic"
            )}
            title={tab.preview ? "Preview tab - double-click to pin" : undefined}
          >
            <Icon className="w-4 h-4 shrink-0 opacity-60" />

            <span className="truncate text-sm">{tab.label}</span>

            {tab.dirty ? (
              <Circle className="w-2 h-2 fill-current shrink-0" />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab);
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
