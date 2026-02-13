import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "./client";
import type { Project, Session, Mission, Task, Process, MessageWithParts, MessagePart, FolderDetails, CoreTool, Skill, SkillDetails, InstalledSkill, SkillInstallResult } from "./types";

// Projects
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const response = await apiClientRaw<Project[]>("/api/projects");
      return response.data;
    },
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => apiClient<Project>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; path?: string; description?: string }) =>
      apiClient<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; name?: string; path?: string; description?: string; icon?: string }) =>
      apiClient<Project>(`/api/projects/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", project.id] });
    },
  });
}

// Sessions
export function useSessions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "sessions"],
    queryFn: async () => {
      const response = await apiClientRaw<Session[]>(
        `/api/sessions?projectId=${encodeURIComponent(projectId)}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useSession(sessionId: string, projectId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId],
    queryFn: () => apiClient<Session>(`/api/sessions/${sessionId}?projectId=${encodeURIComponent(projectId)}`),
    enabled: !!sessionId && !!projectId,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { projectId: string; title: string; agent?: string; message?: string; userId?: string }) =>
      apiClient<Session>(`/api/sessions`, {
        method: "POST",
        body: JSON.stringify({
          projectId: data.projectId,
          title: data.title,
          agent: data.agent || "default",
          ...(data.message && { message: data.message }),
          ...(data.userId && { userId: data.userId }),
        }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "sessions"] });
    },
  });
}

