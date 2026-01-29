/**
 * Docker Extension API Hooks
 *
 * React Query hooks for interacting with the Docker extension API.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
      const response = await api.get("/extensions/docker/info/available");
      return response.available as boolean;
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
      const response = await api.get("/extensions/docker/info");
      return response.data as DockerInfo;
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
      const url = `/extensions/docker/containers${params.toString() ? `?${params}` : ""}`;
      const response = await api.get(url);
      return response.data as DockerContainer[];
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
      const response = await api.get(`/extensions/docker/containers/${containerId}`);
      return response.data as DockerContainerDetail;
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
      const url = `/extensions/docker/containers/${containerId}/logs${params.toString() ? `?${params}` : ""}`;
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
      const response = await api.get("/extensions/docker/images");
      return response.data as DockerImage[];
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
      await api.post(`/extensions/docker/containers/${containerId}/start`);
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
      await api.post(`/extensions/docker/containers/${containerId}/stop`);
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
      await api.post(`/extensions/docker/containers/${containerId}/restart`);
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
      const url = `/extensions/docker/containers/${containerId}${force ? "?force=true" : ""}`;
      await api.delete(url);
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
      const response = await api.post("/extensions/docker/containers", input);
      return response.data as { id: string; warnings: string[] };
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
      await api.post("/extensions/docker/images/pull", { image, tag });
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
      const url = `/extensions/docker/images/${imageId}${force ? "?force=true" : ""}`;
      await api.delete(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dockerKeys.images() });
    },
  });
}
