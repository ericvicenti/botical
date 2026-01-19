import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Tab, TabData } from "@/types/tabs";
import { generateTabId, generateTabLabel } from "@/lib/tabs";

const STORAGE_KEY = "iris:tabs";
const DIRTY_CONTENT_KEY = "iris:dirty-content";

interface TabsContextValue {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (data: TabData) => void;
  closeTab: (id: string, force?: boolean) => void;
  setActiveTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  markDirty: (id: string, dirty: boolean) => void;

  // Dirty content management for preserving unsaved changes
  getDirtyContent: (id: string) => string | null;
  setDirtyContent: (id: string, content: string | null) => void;
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

function loadDirtyContentFromStorage(): Record<string, string> {
  try {
    const stored = localStorage.getItem(DIRTY_CONTENT_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load dirty content from storage:", e);
  }
  return {};
}

function saveDirtyContentToStorage(dirtyContent: Record<string, string>) {
  try {
    localStorage.setItem(DIRTY_CONTENT_KEY, JSON.stringify(dirtyContent));
  } catch (e) {
    console.warn("Failed to save dirty content to storage:", e);
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => loadTabsFromStorage().tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => loadTabsFromStorage().activeTabId
  );
  const [dirtyContent, setDirtyContentState] = useState<Record<string, string>>(
    () => loadDirtyContentFromStorage()
  );

  // Persist to localStorage when tabs or activeTabId change
  useEffect(() => {
    saveTabsToStorage(tabs, activeTabId);
  }, [tabs, activeTabId]);

  // Persist dirty content to localStorage
  useEffect(() => {
    saveDirtyContentToStorage(dirtyContent);
  }, [dirtyContent]);

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
    (id: string, force = false) => {
      // Find the tab first to check if it's dirty
      const tab = tabs.find((t) => t.id === id);

      // If tab is dirty and not forcing close, ask for confirmation
      if (tab?.dirty && !force) {
        const confirmed = window.confirm(
          `"${tab.label}" has unsaved changes. Close anyway?`
        );
        if (!confirmed) {
          return;
        }
      }

      // Clear dirty content for this tab
      setDirtyContentState((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });

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
    [activeTabId, tabs]
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

  const getDirtyContent = useCallback(
    (id: string): string | null => {
      return dirtyContent[id] ?? null;
    },
    [dirtyContent]
  );

  const setDirtyContent = useCallback((id: string, content: string | null) => {
    setDirtyContentState((prev) => {
      if (content === null) {
        // Remove the entry
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: content };
    });
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
        getDirtyContent,
        setDirtyContent,
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