export function useArchiveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, projectId }: { sessionId: string; projectId: string }) =>
      apiClient(`/api/sessions/${sessionId}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateSystemPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, projectId, systemPrompt }: { sessionId: string; projectId: string; systemPrompt: string | null }) =>
      apiClient<Session>(`/api/sessions/${sessionId}/system-prompt`, {
        method: "PATCH",
        body: JSON.stringify({ projectId, systemPrompt }),
      }),
    onSuccess: (_, { sessionId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "sessions"] });
    },
  });
}

// Messages
export function useMessages(sessionId: string, projectId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: async () => {
      const response = await apiClientRaw<MessageWithParts[]>(
        `/api/sessions/${sessionId}/messages?projectId=${encodeURIComponent(projectId)}`
      );
      return response.data;
    },
    enabled: !!sessionId && !!projectId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      projectId: string;
      sessionId: string;
      content: string;
      userId: string;
      providerId?: string;
      modelId?: string;
    }) =>
      apiClient<{ message: MessageWithParts; parts: MessagePart[] }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          projectId: data.projectId,
          sessionId: data.sessionId,
          content: data.content,
          userId: data.userId,
          ...(data.providerId && { providerId: data.providerId }),
          ...(data.modelId && { modelId: data.modelId }),
        }),
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
    },
  });
}

// Settings - userId stored in localStorage, credentials on server
const SETTINGS_KEY = "botical:settings";

/**
 * App Settings - only non-sensitive data in localStorage
 * API keys are stored server-side via /api/credentials
 */
export interface AppSettings {
  userId: string;
}

/**
 * @deprecated Use AppSettings instead. Legacy interface kept for migration.
 */
export interface LegacyAppSettings {
  anthropicApiKey?: string;
  anthropicOAuthTokens?: { access: string; refresh: string; expires: number };
  openaiApiKey?: string;
  googleApiKey?: string;
  ollamaBaseUrl?: string;
  userId: string;
}

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { userId: parsed.userId };
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  // Default settings with a generated userId
  return {
    userId: `user-${Date.now()}`,
  };
}

/**
 * Get legacy settings (for one-time migration to server-side credentials)
 */
export function getLegacySettings(): LegacyAppSettings | null {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check if any API keys exist
      if (parsed.anthropicApiKey || parsed.openaiApiKey || parsed.googleApiKey || parsed.ollamaBaseUrl || parsed.anthropicOAuthTokens) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Clear legacy API keys from localStorage after migration
 */
export function clearLegacyKeys(): void {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const cleaned = { userId: parsed.userId };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleaned));
    }
  } catch { /* ignore */ }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ userId: settings.userId }));
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    staleTime: Infinity,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: AppSettings) => {
      saveSettings(settings);
      return Promise.resolve(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Provider Credentials (server-side)

export interface ProviderCredential {
  id: string;
  provider: string;
  name: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export function useCredentials() {
  return useQuery({
    queryKey: ["credentials"],
    queryFn: async () => {
      const response = await apiClientRaw<ProviderCredential[]>("/api/credentials");
      // The API returns { credentials: [...] } not wrapped in data
      return (response as unknown as { credentials: ProviderCredential[] }).credentials;
    },
  });
}

export function useCredentialsCheck() {
  return useQuery({
    queryKey: ["credentials", "check"],
    queryFn: async () => {
      const resp = await fetch("/api/credentials/check");
      const data = await resp.json();
      return data.configured as Record<string, boolean>;
    },
  });
}

export function useSaveCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { provider: string; apiKey: string; name?: string }) => {
      const resp = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message || "Failed to save credential");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      queryClient.invalidateQueries({ queryKey: ["available-models"] });
    },
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentialId: string) => {
      const resp = await fetch(`/api/credentials/${credentialId}`, { method: "DELETE" });
      if (!resp.ok) throw new Error("Failed to delete credential");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      queryClient.invalidateQueries({ queryKey: ["available-models"] });
    },
  });
}

export function useCheckProviderHealth() {
  return useMutation({
    mutationFn: async (provider: string) => {
      const resp = await fetch("/api/credentials/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      return resp.json() as Promise<{ status: string; message: string }>;
    },
  });
}

// Missions
export function useMissions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "missions"],
    queryFn: async () => {
      const response = await apiClientRaw<Mission[]>(
        `/api/projects/${projectId}/missions`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useMission(missionId: string) {
  return useQuery({
    queryKey: ["missions", missionId],
    queryFn: () => apiClient<Mission>(`/api/missions/${missionId}`),
    enabled: !!missionId,
  });
}

export function useCreateMission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { projectId: string; title: string }) =>
      apiClient<Mission>(`/api/projects/${data.projectId}/missions`, {
        method: "POST",
        body: JSON.stringify({ title: data.title }),
      }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", mission.projectId, "missions"],
      });
    },
  });
}

// Tasks
export function useTasks(sessionId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId, "tasks"],
    queryFn: async () => {
      const response = await apiClientRaw<Task[]>(
        `/api/sessions/${sessionId}/tasks`
      );
      return response.data;
    },
    enabled: !!sessionId,
  });
}

export function useMissionTasks(missionId: string) {
  return useQuery({
    queryKey: ["missions", missionId, "tasks"],
    queryFn: async () => {
      const response = await apiClientRaw<Task[]>(
        `/api/missions/${missionId}/tasks`
      );
      return response.data;
    },
    enabled: !!missionId,
  });
}

// Processes
export function useProcesses(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "processes"],
    queryFn: async () => {
      const response = await apiClientRaw<Process[]>(
        `/api/projects/${projectId}/processes`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useProcess(processId: string) {
  return useQuery({
    queryKey: ["processes", processId],
    queryFn: () => apiClient<Process>(`/api/processes/${processId}`),
    enabled: !!processId,
  });
}

export interface ProcessOutput {
  id: number;
  processId: string;
  timestamp: number;
  data: string;
  stream: "stdout" | "stderr";
}

export function useProcessOutput(processId: string) {
  return useQuery({
    queryKey: ["processes", processId, "output"],
    queryFn: async () => {
      const response = await apiClientRaw<ProcessOutput[]>(
        `/api/processes/${processId}/output`
      );
      return response.data;
    },
    enabled: !!processId,
  });
}

export function useSpawnProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      type,
      command,
      cwd,
      scope,
      scopeId,
      label,
      createdBy,
    }: {
      projectId: string;
      type: "command" | "service";
      command: string;
      cwd?: string;
      scope: "task" | "mission" | "project";
      scopeId: string;
      label?: string;
      createdBy: string;
    }) =>
      apiClient<Process>(`/api/projects/${projectId}/processes`, {
        method: "POST",
        body: JSON.stringify({
          type,
          command,
          cwd,
          scope,
          scopeId,
          label,
          createdBy,
        }),
      }),
    onSuccess: (process) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", process.projectId, "processes"],
      });
    },
  });
}

export function useKillProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ processId }: { processId: string }) =>
      apiClient<{ success: boolean }>(`/api/processes/${processId}/kill`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processes"] });
    },
  });
}

export function useWriteToProcess() {
  return useMutation({
    mutationFn: ({ processId, data }: { processId: string; data: string }) =>
      apiClient<{ success: boolean }>(`/api/processes/${processId}/write`, {
        method: "POST",
        body: JSON.stringify({ data }),
      }),
  });
}

export function useResizeProcess() {
  return useMutation({
    mutationFn: ({
      processId,
      cols,
      rows,
    }: {
      processId: string;
      cols: number;
      rows: number;
    }) =>
      apiClient<{ success: boolean }>(`/api/processes/${processId}/resize`, {
        method: "POST",
        body: JSON.stringify({ cols, rows }),
      }),
  });
}

// Files
export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: number;
  isHidden?: boolean;
}

export interface FileContent {
  content: string;
  path: string;
  size: number;
  modified: number;
}

export function useFiles(projectId: string, dirPath: string = "") {
  return useQuery({
    queryKey: ["projects", projectId, "files", dirPath],
    queryFn: async () => {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const response = await apiClientRaw<FileEntry[]>(
        `/api/projects/${projectId}/files${params}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

/**
 * Get all files in project recursively for file palette
 */
export function useFileTree(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "files", "tree"],
    queryFn: async () => {
      const response = await apiClientRaw<string[]>(
        `/api/projects/${projectId}/files/tree`
      );
      return response.data;
    },
    enabled: !!projectId,
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useFolderDetails(projectId: string, folderPath: string = "", commit?: string) {
  return useQuery({
    queryKey: ["projects", projectId, "folders", folderPath, commit],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (folderPath) searchParams.set("path", folderPath);
      if (commit) searchParams.set("commit", commit);
      const queryString = searchParams.toString();
      const response = await apiClientRaw<FolderDetails>(
        `/api/projects/${projectId}/folders${queryString ? `?${queryString}` : ""}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useFileContent(projectId: string, path: string, commit?: string) {
  return useQuery({
    queryKey: ["projects", projectId, "files", path, "content", commit],
    queryFn: () => {
      const queryString = commit ? `?commit=${encodeURIComponent(commit)}` : "";
      return apiClient<FileContent>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}${queryString}`
      );
    },
    enabled: !!projectId && !!path,
  });
}

