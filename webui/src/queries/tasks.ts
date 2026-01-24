/**
 * Task Query Definitions (Frontend)
 *
 * Queries and mutations for task operations.
 * Tasks are project-scoped and support real-time updates.
 */

import type { Query, Mutation } from "./types";

// ============================================
// Types
// ============================================

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskActor = "user" | "agent";

/**
 * Task returned by queries
 */
export interface TaskQueryResult {
  id: string;
  sessionId: string;
  missionId: string | null;
  title: string;
  activeForm: string;
  status: TaskStatus;
  position: number;
  createdBy: TaskActor;
  assignedTo: TaskActor;
  parentTaskId: string | null;
  description: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ============================================
// Query Parameters
// ============================================

export interface TasksListBySessionParams {
  projectId: string;
  sessionId: string;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export interface TasksListByMissionParams {
  projectId: string;
  missionId: string;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export interface TasksGetParams {
  projectId: string;
  taskId: string;
}

export interface TasksCountBySessionParams {
  projectId: string;
  sessionId: string;
  status?: TaskStatus;
}

export interface TasksCountByMissionParams {
  projectId: string;
  missionId: string;
  status?: TaskStatus;
}

// ============================================
// Mutation Parameters
// ============================================

export interface TasksCreateParams {
  projectId: string;
  sessionId: string;
  data: {
    title: string;
    activeForm: string;
    status?: TaskStatus;
    missionId?: string | null;
    parentTaskId?: string | null;
    description?: string | null;
    createdBy?: TaskActor;
    assignedTo?: TaskActor;
  };
}

export interface TasksUpdateParams {
  projectId: string;
  taskId: string;
  data: {
    title?: string;
    activeForm?: string;
    status?: TaskStatus;
    missionId?: string | null;
    parentTaskId?: string | null;
    description?: string | null;
    result?: string | null;
    position?: number;
  };
}

export interface TasksDeleteParams {
  projectId: string;
  taskId: string;
}

export interface TasksBatchReplaceParams {
  projectId: string;
  sessionId: string;
  tasks: Array<{
    title: string;
    activeForm: string;
    status: TaskStatus;
  }>;
}

// ============================================
// Query Definitions
// ============================================

export const tasksListBySessionQuery: Query<TaskQueryResult[], TasksListBySessionParams> = {
  name: "tasks.listbysession",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}/tasks`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["tasks.listbysession", params.projectId, params.sessionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },
  realtime: {
    events: ["task.created", "task.updated", "task.deleted", "tasks.replaced"],
  },
  description: "List tasks for a session",
};

export const tasksListByMissionQuery: Query<TaskQueryResult[], TasksListByMissionParams> = {
  name: "tasks.listbymission",
  endpoint: (params) => `/api/projects/${params.projectId}/missions/${params.missionId}/tasks`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
    ...(params.limit && { limit: String(params.limit) }),
    ...(params.offset && { offset: String(params.offset) }),
  }),
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["tasks.listbymission", params.projectId, params.missionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },
  realtime: {
    events: ["task.created", "task.updated", "task.deleted", "tasks.replaced"],
  },
  description: "List tasks for a mission",
};

export const tasksGetQuery: Query<TaskQueryResult, TasksGetParams> = {
  name: "tasks.get",
  endpoint: (params) => `/api/projects/${params.projectId}/tasks/${params.taskId}`,
  method: "GET",
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["tasks.get", params.projectId, params.taskId],
  },
  realtime: {
    events: ["task.updated", "task.deleted"],
  },
  description: "Get a single task by ID",
};

export const tasksCountBySessionQuery: Query<{ count: number }, TasksCountBySessionParams> = {
  name: ""tasks.countbysession", "tasks.countbymission"bysession",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}/tasks/count`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
  }),
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = [""tasks.countbysession", "tasks.countbymission"bysession", params.projectId, params.sessionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },
  description: "Count tasks for a session",
};

export const tasksCountByMissionQuery: Query<{ count: number }, TasksCountByMissionParams> = {
  name: ""tasks.countbysession", "tasks.countbymission"bymission",
  endpoint: (params) => `/api/projects/${params.projectId}/missions/${params.missionId}/tasks/count`,
  method: "GET",
  params: (params) => ({
    ...(params.status && { status: params.status }),
  }),
  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = [""tasks.countbysession", "tasks.countbymission"bymission", params.projectId, params.missionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },
  description: "Count tasks for a mission",
};

// ============================================
// Mutation Definitions
// ============================================

export const tasksCreateMutation: Mutation<TasksCreateParams, TaskQueryResult> = {
  name: "tasks.create",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}/tasks`,
  method: "POST",
  body: (params) => params.data,
  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],
  description: "Create a new task",
};

export const tasksUpdateMutation: Mutation<TasksUpdateParams, TaskQueryResult> = {
  name: "tasks.update",
  endpoint: (params) => `/api/projects/${params.projectId}/tasks/${params.taskId}`,
  method: "PUT",
  body: (params) => params.data,
  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],
  invalidateKeys: (params) => [
    ["tasks.get", params.projectId, params.taskId],
  ],
  description: "Update an existing task",
};

export const tasksDeleteMutation: Mutation<TasksDeleteParams, { deleted: boolean }> = {
  name: "tasks.delete",
  endpoint: (params) => `/api/projects/${params.projectId}/tasks/${params.taskId}`,
  method: "DELETE",
  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],
  invalidateKeys: (params) => [
    ["tasks.get", params.projectId, params.taskId],
  ],
  description: "Delete a task",
};

export const tasksBatchReplaceMutation: Mutation<TasksBatchReplaceParams, TaskQueryResult[]> = {
  name: "tasks.batchreplace",
  endpoint: (params) => `/api/projects/${params.projectId}/sessions/${params.sessionId}/tasks/batch`,
  method: "PUT",
  body: (params) => ({ tasks: params.tasks }),
  invalidates: ["tasks.listbysession", "tasks.countbysession", "tasks.countbymission"],
  description: "Replace all tasks for a session",
};
