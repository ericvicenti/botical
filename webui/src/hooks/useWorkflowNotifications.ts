import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { subscribeToWorkflowNotify, type WorkflowNotifyPayload } from "@/lib/websocket/events";

/**
 * Hook to subscribe to workflow notifications and show them as toasts
 */
export function useWorkflowNotifications() {
  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribe = subscribeToWorkflowNotify((payload: WorkflowNotifyPayload) => {
      // Map workflow variant to toast type
      const typeMap: Record<WorkflowNotifyPayload["variant"], "success" | "error" | "info" | "warning"> = {
        info: "info",
        success: "success",
        warning: "warning",
        error: "error",
      };

      showToast(payload.message, typeMap[payload.variant] || "info");
    });

    return unsubscribe;
  }, [showToast]);
}