export function useSaveFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      path,
      content,
    }: {
      projectId: string;
      path: string;
      content: string;
    }) =>
      apiClient<{ path: string; size: number; modified: number }>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content }),
        }
      ),
    onSuccess: (_, { projectId, path }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files", path, "content"],
      });
      // Invalidate git status since file changed
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useCreateFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      path,
      content = "",
    }: {
      projectId: string;
      path: string;
      content?: string;
    }) =>
      apiClient<{ path: string; size: number; modified: number }>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
      // Invalidate git status since file was created
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, path }: { projectId: string; path: string }) =>
      apiClient<{ success: boolean }>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}`,
        {
          method: "DELETE",
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
      // Invalidate git status since file was deleted
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      path,
      newPath,
    }: {
      projectId: string;
      path: string;
      newPath: string;
    }) =>
      apiClient<{ path: string }>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}/move`,
        {
          method: "POST",
          body: JSON.stringify({ destination: newPath }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
      // Invalidate git status since file was renamed
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      targetPath,
      files,
    }: {
      projectId: string;
      targetPath: string;
      files: File[];
    }) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }

      const API_BASE = import.meta.env.VITE_API_URL || "";
      const encodedPath = targetPath ? encodeURIComponent(targetPath) : "";
      const url = `${API_BASE}/api/projects/${projectId}/upload/${encodedPath}`;

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Upload failed");
      }

      return data.data as { uploaded: string[]; count: number };
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      path,
    }: {
      projectId: string;
      path: string;
    }) =>
      apiClient<{ path: string }>(
        `/api/projects/${projectId}/folders/${encodeURIComponent(path)}`,
        {
          method: "POST",
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
    },
  });
}

// Agents
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  prompt?: string;
  tools: string[];
  modelId?: string | null;
  maxSteps?: number | null;
  temperature?: number | null;
  isBuiltin: boolean;
  hidden?: boolean;
}

export function useAgents(projectId?: string) {
  return useQuery({
    queryKey: ["agents", projectId],
    queryFn: async () => {
      const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const response = await apiClientRaw<AgentConfig[]>(`/api/agents${params}`);
      return response.data;
    },
  });
}

