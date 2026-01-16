import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Tab, TabData } from "@/types/tabs";

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
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

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
