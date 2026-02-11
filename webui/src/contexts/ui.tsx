import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { subscribeToUIActionEvents, type UIActionPayload } from "@/lib/websocket/events";

const STORAGE_KEY = "botical:ui";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

export type SidebarPanel = "tasks" | "files" | "git" | "run" | "services" | "workflows" | "schedules" | "skills" | "agents" | "exe" | "settings" | "extensions" | "docker" | "search";
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface StoredUIState {
  selectedProjectId: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarPanel: SidebarPanel;
  theme: ThemePreference;
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function loadUIFromStorage(): StoredUIState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        selectedProjectId: parsed.selectedProjectId ?? null,
        sidebarWidth: parsed.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
        // On mobile, always start collapsed (sidebar is an overlay)
        sidebarCollapsed: isMobileViewport() ? true : (parsed.sidebarCollapsed ?? false),
        sidebarPanel: parsed.sidebarPanel ?? "files",
        theme: parsed.theme ?? "system",
      };
    }
  } catch (e) {
    console.warn("Failed to load UI state from storage:", e);
  }
  return {
    selectedProjectId: null,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    sidebarCollapsed: isMobileViewport() ? true : false,
    sidebarPanel: "files",
    theme: "system",
  };
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }
}

function saveUIToStorage(state: StoredUIState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save UI state to storage:", e);
  }
}

interface UIState {
  sidebarCollapsed: boolean;
  sidebarPanel: SidebarPanel;
  sidebarWidth: number;
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  selectedProjectId: string | null;
  revealPath: string | null; // Path to reveal in file tree
  showNewTaskModal: boolean;
}

interface UIContextValue extends UIState {
  toggleSidebar: () => void;
  closeSidebarOnMobile: () => void;
  setSidebarPanel: (panel: UIState["sidebarPanel"]) => void;
  setSidebarWidth: (width: number) => void;
  setTheme: (theme: ThemePreference) => void;
  setSelectedProject: (projectId: string | null) => void;
  revealInTree: (path: string) => void;
  openNewTaskModal: () => void;
  closeNewTaskModal: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>(() => {
    const stored = loadUIFromStorage();
    const resolvedTheme = stored.theme === "system" ? getSystemTheme() : stored.theme;
    return {
      sidebarCollapsed: stored.sidebarCollapsed,
      sidebarPanel: stored.sidebarPanel,
      sidebarWidth: stored.sidebarWidth,
      theme: stored.theme,
      resolvedTheme,
      selectedProjectId: stored.selectedProjectId,
      revealPath: null,
      showNewTaskModal: false,
    };
  });

  // Apply theme to document on mount and when it changes
  useEffect(() => {
    applyTheme(state.resolvedTheme);
  }, [state.resolvedTheme]);

  // Listen for system theme changes when using "system" preference
  useEffect(() => {
    if (state.theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolvedTheme = e.matches ? "dark" : "light";
      setState((s) => ({ ...s, resolvedTheme: newResolvedTheme }));
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [state.theme]);

  // Persist to localStorage
  useEffect(() => {
    saveUIToStorage({
      selectedProjectId: state.selectedProjectId,
      sidebarWidth: state.sidebarWidth,
      sidebarCollapsed: state.sidebarCollapsed,
      sidebarPanel: state.sidebarPanel,
      theme: state.theme,
    });
  }, [state.selectedProjectId, state.sidebarWidth, state.sidebarCollapsed, state.sidebarPanel, state.theme]);

  const setTheme = useCallback((theme: ThemePreference) => {
    const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
    setState((s) => ({ ...s, theme, resolvedTheme }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }, []);

  const closeSidebarOnMobile = useCallback(() => {
    if (isMobileViewport()) {
      setState((s) => ({ ...s, sidebarCollapsed: true }));
    }
  }, []);

  const setSidebarPanel = useCallback((panel: SidebarPanel) => {
    setState((s) => ({ ...s, sidebarPanel: panel, sidebarCollapsed: false }));
  }, []);

  const openNewTaskModal = useCallback(() => {
    setState((s) => ({ ...s, showNewTaskModal: true }));
  }, []);

  const closeNewTaskModal = useCallback(() => {
    setState((s) => ({ ...s, showNewTaskModal: false }));
  }, []);

  // Subscribe to UI action events from WebSocket (AI agent tools)
  useEffect(() => {
    const handleUIAction = (payload: UIActionPayload) => {
      console.log("[UIProvider] Received UI action from WebSocket:", payload);

      switch (payload.action) {
        case "setTheme":
          if (typeof payload.value === "string") {
            setTheme(payload.value as ThemePreference);
          }
          break;
        case "toggleSidebar":
          toggleSidebar();
          break;
        case "setSidebarPanel":
          if (typeof payload.value === "string") {
            setSidebarPanel(payload.value as SidebarPanel);
          }
          break;
        default:
          console.warn("[UIProvider] Unknown UI action:", payload.action);
      }
    };

    return subscribeToUIActionEvents(handleUIAction);
  }, [setTheme, toggleSidebar, setSidebarPanel]);

  const value: UIContextValue = {
    ...state,
    toggleSidebar,
    closeSidebarOnMobile,
    setSidebarPanel,
    setSidebarWidth: (width) => {
      const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
      setState((s) => ({ ...s, sidebarWidth: clampedWidth }));
    },
    setTheme,
    setSelectedProject: (projectId) =>
      setState((s) => ({ ...s, selectedProjectId: projectId })),
    revealInTree: (path) =>
      setState((s) => ({
        ...s,
        sidebarPanel: "files",
        sidebarCollapsed: false,
        revealPath: path,
      })),
    openNewTaskModal,
    closeNewTaskModal,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within UIProvider");
  }
  return context;
}