export function useAgent(name: string, projectId?: string) {
  return useQuery({
    queryKey: ["agents", projectId, name],
    queryFn: async () => {
      const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const response = await apiClientRaw<AgentConfig>(`/api/agents/${encodeURIComponent(name)}${params}`);
      return response.data;
    },
    enabled: !!name,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { projectId: string; name: string; description?: string; prompt?: string; modelId?: string; tools?: string[]; saveToYaml?: boolean }) => {
      return apiClient<AgentConfig>("/api/agents", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.projectId] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { projectId: string; name: string; description?: string; prompt?: string; modelId?: string; tools?: string[] }) => {
      return apiClient<AgentConfig>(`/api/agents/${encodeURIComponent(data.name)}`, { method: "PUT", body: JSON.stringify(data) });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.projectId] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { projectId: string; name: string }) => {
      return apiClient<{ deleted: boolean }>(`/api/agents/${encodeURIComponent(data.name)}?projectId=${encodeURIComponent(data.projectId)}`, { method: "DELETE" });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.projectId] });
    },
  });
}

// Services
import type { Service } from "./types";

export function useServices(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "services"],
    queryFn: async () => {
      const response = await apiClientRaw<Service[]>(
        `/api/projects/${projectId}/services`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useService(serviceId: string) {
  return useQuery({
    queryKey: ["services", serviceId],
    queryFn: () => apiClient<Service>(`/api/services/${serviceId}`),
    enabled: !!serviceId,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      command,
      cwd,
      autoStart,
      enabled,
      createdBy,
    }: {
      projectId: string;
      name: string;
      command: string;
      cwd?: string;
      autoStart?: boolean;
      enabled?: boolean;
      createdBy: string;
    }) =>
      apiClient<Service>(`/api/projects/${projectId}/services`, {
        method: "POST",
        body: JSON.stringify({
          name,
          command,
          cwd,
          autoStart,
          enabled,
          createdBy,
        }),
      }),
    onSuccess: (service) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", service.projectId, "services"],
      });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      name,
      command,
      cwd,
      autoStart,
      enabled,
    }: {
      serviceId: string;
      name?: string;
      command?: string;
      cwd?: string | null;
      autoStart?: boolean;
      enabled?: boolean;
    }) =>
      apiClient<Service>(`/api/services/${serviceId}`, {
        method: "PUT",
        body: JSON.stringify({ name, command, cwd, autoStart, enabled }),
      }),
    onSuccess: (service) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", service.projectId, "services"],
      });
      queryClient.invalidateQueries({
        queryKey: ["services", service.id],
      });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId }: { serviceId: string }) =>
      apiClient<{ success: boolean }>(`/api/services/${serviceId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useStartService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId }: { serviceId: string }) =>
      apiClient<{ processId: string; status: string }>(
        `/api/services/${serviceId}/start`,
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["processes"] });
    },
  });
}

export function useStopService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId }: { serviceId: string }) =>
      apiClient<{ status: string }>(`/api/services/${serviceId}/stop`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["processes"] });
    },
  });
}

export function useRestartService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serviceId }: { serviceId: string }) =>
      apiClient<{ processId: string; status: string }>(
        `/api/services/${serviceId}/restart`,
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["processes"] });
    },
  });
}

// Git
import type { GitStatus, BranchInfo, CommitInfo, CommitResult, CloneResult } from "./types";

export function useGitStatus(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "status"],
    queryFn: async () => {
      const response = await apiClientRaw<GitStatus>(
        `/api/projects/${projectId}/git/status`
      );
      return response.data;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Poll as fallback every 30 seconds (immediate updates on file operations)
  });
}

export function useGitBranches(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "branches"],
    queryFn: async () => {
      const response = await apiClientRaw<BranchInfo[]>(
        `/api/projects/${projectId}/git/branches`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useGitLog(projectId: string, limit: number = 20) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "log", limit],
    queryFn: async () => {
      const response = await apiClientRaw<CommitInfo[]>(
        `/api/projects/${projectId}/git/log?limit=${limit}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useGitDiff(projectId: string, file?: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "diff", file],
    queryFn: async () => {
      const params = file ? `?file=${encodeURIComponent(file)}` : "";
      const response = await apiClientRaw<{ diff: string }>(
        `/api/projects/${projectId}/git/diff${params}`
      );
      return response.data.diff;
    },
    enabled: !!projectId,
  });
}

