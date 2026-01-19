import type { useNavigate } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { Tab } from "@/types/tabs";

type NavigateFunction = ReturnType<typeof useNavigate>;

export type CommandCategory =
  | "file"
  | "project"
  | "tab"
  | "view"
  | "mission"
  | "process";

export interface CommandShortcut {
  key: string;
  mod?: boolean;    // Cmd on Mac, Ctrl on Windows
  ctrl?: boolean;   // Ctrl key specifically (on all platforms)
  shift?: boolean;
  alt?: boolean;
}

export interface CommandArg {
  name: string;
  type: "string" | "number" | "select";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface ExecutionContext {
  selectedProjectId: string | null;
  activeTabId: string | null;
  tabs: Tab[];
  ui: UIActions;
  tabActions: TabActions;
  navigate: NavigateFunction;
  queryClient: QueryClient;
}

export interface UIActions {
  toggleSidebar: () => void;
  setSidebarPanel: (panel: "files" | "git" | "run" | "tasks") => void;
  setTheme: (theme: "dark" | "light") => void;
  setSelectedProject: (projectId: string | null) => void;
  sidebarCollapsed: boolean;
  theme: "dark" | "light";
}

export interface TabActions {
  openTab: (data: import("@/types/tabs").TabData) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (id: string) => void;
}

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  shortcut?: CommandShortcut;
  args?: CommandArg[];
  when?: (ctx: ExecutionContext) => boolean;
  execute: (
    ctx: ExecutionContext,
    args: Record<string, unknown>
  ) => void | Promise<void>;
}
