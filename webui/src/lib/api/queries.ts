import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "./client";
import type { Project, Session, Mission, Task, Process, MessageWithParts, MessagePart, FolderDetails } from "./types";

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
    mutationFn: (data: { projectId: string; title: string; agent?: string }) =>
      apiClient<Session>(`/api/sessions`, {
        method: "POST",
        body: JSON.stringify({
          projectId: data.projectId,
          title: data.title,
          agent: data.agent || "default",
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
      apiKey?: string;
      modelId?: string;
    }) =>
      apiClient<{ message: MessageWithParts; parts: MessagePart[] }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          projectId: data.projectId,
          sessionId: data.sessionId,
          content: data.content,
          userId: data.userId,
          providerId: data.providerId || "anthropic",
          apiKey: data.apiKey,
          modelId: data.modelId,
        }),
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
    },
  });
}

// Settings - stored in localStorage for now
const SETTINGS_KEY = "iris:settings";

export interface AppSettings {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  defaultProvider: "anthropic" | "openai" | "google";
  userId: string;
}

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  // Default settings with a generated userId
  return {
    defaultProvider: "anthropic",
    userId: `user-${Date.now()}`,
  };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

export function useFolderDetails(projectId: string, folderPath: string = "") {
  return useQuery({
    queryKey: ["projects", projectId, "folders", folderPath],
    queryFn: async () => {
      const params = folderPath ? `?path=${encodeURIComponent(folderPath)}` : "";
      const response = await apiClientRaw<FolderDetails>(
        `/api/projects/${projectId}/folders${params}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useFileContent(projectId: string, path: string) {
  return useQuery({
    queryKey: ["projects", projectId, "files", path, "content"],
    queryFn: () =>
      apiClient<FileContent>(
        `/api/projects/${projectId}/files/${encodeURIComponent(path)}`
      ),
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
  mode: "all" | "primary" | "subagent";
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