export function useGitCommit(projectId: string, hash: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "commits", hash],
    queryFn: () =>
      apiClient<CommitInfo>(`/api/projects/${projectId}/git/commits/${hash}`),
    enabled: !!projectId && !!hash,
  });
}

export function useGitCommitDiff(projectId: string, hash: string, file?: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "commits", hash, "diff", file],
    queryFn: async () => {
      const params = file ? `?file=${encodeURIComponent(file)}` : "";
      const response = await apiClientRaw<{ diff: string }>(
        `/api/projects/${projectId}/git/commits/${hash}/diff${params}`
      );
      return response.data.diff;
    },
    enabled: !!projectId && !!hash,
  });
}

export function useCheckoutBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, branch }: { projectId: string; branch: string }) =>
      apiClient<{ branch: string; status: GitStatus }>(
        `/api/projects/${projectId}/git/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ branch }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git"],
      });
    },
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      from,
    }: {
      projectId: string;
      name: string;
      from?: string;
    }) =>
      apiClient<BranchInfo>(`/api/projects/${projectId}/git/branches`, {
        method: "POST",
        body: JSON.stringify({ name, from }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "branches"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      force = false,
    }: {
      projectId: string;
      name: string;
      force?: boolean;
    }) =>
      apiClient<{ deleted: string }>(
        `/api/projects/${projectId}/git/branches/${encodeURIComponent(name)}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "branches"],
      });
    },
  });
}

export function useCreateCommit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, message }: { projectId: string; message: string }) => {
      // Create the commit
      const result = await apiClient<CommitResult>(`/api/projects/${projectId}/git/commit`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });

      // Trigger sync to push the new commit (fire and forget)
      apiClient<GitSyncStatus>(`/api/projects/${projectId}/git/sync`, {
        method: "POST",
      }).catch(() => {
        // Ignore sync errors - will be shown in UI via status poll
      });

      return result;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git"],
      });
    },
  });
}

export function useGitPush() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      remote = "origin",
      branch,
      setUpstream = false,
    }: {
      projectId: string;
      remote?: string;
      branch?: string;
      setUpstream?: boolean;
    }) =>
      apiClient<{ pushed: boolean }>(`/api/projects/${projectId}/git/push`, {
        method: "POST",
        body: JSON.stringify({ remote, branch, setUpstream }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useGitPull() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      remote = "origin",
      branch,
    }: {
      projectId: string;
      remote?: string;
      branch?: string;
    }) =>
      apiClient<{ files: string[]; summary: { changes: number; insertions: number; deletions: number } }>(
        `/api/projects/${projectId}/git/pull`,
        {
          method: "POST",
          body: JSON.stringify({ remote, branch }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
    },
  });
}

export function useGitFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      remote = "origin",
    }: {
      projectId: string;
      remote?: string;
    }) =>
      apiClient<{ fetched: boolean }>(`/api/projects/${projectId}/git/fetch`, {
        method: "POST",
        body: JSON.stringify({ remote }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
    },
  });
}

export function useDiscardChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      file,
      all = false,
    }: {
      projectId: string;
      file?: string;
      all?: boolean;
    }) =>
      apiClient<{ discarded: boolean }>(`/api/projects/${projectId}/git/discard`, {
        method: "POST",
        body: JSON.stringify({ file, all }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git", "diff"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
    },
  });
}

export function useCloneProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      url,
      name,
      path,
      branch,
      ownerId,
    }: {
      url: string;
      name?: string;
      path?: string;
      branch?: string;
      ownerId: string;
    }) =>
      apiClient<{ project: Project; clone: CloneResult }>("/api/projects/clone", {
        method: "POST",
        body: JSON.stringify({ url, name, path, branch, ownerId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Git Sync

import type { GitSyncStatus } from "./types";

export function useGitSyncStatus(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "git", "sync", "status"],
    queryFn: async () => {
      const response = await apiClientRaw<GitSyncStatus>(
        `/api/projects/${projectId}/git/sync/status`
      );
      return response.data;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

export function useGitSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient<GitSyncStatus>(`/api/projects/${projectId}/git/sync`, {
        method: "POST",
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git"],
      });
    },
  });
}

export function useAbortRebase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient<GitSyncStatus>(`/api/projects/${projectId}/git/sync/abort-rebase`, {
        method: "POST",
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "git"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "files"],
      });
    },
  });
}

