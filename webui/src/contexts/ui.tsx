import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "iris:ui";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

export type SidebarPanel = "tasks" | "files" | "git" | "run" | "settings";
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface StoredUIState {
  selectedProjectId: string | null;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarPanel: SidebarPanel;
  theme: ThemePreference;
}

function loadUIFromStorage(): StoredUIState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        selectedProjectId: parsed.selectedProjectId ?? null,
        sidebarWidth: parsed.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH,
        sidebarCollapsed: parsed.sidebarCollapsed ?? false,
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
    sidebarCollapsed: false,
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
}

interface UIContextValue extends UIState {
  toggleSidebar: () => void;
  setSidebarPanel: (panel: UIState["sidebarPanel"]) => void;
  setSidebarWidth: (width: number) => void;
  setTheme: (theme: ThemePreference) => void;
  setSelectedProject: (projectId: string | null) => void;
  revealInTree: (path: string) => void;
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

  const value: UIContextValue = {
    ...state,
    toggleSidebar: () =>
      setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarPanel: (panel) => setState((s) => ({ ...s, sidebarPanel: panel })),
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
