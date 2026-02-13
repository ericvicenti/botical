/**
 * Hook to handle agent-triggered actions via WebSocket
 *
 * This handles navigation and tab actions that are triggered by the AI agent.
 * UI actions like theme/sidebar are handled directly in the UI context.
 */

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import {
  subscribeToNavigateEvents,
  subscribeToUIActionEvents,
  type NavigatePayload,
  type UIActionPayload,
} from "@/lib/websocket/events";

export function useAgentActions() {
  const navigate = useNavigate();
  const { activeTabId, closeTab, closeAllTabs } = useTabs();
  const { selectedProjectId } = useUI();

  // Handle navigation events from AI agent
  useEffect(() => {
    const handleNavigate = (payload: NavigatePayload) => {
      console.log("[useAgentActions] Navigate:", payload);

      switch (payload.pageId) {
        case "file":
          if (payload.params.path && selectedProjectId) {
            navigate({
              to: `/projects/${selectedProjectId}/files/${encodeURIComponent(payload.params.path as string)}`,
            });
          }
          break;
        case "task":
          if (payload.params.sessionId) {
            navigate({ to: `/projects/${payload.params.projectId || selectedProjectId}/tasks/${payload.params.sessionId}` });
          }
          break;
        case "settings":
          navigate({ to: "/settings" });
          break;
        case "project":
          if (payload.params.projectId) {
            navigate({ to: `/projects/${payload.params.projectId}` });
          }
          break;
        case "workflow":
          if (payload.params.workflowId) {
            navigate({ to: `/workflows/${payload.params.workflowId}` });
          }
          break;
        default:
          console.warn("[useAgentActions] Unknown page:", payload.pageId);
      }
    };

    return subscribeToNavigateEvents(handleNavigate);
  }, [navigate, selectedProjectId]);

  // Handle tab-related UI actions from AI agent
  useEffect(() => {
    const handleUIAction = (payload: UIActionPayload) => {
      // Only handle tab actions here - other UI actions are in UIProvider
      switch (payload.action) {
        case "closeTab":
          if (payload.value === "active" && activeTabId) {
            closeTab(activeTabId);
          } else if (typeof payload.value === "string" && payload.value !== "active") {
            closeTab(payload.value);
          }
          break;
        case "closeAllTabs":
          closeAllTabs();
          break;
        // Other UI actions (setTheme, toggleSidebar, setSidebarPanel)
        // are handled in UIProvider
      }
    };

    return subscribeToUIActionEvents(handleUIAction);
  }, [activeTabId, closeTab, closeAllTabs]);
}
