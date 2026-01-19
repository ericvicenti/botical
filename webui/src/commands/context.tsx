import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { commandRegistry } from "./registry";
import type { Command, ExecutionContext } from "./types";

interface CommandContextValue {
  execute: (commandId: string, args?: Record<string, unknown>) => Promise<void>;
  searchCommands: (query: string) => Command[];
  getAvailableCommands: () => Command[];
  isPaletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  getExecutionContext: () => ExecutionContext;
}

const CommandContext = createContext<CommandContextValue | null>(null);

function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ui = useUI();
  const tabContext = useTabs();

  const getExecutionContext = useCallback((): ExecutionContext => {
    return {
      selectedProjectId: ui.selectedProjectId,
      activeTabId: tabContext.activeTabId,
      tabs: tabContext.tabs,
      ui: {
        toggleSidebar: ui.toggleSidebar,
        setSidebarPanel: ui.setSidebarPanel,
        setTheme: ui.setTheme,
        setSelectedProject: ui.setSelectedProject,
        sidebarCollapsed: ui.sidebarCollapsed,
        theme: ui.theme,
      },
      tabActions: {
        openTab: tabContext.openTab,
        closeTab: tabContext.closeTab,
        setActiveTab: tabContext.setActiveTab,
        closeOtherTabs: tabContext.closeOtherTabs,
        closeAllTabs: tabContext.closeAllTabs,
        closeTabsToRight: tabContext.closeTabsToRight,
      },
      navigate,
      queryClient,
    };
  }, [ui, tabContext, navigate, queryClient]);

  const execute = useCallback(
    async (commandId: string, args: Record<string, unknown> = {}) => {
      const command = commandRegistry.get(commandId);
      if (!command) {
        console.warn(`Command not found: ${commandId}`);
        return;
      }

      const ctx = getExecutionContext();

      if (command.when && !command.when(ctx)) {
        console.warn(`Command "${commandId}" is not available in current context`);
        return;
      }

      try {
        await command.execute(ctx, args);
      } catch (error) {
        console.error(`Error executing command "${commandId}":`, error);
      }
    },
    [getExecutionContext]
  );

  const getAvailableCommands = useCallback((): Command[] => {
    const ctx = getExecutionContext();
    return commandRegistry.getAll().filter((cmd) => !cmd.when || cmd.when(ctx));
  }, [getExecutionContext]);

  const searchCommands = useCallback(
    (query: string): Command[] => {
      if (!query.trim()) {
        return getAvailableCommands();
      }

      return getAvailableCommands().filter(
        (cmd) =>
          fuzzyMatch(query, cmd.label) ||
          fuzzyMatch(query, cmd.id) ||
          (cmd.description && fuzzyMatch(query, cmd.description))
      );
    },
    [getAvailableCommands]
  );

  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);

  const value = useMemo(
    (): CommandContextValue => ({
      execute,
      searchCommands,
      getAvailableCommands,
      isPaletteOpen,
      openPalette,
      closePalette,
      getExecutionContext,
    }),
    [
      execute,
      searchCommands,
      getAvailableCommands,
      isPaletteOpen,
      openPalette,
      closePalette,
      getExecutionContext,
    ]
  );

  return (
    <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
  );
}

export function useCommands() {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("useCommands must be used within CommandProvider");
  }
  return context;
}
