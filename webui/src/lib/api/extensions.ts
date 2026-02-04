/**
 * Extensions API hooks
 *
 * React Query hooks for managing extensions - listing available extensions
 * and managing which extensions are enabled per project.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "./client";
import type { Extension, ProjectExtensions } from "./types";

// ============================================================================
// Extensions List
// ============================================================================

/**
 * Get all available extensions
 */
export function useExtensions() {
  return useQuery({
    queryKey: ["extensions"],
    queryFn: async () => {
      const response = await apiClientRaw<Extension[]>("/api/extensions");
      return response.data;
    },
    // Poll for status updates every 5 seconds
    refetchInterval: 5000,
  });
}

/**
 * Get a single extension by ID
 */
export function useExtension(extensionId: string) {
  return useQuery({
    queryKey: ["extensions", extensionId],
    queryFn: () => apiClient<Extension>(`/api/extensions/${extensionId}`),
    enabled: !!extensionId,
  });
}

// ============================================================================
// Project Extensions
// ============================================================================

/**
 * Get enabled extensions for a project
 */
export function useProjectExtensions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "extensions"],
    queryFn: () => apiClient<ProjectExtensions>(`/api/projects/${projectId}/extensions`),
    enabled: !!projectId,
  });
}

/**
 * Update enabled extensions for a project
 */
export function useUpdateProjectExtensions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, enabled }: { projectId: string; enabled: string[] }) =>
      apiClient<ProjectExtensions>(`/api/projects/${projectId}/extensions`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "extensions"] });
    },
  });
}

/**
 * Enable a single extension for a project
 */
export function useEnableExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, extensionId }: { projectId: string; extensionId: string }) =>
      apiClient<{ enabled: boolean; extensionId: string }>(
        `/api/projects/${projectId}/extensions/${extensionId}/enable`,
        { method: "POST" }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "extensions"] });
      // Also invalidate extensions list to get updated server status
      queryClient.invalidateQueries({ queryKey: ["extensions"] });
    },
  });
}

/**
 * Disable a single extension for a project
 */
export function useDisableExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, extensionId }: { projectId: string; extensionId: string }) =>
      apiClient<{ enabled: boolean; extensionId: string }>(
        `/api/projects/${projectId}/extensions/${extensionId}/disable`,
        { method: "POST" }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "extensions"] });
      // Also invalidate extensions list to get updated server status
      queryClient.invalidateQueries({ queryKey: ["extensions"] });
    },
  });
}

/**
 * Toggle an extension for a project
 */
export function useToggleExtension() {
  const enableMutation = useEnableExtension();
  const disableMutation = useDisableExtension();

  return {
    mutate: (params: { projectId: string; extensionId: string; enabled: boolean }) => {
      if (params.enabled) {
        enableMutation.mutate({ projectId: params.projectId, extensionId: params.extensionId });
      } else {
        disableMutation.mutate({ projectId: params.projectId, extensionId: params.extensionId });
      }
    },
    isPending: enableMutation.isPending || disableMutation.isPending,
    isError: enableMutation.isError || disableMutation.isError,
    error: enableMutation.error || disableMutation.error,
  };
}
