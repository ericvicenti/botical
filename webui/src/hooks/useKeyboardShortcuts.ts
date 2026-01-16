import { useEffect } from "react";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";

export function useKeyboardShortcuts() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();
  const { toggleSidebar, setSidebarPanel, toggleBottomPanel } = useUI();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd+B: Toggle sidebar
      if (isMod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+J: Toggle bottom panel
      if (isMod && e.key === "j") {
        e.preventDefault();
        toggleBottomPanel();
        return;
      }

      // Cmd+W: Close current tab
      if (isMod && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
        return;
      }

      // Cmd+Shift+[ and ]: Navigate tabs
      if (isMod && e.shiftKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex !== -1) {
          const newIndex =
            e.key === "["
              ? Math.max(0, currentIndex - 1)
              : Math.min(tabs.length - 1, currentIndex + 1);
          setActiveTab(tabs[newIndex].id);
        }
        return;
      }

      // Alt+1-4: Switch sidebar panels
      if (e.altKey && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const panels = ["nav", "files", "git", "run"] as const;
        setSidebarPanel(panels[parseInt(e.key) - 1]);
        return;
      }

      // Cmd+number: Jump to tab (without shift)
      if (isMod && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          setActiveTab(tabs[index].id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    toggleSidebar,
    setSidebarPanel,
    toggleBottomPanel,
  ]);
}
