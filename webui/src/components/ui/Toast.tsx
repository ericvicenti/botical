import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast["type"], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info", duration = 3000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Set up auto-dismiss
    const dismissTimeout = setTimeout(() => {
      setIsLeaving(true);
    }, toast.duration || 3000);

    return () => clearTimeout(dismissTimeout);
  }, [toast.duration]);

  useEffect(() => {
    if (isLeaving) {
      const removeTimeout = setTimeout(() => {
        onRemove(toast.id);
      }, 200); // Match animation duration
      return () => clearTimeout(removeTimeout);
    }
  }, [isLeaving, toast.id, onRemove]);

  return (
    <div
      className={cn(
        "pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm transition-all duration-200",
        isVisible && !isLeaving ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4",
        toast.type === "success" && "bg-green-600 text-white",
        toast.type === "error" && "bg-red-600 text-white",
        toast.type === "warning" && "bg-yellow-600 text-white",
        toast.type === "info" && "bg-bg-secondary text-text-primary border border-border"
      )}
    >
      <div className="flex items-start gap-2">
        {toast.type === "success" && (
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {toast.type === "error" && (
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {toast.type === "warning" && (
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