// ============================================
// GIT IDENTITY
// ============================================

export interface GitIdentity {
  publicKey: string;
  fingerprint: string;
  keyPath: string;
  instructions: {
    github: string;
    gitlab: string;
  };
}

export function useGitIdentity() {
  return useQuery({
    queryKey: ["git", "identity"],
    queryFn: async () => {
      const response = await apiClientRaw<GitIdentity>("/api/git/identity");
      return response.data;
    },
    staleTime: Infinity, // Identity doesn't change during session
  });
}

// ============================================================================
// Tools
// ============================================================================

export function useCoreTools() {
  return useQuery({
    queryKey: ["tools", "core"],
    queryFn: async () => {
      const response = await apiClientRaw<CoreTool[]>("/api/tools/core");
      return response.data;
    },
    staleTime: Infinity, // Core tools don't change during runtime
  });
}

// Backend Actions (for command palette)
import type { BackendAction, Workflow } from "./types";

export function useBackendActions() {
  return useQuery({
    queryKey: ["actions", "backend"],
    queryFn: async () => {
      const response = await apiClientRaw<BackendAction[]>("/api/tools/actions");
      return response.data;
    },
    staleTime: Infinity, // Actions don't change during runtime
  });
}

// ============================================
// WORKFLOWS
// ============================================

export function useWorkflows(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "workflows"],
    queryFn: async () => {
      const response = await apiClientRaw<Workflow[]>(
        `/api/workflows?projectId=${encodeURIComponent(projectId)}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useWorkflow(workflowId: string, projectId: string) {
  return useQuery({
    queryKey: ["workflows", workflowId],
    queryFn: async () => {
      const response = await apiClient<Workflow>(
        `/api/workflows/${workflowId}?projectId=${encodeURIComponent(projectId)}`
      );
      return response;
    },
    enabled: !!workflowId && !!projectId,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      label,
      description,
    }: {
      projectId: string;
      name: string;
      label: string;
      description?: string;
    }) =>
      apiClient<Workflow>("/api/workflows", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          name,
          label,
          description: description || "",
        }),
      }),
    onSuccess: (_, variables) => {
      // Use refetchQueries to force immediate refetch
      queryClient.refetchQueries({
        queryKey: ["projects", variables.projectId, "workflows"],
      });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workflowId,
      projectId,
    }: {
      workflowId: string;
      projectId: string;
    }) =>
      apiClient<{ deleted: boolean }>(
        `/api/workflows/${workflowId}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (_, { projectId }) => {
      // Use refetchQueries to force immediate refetch
      queryClient.refetchQueries({
        queryKey: ["projects", projectId, "workflows"],
      });
    },
  });
}

// Templates
import type { TaskTemplateSummary, TaskTemplate } from "./types";

export function useTemplates(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "templates"],
    queryFn: async () => {
      const response = await apiClientRaw<TaskTemplateSummary[]>(
        `/api/templates?projectId=${encodeURIComponent(projectId)}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useTemplate(templateId: string, projectId: string) {
  return useQuery({
    queryKey: ["templates", templateId, projectId],
    queryFn: async () => {
      const response = await apiClient<TaskTemplate>(
        `/api/templates/${templateId}?projectId=${encodeURIComponent(projectId)}`
      );
      return response;
    },
    enabled: !!templateId && !!projectId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      id,
      name,
      description,
      agentClass,
      tools,
      systemPrompt,
    }: {
      projectId: string;
      id: string;
      name: string;
      description?: string;
      agentClass?: string;
      tools?: string[];
      systemPrompt?: string;
    }) =>
      apiClient<TaskTemplate>("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          id,
          name,
          description,
          agentClass,
          tools,
          systemPrompt,
        }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "templates"],
      });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      templateId,
      name,
      description,
      agentClass,
      tools,
      systemPrompt,
    }: {
      projectId: string;
      templateId: string;
      name?: string;
      description?: string;
      agentClass?: string;
      tools?: string[];
      systemPrompt?: string;
    }) =>
      apiClient<TaskTemplate>(`/api/templates/${templateId}`, {
        method: "PUT",
        body: JSON.stringify({
          projectId,
          name,
          description,
          agentClass,
          tools,
          systemPrompt,
        }),
      }),
    onSuccess: (_, { projectId, templateId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "templates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["templates", templateId],
      });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      templateId,
    }: {
      projectId: string;
      templateId: string;
    }) =>
      apiClient<{ deleted: boolean }>(
        `/api/templates/${templateId}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "templates"],
      });
    },
  });
}

