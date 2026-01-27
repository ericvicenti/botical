import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "./client";
import type { Project, Session, Mission, Task, Process, MessageWithParts, MessagePart, FolderDetails, CoreTool, Skill, SkillDetails } from "./types";

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
  // Experiments
  exeEnabled?: boolean;
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
      apiKey,
    }: {
      projectId: string;
      diff: string;
      userId: string;
      providerId?: "anthropic" | "openai" | "google";
      apiKey?: string;
    }) =>
      apiClient<{ message: string }>(`/api/projects/${projectId}/git/generate-message`, {
        method: "POST",
        body: JSON.stringify({ diff, userId, providerId, apiKey }),
      }),
  });
}

// Exe.dev VMs
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

export function useExeStatus() {
  return useQuery({
    queryKey: ["exe", "status"],
    queryFn: async () => {
      const response = await apiClientRaw<ExeStatus>("/api/exe/status");
      return response.data;
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}

export function useExeVMs() {
  return useQuery({
    queryKey: ["exe", "vms"],
    queryFn: async () => {
      const response = await apiClientRaw<ExeVM[]>("/api/exe/vms");
      return response.data;
    },
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

export function useCreateExeVM() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; image?: string } = {}) =>
      apiClient<ExeVM>("/api/exe/vms", {
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
      apiClient<{ success: boolean }>(`/api/exe/vms/${name}`, {
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
      apiClient<{ success: boolean }>(`/api/exe/vms/${name}/restart`, {
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
      apiClient<ExeExecResult>(`/api/exe/vms/${name}/exec`, {
        method: "POST",
        body: JSON.stringify({ command, timeout }),
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
