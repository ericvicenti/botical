/**
 * Task Query Definitions
 *
 * Queries and mutations for task operations.
 * Tasks are project-scoped and support real-time updates.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  TaskService,
  type Task,
  type TaskCreateInput,
  type TaskUpdateInput,
  type TaskStatus,
  type TaskActor,
} from "../services/tasks.ts";

// ============================================
// Query Result Types
// ============================================

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
  data: TaskCreateInput;
}

export interface TasksUpdateParams {
  projectId: string;
  taskId: string;
  data: TaskUpdateInput;
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
    status: "pending" | "in_progress" | "completed";
  }>;
}

// ============================================
// Helper Functions
// ============================================

function toTaskQueryResult(task: Task): TaskQueryResult {
  return {
    id: task.id,
    sessionId: task.sessionId,
    missionId: task.missionId,
    title: task.title,
    activeForm: task.activeForm,
    status: task.status,
    position: task.position,
    createdBy: task.createdBy,
    assignedTo: task.assignedTo,
    parentTaskId: task.parentTaskId,
    description: task.description,
    result: task.result,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List tasks for a session
 */
export const tasksListBySessionQuery = defineQuery<TaskQueryResult[], TasksListBySessionParams>({
  name: "tasks.listbysession",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const tasks = TaskService.listBySession(db, params.sessionId, {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    return tasks.map(toTaskQueryResult);
  },

  cache: {
    ttl: 5_000, // 5 seconds - tasks update frequently
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
});

/**
 * List tasks for a mission
 */
export const tasksListByMissionQuery = defineQuery<TaskQueryResult[], TasksListByMissionParams>({
  name: "tasks.listbymission",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const tasks = TaskService.listByMission(db, params.missionId, {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    return tasks.map(toTaskQueryResult);
  },

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
});

/**
 * Get a single task by ID
 */
export const tasksGetQuery = defineQuery<TaskQueryResult, TasksGetParams>({
  name: "tasks.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const task = TaskService.getByIdOrThrow(db, params.taskId);
    return toTaskQueryResult(task);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["tasks.get", params.projectId, params.taskId],
  },

  realtime: {
    events: ["task.updated", "task.deleted"],
  },

  description: "Get a single task by ID",
});

/**
 * Count tasks by session
 */
export const tasksCountBySessionQuery = defineQuery<number, TasksCountBySessionParams>({
  name: "tasks.countbysession",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return TaskService.count(db, params.sessionId, params.status);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["tasks.countbysession", params.projectId, params.sessionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },

  description: "Count tasks for a session",
});

/**
 * Count tasks by mission
 */
export const tasksCountByMissionQuery = defineQuery<number, TasksCountByMissionParams>({
  name: "tasks.countbymission",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return TaskService.countByMission(db, params.missionId, params.status);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["tasks.countbymission", params.projectId, params.missionId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },

  description: "Count tasks for a mission",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a task
 */
export const tasksCreateMutation = defineMutation<TasksCreateParams, TaskQueryResult>({
  name: "tasks.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const task = TaskService.create(db, params.sessionId, params.data);
    return toTaskQueryResult(task);
  },

  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],

  description: "Create a new task",
});

/**
 * Update a task
 */
export const tasksUpdateMutation = defineMutation<TasksUpdateParams, TaskQueryResult>({
  name: "tasks.update",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const task = TaskService.update(db, params.taskId, params.data);
    return toTaskQueryResult(task);
  },

  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],
  invalidateKeys: (params) => [
    ["tasks.get", params.projectId, params.taskId],
  ],

  description: "Update an existing task",
});

/**
 * Delete a task
 */
export const tasksDeleteMutation = defineMutation<TasksDeleteParams, { deleted: boolean }>({
  name: "tasks.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    TaskService.delete(db, params.taskId);
    return { deleted: true };
  },

  invalidates: ["tasks.listbysession", "tasks.listbymission", "tasks.countbysession", "tasks.countbymission"],
  invalidateKeys: (params) => [
    ["tasks.get", params.projectId, params.taskId],
  ],

  description: "Delete a task",
});

/**
 * Replace all tasks for a session (batch operation)
 */
export const tasksBatchReplaceMutation = defineMutation<TasksBatchReplaceParams, TaskQueryResult[]>({
  name: "tasks.batchreplace",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const tasks = TaskService.replaceBatch(db, params.sessionId, params.tasks);
    return tasks.map(toTaskQueryResult);
  },

  invalidates: ["tasks.listbysession", "tasks.countbysession", "tasks.countbymission"],

  description: "Replace all tasks for a session",
});
