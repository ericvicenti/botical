import { useState, createContext, useContext, useCallback } from "react";
import { Modal } from "./Modal";
import { cn } from "@/lib/utils/cn";

interface ResultDialogState {
  isOpen: boolean;
  title: string;
  content: string;
  type: "success" | "error" | "info";
}

interface ResultDialogContextValue {
  showResult: (title: string, content: string, type?: ResultDialogState["type"]) => void;
}

const ResultDialogContext = createContext<ResultDialogContextValue | null>(null);

export function useResultDialog() {
  const context = useContext(ResultDialogContext);
  if (!context) {
    throw new Error("useResultDialog must be used within a ResultDialogProvider");
  }
  return context;
}

export function ResultDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ResultDialogState>({
    isOpen: false,
    title: "",
    content: "",
    type: "info",
  });

  const showResult = useCallback((title: string, content: string, type: ResultDialogState["type"] = "info") => {
    setState({ isOpen: true, title, content, type });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ResultDialogContext.Provider value={{ showResult }}>
      {children}
      <Modal isOpen={state.isOpen} onClose={close} className="w-full sm:w-[600px]">
        <div className="flex flex-col max-h-[95vh] sm:max-h-[80vh]">
          {/* Header */}
          <div
            className={cn(
              "flex items-center justify-between px-4 py-3 border-b border-border",
              state.type === "success" && "bg-green-600/10",
              state.type === "error" && "bg-red-600/10"
            )}
          >
            <div className="flex items-center gap-2">
              {state.type === "success" && (
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {state.type === "error" && (
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {state.type === "info" && (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <h3 className="font-medium text-text-primary">{state.title}</h3>
            </div>
            <button
              onClick={close}
              className="p-1 hover:bg-bg-tertiary rounded text-text-secondary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono bg-bg-tertiary p-3 rounded overflow-x-auto">
              {state.content}
            </pre>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border flex justify-end">
            <button
              onClick={close}
              className="px-4 py-2 bg-bg-tertiary hover:bg-bg-secondary text-text-primary rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </ResultDialogContext.Provider>
  );
}
