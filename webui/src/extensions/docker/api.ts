/**
 * Docker Extension API Hooks
 *
 * React Query hooks for interacting with the Docker extension API.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

// Helper types for API responses
interface ApiResponse<T> {
  data: T;
}

interface AvailableResponse {
  available: boolean;
}

// ============================================================================
// Types
// ============================================================================

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: "running" | "paused" | "exited" | "created" | "restarting" | "removing" | "dead";
  statusText: string;
  ports: Array<{
    privatePort: number;
    publicPort?: number;
    type: string;
    ip?: string;
  }>;
  mounts: Array<{
    type: string;
    source: string;
    destination: string;
    mode: string;
    rw: boolean;
  }>;
  created: number;
  labels: Record<string, string>;
}

export interface DockerContainerDetail {
  id: string;
  name: string;
  image: string;
  created: string;
  state: {
    status: string;
    running: boolean;
    paused: boolean;
    restarting: boolean;
    exitCode: number;
    startedAt: string;
    finishedAt: string;
  };
  env: string[];
  cmd?: string[];
  labels: Record<string, string>;
  ports: Array<{
    containerPort: string;
    hostBindings: Array<{ HostIp?: string; HostPort: string }>;
  }>;
  mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
    Mode: string;
    RW: boolean;
  }>;
  restartPolicy?: {
    Name: string;
    MaximumRetryCount: number;
  };
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  repoDigests: string[];
  created: number;
  size: number;
  labels: Record<string, string>;
}

export interface DockerInfo {
  id?: string;
  containers: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
  driver: string;
  memoryTotal: number;
  cpus: number;
  operatingSystem: string;
  osType: string;
  architecture: string;
  serverVersion: string;
  name: string;
}

export interface CreateContainerInput {
  image: string;
  name?: string;
  env?: Record<string, string>;
  ports?: Array<{
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
  }>;
  volumes?: Array<{
    hostPath: string;
    containerPath: string;
    mode?: "rw" | "ro";
  }>;
  cmd?: string[];
  autoRemove?: boolean;
  restartPolicy?: "no" | "always" | "unless-stopped" | "on-failure";
}

// ============================================================================
// Query Keys
// ============================================================================

export const dockerKeys = {
  all: ["docker"] as const,
  containers: () => [...dockerKeys.all, "containers"] as const,
  container: (id: string) => [...dockerKeys.containers(), id] as const,
  containerLogs: (id: string) => [...dockerKeys.container(id), "logs"] as const,
  images: () => [...dockerKeys.all, "images"] as const,
  info: () => [...dockerKeys.all, "info"] as const,
  available: () => [...dockerKeys.all, "available"] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Check if Docker is available
 */
export function useDockerAvailable() {
  return useQuery({
    queryKey: dockerKeys.available(),
    queryFn: async () => {
      const response = await apiClient<AvailableResponse>("/api/extensions/docker/info/available");
      return response.available;
    },
    staleTime: 30000,
  });
}

/**
 * Get Docker daemon info
 */
export function useDockerInfo() {
  return useQuery({
    queryKey: dockerKeys.info(),
    queryFn: async () => {
      const response = await apiClient<ApiResponse<DockerInfo>>("/api/extensions/docker/info");
      return response.data;
    },
    staleTime: 30000,
  });
}

/**
 * List Docker containers
 */
export function useDockerContainers(options?: { all?: boolean }) {
  const params = new URLSearchParams();
  if (options?.all) params.set("all", "true");

  return useQuery({
    queryKey: [...dockerKeys.containers(), { all: options?.all }],
    queryFn: async () => {
      const url = `/api/extensions/docker/containers${params.toString() ? `?${params}` : ""}`;
      const response = await apiClient<ApiResponse<DockerContainer[]>>(url);
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

/**
 * Get container details
 */
export function useDockerContainer(containerId: string) {
  return useQuery({
    queryKey: dockerKeys.container(containerId),
    queryFn: async () => {
      const response = await apiClient<ApiResponse<DockerContainerDetail>>(`/api/extensions/docker/containers/${containerId}`);
      return response.data;
    },
    enabled: !!containerId,
  });
}

/**
 * Get container logs
 */
export function useDockerContainerLogs(
  containerId: string,
  options?: { tail?: number; timestamps?: boolean }
) {
  const params = new URLSearchParams();
  if (options?.tail) params.set("tail", String(options.tail));
  if (options?.timestamps) params.set("timestamps", "true");

  return useQuery({
    queryKey: [...dockerKeys.containerLogs(containerId), options],
    queryFn: async () => {
      const url = `/api/extensions/docker/containers/${containerId}/logs${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(`/api${url}`);
      return response.text();
    },
    enabled: !!containerId,
    refetchInterval: 2000, // Refresh logs every 2 seconds
  });
}

/**
 * List Docker images
 */
export function useDockerImages() {
  return useQuery({
    queryKey: dockerKeys.images(),
    queryFn: async () => {
      const response = await apiClient<ApiResponse<DockerImage[]>>("/api/extensions/docker/images");
      return response.data;
    },
    staleTime: 30000,
  });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Start a container
 */
export function useStartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (containerId: string) => {
      await apiClient(`/api/extensions/docker/containers/${containerId}/start`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}

/**
 * Stop a container
 */
export function useStopContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (containerId: string) => {
      await apiClient(`/api/extensions/docker/containers/${containerId}/stop`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}

/**
 * Restart a container
 */
export function useRestartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (containerId: string) => {
      await apiClient(`/api/extensions/docker/containers/${containerId}/restart`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}

/**
 * Remove a container
 */
export function useRemoveContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ containerId, force }: { containerId: string; force?: boolean }) => {
      const url = `/api/extensions/docker/containers/${containerId}${force ? "?force=true" : ""}`;
      await apiClient(url, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}

/**
 * Create a container
 */
export function useCreateContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateContainerInput) => {
      const response = await apiClient<ApiResponse<{ id: string; warnings: string[] }>>(
        "/api/extensions/docker/containers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.containers() });
    },
  });
}

/**
 * Pull an image
 */
export function usePullImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ image, tag }: { image: string; tag?: string }) => {
      await apiClient("/api/extensions/docker/images/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, tag }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.images() });
    },
  });
}

/**
 * Remove an image
 */
export function useRemoveImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ imageId, force }: { imageId: string; force?: boolean }) => {
      const url = `/api/extensions/docker/images/${imageId}${force ? "?force=true" : ""}`;
      await apiClient(url, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.images() });
    },
  });
}
