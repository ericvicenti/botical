/**
 * Running Command Dialog
 *
 * Shows a modal while a command is executing. Provides visual feedback
 * that something is happening, especially for long-running commands.
 */

import { useState, createContext, useContext, useCallback, useRef } from "react";
import { Modal } from "./Modal";

interface RunningCommandState {
  isOpen: boolean;
  title: string;
  description?: string;
}

interface RunningCommandContextValue {
  showRunning: (title: string, description?: string) => void;
  hideRunning: () => void;
  isRunning: boolean;
}

const RunningCommandContext = createContext<RunningCommandContextValue | null>(null);

export function useRunningCommand() {
  const context = useContext(RunningCommandContext);
  if (!context) {
    throw new Error("useRunningCommand must be used within a RunningCommandProvider");
  }
  return context;
}

export function RunningCommandProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RunningCommandState>({
    isOpen: false,
    title: "",
    description: undefined,
  });

  // Track if we're currently showing to prevent race conditions
  const isShowingRef = useRef(false);

  const showRunning = useCallback((title: string, description?: string) => {
    isShowingRef.current = true;
    setState({ isOpen: true, title, description });
  }, []);

  const hideRunning = useCallback(() => {
    isShowingRef.current = false;
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <RunningCommandContext.Provider value={{ showRunning, hideRunning, isRunning: state.isOpen }}>
      {children}
      <Modal isOpen={state.isOpen} onClose={() => {}} className="w-[400px]">
        <div className="flex flex-col p-6">
          {/* Spinner and title */}
          <div className="flex items-center gap-3">
            {/* Spinner */}
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <h3 className="font-medium text-text-primary">{state.title}</h3>
          </div>

          {/* Description */}
          {state.description && (
            <p className="mt-3 text-sm text-text-secondary pl-8">
              {state.description}
            </p>
          )}
        </div>
      </Modal>
    </RunningCommandContext.Provider>
  );
}
