/**
 * Actions API
 *
 * Hooks for executing backend actions from the frontend.
 * Actions are the universal building blocks for both AI agents and UI.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { BackendAction } from "./types";

/**
 * Action execution result
 */
export interface ActionResult {
  type: "success" | "error" | "navigate" | "ui";
  title?: string;
  message?: string;
  output?: string;
  metadata?: Record<string, unknown>;
  // For navigate type
  pageId?: string;
  params?: Record<string, unknown>;
  // For ui type
  action?: string;
  value?: unknown;
  // For error type
  code?: string;
}

/**
 * Fetch all available actions
 */
export function useActions() {
  return useQuery({
    queryKey: ["actions"],
    queryFn: async () => {
      const response = await apiClient<{ actions: BackendAction[] }>("/api/tools/actions");
      return response.actions;
    },
    staleTime: 60000, // Actions don't change often
  });
}

/**
 * Execute a backend action
 */
export function useExecuteAction() {
  return useMutation({
    mutationFn: async ({
      actionId,
      params,
    }: {
      actionId: string;
      params: Record<string, unknown>;
    }) => {
      const response = await apiClient<ActionResult>("/api/tools/actions/execute", {
        method: "POST",
        body: JSON.stringify({ actionId, params }),
      });
      return response;
    },
  });
}

/**
 * Execute a specific action by ID
 */
export function executeAction(
  actionId: string,
  params: Record<string, unknown>
): Promise<ActionResult> {
  return apiClient<ActionResult>("/api/tools/actions/execute", {
    method: "POST",
    body: JSON.stringify({ actionId, params }),
  });
}