// Filesystem browsing
export interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  isHidden: boolean;
  isGitRepo?: boolean;
  hasPackageJson?: boolean;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
  isGitRepo: boolean;
  hasPackageJson: boolean;
}

export interface ValidatePathResponse {
  valid: boolean;
  path: string;
  suggestedName?: string;
  isGitRepo?: boolean;
  hasPackageJson?: boolean;
  error?: string;
}

export function useBrowseDirectory(dirPath?: string) {
  return useQuery({
    queryKey: ["filesystem", "browse", dirPath],
    queryFn: async () => {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const response = await apiClientRaw<BrowseResponse>(
        `/api/filesystem/browse${params}`
      );
      return response.data;
    },
  });
}

export function useValidatePath() {
  return useMutation({
    mutationFn: ({ path }: { path: string }) =>
      apiClient<ValidatePathResponse>("/api/filesystem/validate", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  });
}

export function useGenerateCommitMessage() {
  return useMutation({
    mutationFn: ({
      projectId,
      diff,
      userId,
      providerId = "anthropic",
    }: {
      projectId: string;
      diff: string;
      userId: string;
      providerId?: "anthropic" | "openai" | "google";
    }) =>
      apiClient<{ message: string }>(`/api/projects/${projectId}/git/generate-message`, {
        method: "POST",
        body: JSON.stringify({ diff, userId, providerId }),
      }),
  });
}

// Skills

export function useSkills(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "skills"],
    queryFn: async () => {
      const response = await apiClientRaw<Skill[]>(
        `/api/projects/${projectId}/skills`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useSkillDetails(projectId: string, skillName: string) {
  return useQuery({
    queryKey: ["projects", projectId, "skills", skillName],
    queryFn: async () => {
      const response = await apiClientRaw<SkillDetails>(
        `/api/projects/${projectId}/skills/${encodeURIComponent(skillName)}`
      );
      return response.data;
    },
    enabled: !!projectId && !!skillName,
  });
}

// Installed Skills (from GitHub)

export function useInstalledSkills(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "skills", "installed"],
    queryFn: async () => {
      const response = await apiClientRaw<InstalledSkill[]>(
        `/api/projects/${projectId}/skills/installed`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useInstallSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      repo,
      ref,
    }: {
      projectId: string;
      repo: string;
      ref?: string;
    }) =>
      apiClient<SkillInstallResult>(
        `/api/projects/${projectId}/skills/install`,
        {
          method: "POST",
          body: JSON.stringify({ repo, ref }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "skills"],
      });
    },
  });
}

export function useUninstallSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, repo }: { projectId: string; repo: string }) =>
      apiClient<{ repo: string; uninstalled: boolean }>(
        `/api/projects/${projectId}/skills/installed/${encodeURIComponent(repo)}`,
        {
          method: "DELETE",
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "skills"],
      });
    },
  });
}

