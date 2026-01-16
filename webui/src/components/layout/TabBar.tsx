import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import {
  X,
  Circle,
  Folder,
  Target,
  FileText,
  Terminal,
  GitCompare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Tab } from "@/types/tabs";

const TAB_ICONS = {
  project: Folder,
  mission: Target,
  file: FileText,
  process: Terminal,
  diff: GitCompare,
  settings: Settings,
} as const;

function getTabRoute(tab: Tab): { to: string; params?: Record<string, string> } {
  switch (tab.data.type) {
    case "project":
      return { to: "/projects/$projectId", params: { projectId: tab.data.projectId } };
    case "mission":
      return { to: "/projects/$projectId", params: { projectId: tab.data.projectId } };
    case "settings":
      return { to: "/settings" };
    default:
      return { to: "/" };
  }
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();
  const navigate = useNavigate();

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab.id);
    const route = getTabRoute(tab);
    navigate({ to: route.to, params: route.params });
  };

  if (tabs.length === 0) {
    return (
      <div className="h-9 bg-bg-secondary border-b border-border flex items-center px-3">
        <span className="text-sm text-text-muted">No open tabs</span>
      </div>
    );
  }

  return (
    <div className="h-9 bg-bg-secondary border-b border-border flex items-center overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.type];
        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={cn(
              "group h-full px-3 flex items-center gap-2 border-r border-border cursor-pointer",
              "hover:bg-bg-elevated transition-colors min-w-0 max-w-48",
              tab.id === activeTabId
                ? "bg-bg-primary text-text-primary"
                : "text-text-secondary"
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

      <div className="flex-1 min-w-8" />
    </div>
  );
}
