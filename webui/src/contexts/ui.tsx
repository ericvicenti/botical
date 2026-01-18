import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "iris:ui";

function loadUIFromStorage(): { selectedProjectId: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        selectedProjectId: parsed.selectedProjectId ?? null,
      };
    }
  } catch (e) {
    console.warn("Failed to load UI state from storage:", e);
  }
  return { selectedProjectId: null };
}

function saveUIToStorage(selectedProjectId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedProjectId }));
  } catch (e) {
    console.warn("Failed to save UI state to storage:", e);
  }
}

interface UIState {
  sidebarCollapsed: boolean;
  sidebarPanel: "tasks" | "files" | "git" | "run";
  bottomPanelVisible: boolean;
  bottomPanelTab: "output" | "problems" | "services";
  theme: "dark" | "light";
  selectedProjectId: string | null;
}

interface UIContextValue extends UIState {
  toggleSidebar: () => void;
  setSidebarPanel: (panel: UIState["sidebarPanel"]) => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: UIState["bottomPanelTab"]) => void;
  setTheme: (theme: UIState["theme"]) => void;
  setSelectedProject: (projectId: string | null) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>(() => ({
    sidebarCollapsed: false,
    sidebarPanel: "files",
    bottomPanelVisible: false,
    bottomPanelTab: "output",
    theme: "dark",
    selectedProjectId: loadUIFromStorage().selectedProjectId,
  }));

  // Persist selectedProjectId to localStorage
  useEffect(() => {
    saveUIToStorage(state.selectedProjectId);
  }, [state.selectedProjectId]);

  const value: UIContextValue = {
    ...state,
    toggleSidebar: () =>
      setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })),
    setSidebarPanel: (panel) => setState((s) => ({ ...s, sidebarPanel: panel })),
    toggleBottomPanel: () =>
      setState((s) => ({ ...s, bottomPanelVisible: !s.bottomPanelVisible })),
    setBottomPanelTab: (tab) =>
      setState((s) => ({ ...s, bottomPanelTab: tab })),
    setTheme: (theme) => setState((s) => ({ ...s, theme })),
    setSelectedProject: (projectId) =>
      setState((s) => ({ ...s, selectedProjectId: projectId })),
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