export function useToggleSkillEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      repo,
      enabled,
    }: {
      projectId: string;
      repo: string;
      enabled: boolean;
    }) =>
      apiClient<{ repo: string; enabled: boolean }>(
        `/api/projects/${projectId}/skills/installed/${encodeURIComponent(repo)}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "skills"],
      });
    },
  });
}

// ============================================
// SCHEDULES
// ============================================

import type { Schedule, ScheduleRun, ScheduleActionType, ActionConfig, WorkflowConfig } from "./types";

export function useSchedules(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "schedules"],
    queryFn: async () => {
      const response = await apiClientRaw<Schedule[]>(
        `/api/projects/${projectId}/schedules`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useSchedule(scheduleId: string, projectId: string) {
  return useQuery({
    queryKey: ["schedules", scheduleId],
    queryFn: () =>
      apiClient<Schedule>(
        `/api/schedules/${scheduleId}?projectId=${encodeURIComponent(projectId)}`
      ),
    enabled: !!scheduleId && !!projectId,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      name,
      description,
      actionType,
      actionConfig,
      cronExpression,
      timezone,
      enabled,
      maxRuntimeMs,
    }: {
      projectId: string;
      name: string;
      description?: string;
      actionType: ScheduleActionType;
      actionConfig: ActionConfig | WorkflowConfig;
      cronExpression: string;
      timezone?: string;
      enabled?: boolean;
      maxRuntimeMs?: number;
    }) =>
      apiClient<Schedule>(`/api/projects/${projectId}/schedules`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          actionType,
          actionConfig,
          cronExpression,
          timezone,
          enabled,
          maxRuntimeMs,
        }),
      }),
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", schedule.projectId, "schedules"],
      });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scheduleId,
      projectId,
      name,
      description,
      actionConfig,
      cronExpression,
      timezone,
      enabled,
      maxRuntimeMs,
    }: {
      scheduleId: string;
      projectId: string;
      name?: string;
      description?: string | null;
      actionConfig?: ActionConfig | WorkflowConfig;
      cronExpression?: string;
      timezone?: string;
      enabled?: boolean;
      maxRuntimeMs?: number;
    }) =>
      apiClient<Schedule>(`/api/schedules/${scheduleId}`, {
        method: "PUT",
        body: JSON.stringify({
          projectId,
          name,
          description,
          actionConfig,
          cronExpression,
          timezone,
          enabled,
          maxRuntimeMs,
        }),
      }),
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", schedule.projectId, "schedules"],
      });
      queryClient.invalidateQueries({
        queryKey: ["schedules", schedule.id],
      });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scheduleId,
      projectId,
    }: {
      scheduleId: string;
      projectId: string;
    }) =>
      apiClient<{ deleted: boolean }>(
        `/api/schedules/${scheduleId}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "schedules"],
      });
    },
  });
}

export function useEnableSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scheduleId,
      projectId,
    }: {
      scheduleId: string;
      projectId: string;
    }) =>
      apiClient<Schedule>(
        `/api/schedules/${scheduleId}/enable?projectId=${encodeURIComponent(projectId)}`,
        { method: "POST" }
      ),
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", schedule.projectId, "schedules"],
      });
      queryClient.invalidateQueries({
        queryKey: ["schedules", schedule.id],
      });
    },
  });
}

export function useDisableSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scheduleId,
      projectId,
    }: {
      scheduleId: string;
      projectId: string;
    }) =>
      apiClient<Schedule>(
        `/api/schedules/${scheduleId}/disable?projectId=${encodeURIComponent(projectId)}`,
        { method: "POST" }
      ),
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", schedule.projectId, "schedules"],
      });
      queryClient.invalidateQueries({
        queryKey: ["schedules", schedule.id],
      });
    },
  });
}

export function useTriggerSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scheduleId,
      projectId,
    }: {
      scheduleId: string;
      projectId: string;
    }) =>
      apiClient<{ triggered: boolean; runId: string }>(
        `/api/schedules/${scheduleId}/run?projectId=${encodeURIComponent(projectId)}`,
        { method: "POST" }
      ),
    onSuccess: (_, { projectId, scheduleId }) => {
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "schedules"],
      });
      queryClient.invalidateQueries({
        queryKey: ["schedules", scheduleId, "runs"],
      });
    },
  });
}

export function useScheduleRuns(scheduleId: string, projectId: string) {
  return useQuery({
    queryKey: ["schedules", scheduleId, "runs"],
    queryFn: async () => {
      const response = await apiClientRaw<ScheduleRun[]>(
        `/api/schedules/${scheduleId}/runs?projectId=${encodeURIComponent(projectId)}`
      );
      return response.data;
    },
    enabled: !!scheduleId && !!projectId,
  });
}

export function useValidateCron() {
  return useMutation({
    mutationFn: ({ expression }: { expression: string }) =>
      apiClient<{ valid: boolean; error?: string; nextRun: number | null }>(
        "/api/schedules/validate-cron",
        {
          method: "POST",
          body: JSON.stringify({ expression }),
        }
      ),
  });
}
