import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Tab, TabData } from "@/types/tabs";

const STORAGE_KEY = "iris:tabs";

interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (data: TabData) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  markDirty: (id: string, dirty: boolean) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function loadTabsFromStorage(): { tabs: Tab[]; activeTabId: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
        activeTabId: parsed.activeTabId ?? null,
      };
    }
  } catch (e) {
    console.warn("Failed to load tabs from storage:", e);
  }
  return { tabs: [], activeTabId: null };
}

function saveTabsToStorage(tabs: Tab[], activeTabId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch (e) {
    console.warn("Failed to save tabs to storage:", e);
  }
}

function generateTabId(data: TabData): string {
  switch (data.type) {
    case "project":
      return `project:${data.projectId}`;
    case "mission":
      return `mission:${data.missionId}`;
    case "file":
      return `file:${data.projectId}:${data.path}`;
    case "process":
      return `process:${data.processId}`;
    case "diff":
      return `diff:${data.projectId}:${data.path}:${data.base || "working"}`;
    case "settings":
      return "settings";
    case "create-project":
      return "create-project";
    case "task":
      return `task:${data.sessionId}`;
  }
}

function generateTabLabel(data: TabData): string {
  switch (data.type) {
    case "project":
      return data.projectName;
    case "mission":
      return data.missionTitle;
    case "file":
      return data.path.split("/").pop() || "File";
    case "process":
      return "Process";
    case "diff":
      return `Diff: ${data.path.split("/").pop()}`;
    case "settings":
      return "Settings";
    case "create-project":
      return "New Project";
    case "task":
      return data.title || "Task";
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => loadTabsFromStorage().tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => loadTabsFromStorage().activeTabId
  );

  // Persist to localStorage when tabs or activeTabId change
  useEffect(() => {
    saveTabsToStorage(tabs, activeTabId);
  }, [tabs, activeTabId]);

  const openTab = useCallback((data: TabData) => {
    const id = generateTabId(data);

    setTabs((prev) => {
      if (prev.find((t) => t.id === id)) {
        return prev;
      }
      return [
        ...prev,
        {
          id,
          type: data.type,
          label: generateTabLabel(data),
          data,
        },
      ];
    });
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === id);
        const newTabs = prev.filter((t) => t.id !== id);

        if (id === activeTabId && newTabs.length > 0) {
          const newIndex = Math.min(index, newTabs.length - 1);
          setActiveTabId(newTabs[newIndex].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }

        return newTabs;
      });
    },
    [activeTabId]
  );

  const closeOtherTabs = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id === id));
    setActiveTabId(id);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  const closeTabsToRight = useCallback((id: string) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === id);
      return prev.slice(0, index + 1);
    });
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  const markDirty = useCallback((id: string, dirty: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, dirty } : t)));
  }, []);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTabId,
        openTab,
        closeTab,
        setActiveTab: setActiveTabId,
        closeOtherTabs,
        closeAllTabs,
        closeTabsToRight,
        reorderTabs,
        markDirty,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("useTabs must be used within TabsProvider");
  }
  return context;
}
