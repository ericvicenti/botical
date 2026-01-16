import { createContext, useContext, useState, type ReactNode } from "react";

interface UIState {
  sidebarCollapsed: boolean;
  sidebarPanel: "nav" | "files" | "git" | "run";
  bottomPanelVisible: boolean;
  bottomPanelTab: "output" | "problems" | "services";
  theme: "dark" | "light";
}

interface UIContextValue extends UIState {
  toggleSidebar: () => void;
  setSidebarPanel: (panel: UIState["sidebarPanel"]) => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: UIState["bottomPanelTab"]) => void;
  setTheme: (theme: UIState["theme"]) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>({
    sidebarCollapsed: false,
    sidebarPanel: "nav",
    bottomPanelVisible: false,
    bottomPanelTab: "output",
    theme: "dark",
  });

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
