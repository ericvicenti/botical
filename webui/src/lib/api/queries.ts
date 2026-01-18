import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiClientRaw } from "./client";
import type { Project, Session, Mission, Task, Process, MessageWithParts } from "./types";

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

// Sessions
export function useSessions(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "sessions"],
    queryFn: async () => {
      const response = await apiClientRaw<Session[]>(
        `/api/projects/${projectId}/sessions`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId],
    queryFn: () => apiClient<Session>(`/api/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { projectId: string; title: string; agent?: string }) =>
      apiClient<Session>(`/api/projects/${data.projectId}/sessions`, {
        method: "POST",
        body: JSON.stringify({ title: data.title, agent: data.agent }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "sessions"] });
    },
  });
}

export function useArchiveSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient(`/api/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Messages
export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: ["sessions", sessionId, "messages"],
    queryFn: async () => {
      const response = await apiClientRaw<MessageWithParts[]>(
        `/api/sessions/${sessionId}/messages`
      );
      return response.data;
    },
    enabled: !!sessionId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { sessionId: string; content: string }) =>
      apiClient<MessageWithParts>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          sessionId: data.sessionId,
          content: data.content,
        }),
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] });
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
