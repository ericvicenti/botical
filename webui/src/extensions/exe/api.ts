/**
 * Exe.dev Extension API
 *
 * React Query hooks for exe.dev VMs via the extension proxy.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "@/lib/api/client";

export interface ExeVM {
  name: string;
  status: "running" | "stopped" | "creating" | "unknown";
  created?: string;
  image?: string;
  cpus?: number;
  memory?: string;
  disk?: string;
  url?: string;
}

export interface ExeStatus {
  connected: boolean;
  authenticated: boolean;
  error?: string;
}

export interface ExeExecResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

const EXE_BASE = "/api/extensions/exe";

export function useExeStatus() {
  return useQuery({
    queryKey: ["exe", "status"],
    queryFn: async () => {
      const response = await apiClientRaw<ExeStatus>(`${EXE_BASE}/status`);
      return response.data;
    },
    staleTime: 30000,
  });
}

export function useExeVMs() {
  return useQuery({
    queryKey: ["exe", "vms"],
    queryFn: async () => {
      const response = await apiClientRaw<ExeVM[]>(`${EXE_BASE}/vms`);
      return response.data;
    },
    refetchInterval: 10000,
  });
}

export function useCreateExeVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; image?: string } = {}) =>
      apiClient<ExeVM>(`${EXE_BASE}/vms`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exe", "vms"] });
    },
  });
}

export function useDeleteExeVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name }: { name: string }) =>
      apiClient<{ success: boolean }>(`${EXE_BASE}/vms/${name}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exe", "vms"] });
    },
  });
}

export function useRestartExeVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name }: { name: string }) =>
      apiClient<{ success: boolean }>(`${EXE_BASE}/vms/${name}/restart`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exe", "vms"] });
    },
  });
}

export function useExeExec() {
  return useMutation({
    mutationFn: ({
      name,
      command,
      timeout,
    }: {
      name: string;
      command: string;
      timeout?: number;
    }) =>
      apiClient<ExeExecResult>(`${EXE_BASE}/vms/${name}/exec`, {
        method: "POST",
        body: JSON.stringify({ command, timeout }),
      }),
  });
}
