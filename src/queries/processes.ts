/**
 * Process Query Definitions
 *
 * Queries and mutations for process management.
 * Processes are project-scoped with PTY support.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import { ProjectService } from "../services/projects.ts";
import {
  ProcessService,
  type Process,
  type ProcessOutput,
  type ProcessType,
  type ProcessStatus,
  type ProcessScope,
} from "../services/processes.ts";

// ============================================
// Query Result Types
// ============================================

/**
 * Process returned by queries
 */
export interface ProcessQueryResult {
  id: string;
  projectId: string;
  type: ProcessType;
  command: string;
  cwd: string;
  env: Record<string, string> | null;
  cols: number;
  rows: number;
  scope: ProcessScope;
  scopeId: string;
  status: ProcessStatus;
  exitCode: number | null;
  label: string | null;
  serviceId: string | null;
  logPath: string | null;
  createdBy: string;
  createdAt: number;
  startedAt: number;
  endedAt: number | null;
}

/**
 * Process output returned by queries
 */
export interface ProcessOutputQueryResult {
  id: number;
  processId: string;
  timestamp: number;
  data: string;
  stream: "stdout" | "stderr";
}

// ============================================
// Query Parameters
// ============================================

export interface ProcessesListParams {
  projectId: string;
  type?: ProcessType;
  status?: ProcessStatus;
  scope?: ProcessScope;
  scopeId?: string;
  limit?: number;
  offset?: number;
}

export interface ProcessesGetParams {
  projectId: string;
  processId: string;
}

export interface ProcessesCountParams {
  projectId: string;
  type?: ProcessType;
  status?: ProcessStatus;
}

export interface ProcessOutputParams {
  projectId: string;
  processId: string;
  limit?: number;
  offset?: number;
  since?: number;
}

export interface ProcessOutputTextParams {
  projectId: string;
  processId: string;
  limit?: number;
  offset?: number;
  since?: number;
}

export interface ProcessesListRunningParams {
  // No params needed, lists all running across projects
}

// ============================================
// Mutation Parameters
// ============================================

export interface ProcessesSpawnParams {
  projectId: string;
  type: ProcessType;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  scope: ProcessScope;
  scopeId: string;
  label?: string;
  serviceId?: string;
  createdBy: string;
}

export interface ProcessesKillParams {
  projectId: string;
  processId: string;
}

export interface ProcessesWriteParams {
  projectId: string;
  processId: string;
  data: string;
}

export interface ProcessesResizeParams {
  projectId: string;
  processId: string;
  cols: number;
  rows: number;
}

export interface ProcessesDeleteParams {
  projectId: string;
  processId: string;
}

export interface ProcessesTrimOutputParams {
  projectId: string;
  processId: string;
  keepCount: number;
}

export interface ProcessesKillByScopeParams {
  projectId: string;
  scope: ProcessScope;
  scopeId: string;
}

// ============================================
// Helper Functions
// ============================================

function toProcessQueryResult(process: Process): ProcessQueryResult {
  return {
    id: process.id,
    projectId: process.projectId,
    type: process.type,
    command: process.command,
    cwd: process.cwd,
    env: process.env,
    cols: process.cols,
    rows: process.rows,
    scope: process.scope,
    scopeId: process.scopeId,
    status: process.status,
    exitCode: process.exitCode,
    label: process.label,
    serviceId: process.serviceId,
    logPath: process.logPath,
    createdBy: process.createdBy,
    createdAt: process.createdAt,
    startedAt: process.startedAt,
    endedAt: process.endedAt,
  };
}

function toProcessOutputQueryResult(output: ProcessOutput): ProcessOutputQueryResult {
  return {
    id: output.id,
    processId: output.processId,
    timestamp: output.timestamp,
    data: output.data,
    stream: output.stream,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List processes for a project
 */
export const processesListQuery = defineQuery<ProcessQueryResult[], ProcessesListParams>({
  name: "processes.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const processes = ProcessService.listByProject(db, params.projectId, {
      type: params.type,
      status: params.status,
      scope: params.scope,
      scopeId: params.scopeId,
      limit: params.limit,
      offset: params.offset,
    });

    return processes.map(toProcessQueryResult);
  },

  cache: {
    ttl: 2_000, // Short TTL - process status changes frequently
    scope: "project",
    key: (params) => {
      const keyParts = ["processes.list", params.projectId];
      if (params.type) keyParts.push(`type:${params.type}`);
      if (params.status) keyParts.push(`status:${params.status}`);
      if (params.scope) keyParts.push(`scope:${params.scope}`);
      if (params.scopeId) keyParts.push(`scopeId:${params.scopeId}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["process.started", "process.completed", "process.killed", "process.deleted"],
  },

  description: "List processes for a project",
});

/**
 * Get a process by ID
 */
export const processesGetQuery = defineQuery<ProcessQueryResult, ProcessesGetParams>({
  name: "processes.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const process = ProcessService.getByIdOrThrow(db, params.processId);
    return toProcessQueryResult(process);
  },

  cache: {
    ttl: 2_000,
    scope: "project",
    key: (params) => ["processes.get", params.projectId, params.processId],
  },

  realtime: {
    events: ["process.completed", "process.killed", "process.output"],
  },

  description: "Get a process by ID",
});

/**
 * Count processes
 */
export const processesCountQuery = defineQuery<number, ProcessesCountParams>({
  name: "processes.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return ProcessService.count(db, params.projectId, {
      type: params.type,
      status: params.status,
    });
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["processes.count", params.projectId];
      if (params.type) keyParts.push(`type:${params.type}`);
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },

  description: "Count processes",
});

/**
 * List running processes across all projects
 */
export const processesListRunningQuery = defineQuery<ProcessQueryResult[], ProcessesListRunningParams>({
  name: "processes.listrunning",

  fetch: async (_params, _context: QueryContext) => {
    const rootDb = DatabaseManager.getRootDb();
    // Get all projects and check their running processes
    const projects = ProjectService.list(rootDb, {});
    const allRunning: ProcessQueryResult[] = [];

    for (const project of projects) {
      try {
        const db = DatabaseManager.getProjectDb(project.id);
        const running = ProcessService.listRunning(db);
        allRunning.push(...running.map(toProcessQueryResult));
      } catch {
        // Skip projects that can't be accessed
      }
    }

    return allRunning;
  },

  cache: {
    ttl: 2_000,
    scope: "global",
    key: () => ["processes.listrunning"],
  },

  realtime: {
    events: ["process.started", "process.completed", "process.killed"],
  },

  description: "List running processes across all projects",
});

/**
 * Get process output
 */
export const processOutputQuery = defineQuery<ProcessOutputQueryResult[], ProcessOutputParams>({
  name: "processes.output",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const output = ProcessService.getOutput(db, params.processId, {
      limit: params.limit,
      offset: params.offset,
      since: params.since,
    });
    return output.map(toProcessOutputQueryResult);
  },

  cache: {
    ttl: 1_000, // Very short - output updates continuously
    scope: "project",
    key: (params) => {
      const keyParts = ["processes.output", params.projectId, params.processId];
      if (params.since) keyParts.push(`since:${params.since}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["process.output"],
  },

  description: "Get process output",
});

/**
 * Get process output as text
 */
export const processOutputTextQuery = defineQuery<string, ProcessOutputTextParams>({
  name: "processes.output.text",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return ProcessService.getOutputText(db, params.processId, {
      limit: params.limit,
      offset: params.offset,
      since: params.since,
    });
  },

  cache: {
    ttl: 1_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["processes.output.text", params.projectId, params.processId];
      if (params.since) keyParts.push(`since:${params.since}`);
      return keyParts;
    },
  },

  realtime: {
    events: ["process.output"],
  },

  description: "Get process output as text",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Spawn a new process
 */
export const processesSpawnMutation = defineMutation<ProcessesSpawnParams, ProcessQueryResult>({
  name: "processes.spawn",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getByIdOrThrow(rootDb, params.projectId);

    if (!project.path) {
      throw new Error(`Project ${params.projectId} does not have a local path`);
    }

    const process = ProcessService.spawn(
      db,
      {
        projectId: params.projectId,
        type: params.type,
        command: params.command,
        cwd: params.cwd,
        env: params.env,
        cols: params.cols ?? 80,
        rows: params.rows ?? 24,
        scope: params.scope,
        scopeId: params.scopeId,
        label: params.label,
        serviceId: params.serviceId,
        logPath: params.serviceId
          ? ProcessService.getLogPath(project.path, params.serviceId)
          : undefined,
        createdBy: params.createdBy,
      },
      project.path
    );
    return toProcessQueryResult(process);
  },

  invalidates: ["processes.list", "processes.listrunning", "processes.count"],

  description: "Spawn a new process",
});

/**
 * Kill a running process
 */
export const processesKillMutation = defineMutation<ProcessesKillParams, { killed: boolean }>({
  name: "processes.kill",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    ProcessService.kill(db, params.processId);
    return { killed: true };
  },

  invalidates: ["processes.list", "processes.listrunning", "processes.count"],
  invalidateKeys: (params) => [
    ["processes.get", params.projectId, params.processId],
  ],

  description: "Kill a running process",
});

/**
 * Write to process stdin
 */
export const processesWriteMutation = defineMutation<ProcessesWriteParams, { written: boolean }>({
  name: "processes.write",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    ProcessService.write(db, params.processId, params.data);
    return { written: true };
  },

  // No invalidation needed - output is streamed via realtime events

  description: "Write to process stdin",
});

/**
 * Resize process terminal
 */
export const processesResizeMutation = defineMutation<ProcessesResizeParams, { resized: boolean }>({
  name: "processes.resize",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    ProcessService.resize(db, params.processId, params.cols, params.rows);
    return { resized: true };
  },

  invalidateKeys: (params) => [
    ["processes.get", params.projectId, params.processId],
  ],

  description: "Resize process terminal",
});

/**
 * Delete a process and its output
 */
export const processesDeleteMutation = defineMutation<ProcessesDeleteParams, { deleted: boolean }>({
  name: "processes.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    ProcessService.delete(db, params.processId);
    return { deleted: true };
  },

  invalidates: ["processes.list", "processes.count"],
  invalidateKeys: (params) => [
    ["processes.get", params.projectId, params.processId],
    ["processes.output", params.projectId, params.processId],
    ["processes.output.text", params.projectId, params.processId],
  ],

  description: "Delete a process and its output",
});

/**
 * Trim process output to keep only recent entries
 */
export const processesTrimOutputMutation = defineMutation<ProcessesTrimOutputParams, { trimmed: number }>({
  name: "processes.output.trim",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const trimmed = ProcessService.trimOutput(db, params.processId, params.keepCount);
    return { trimmed };
  },

  invalidateKeys: (params) => [
    ["processes.output", params.projectId, params.processId],
    ["processes.output.text", params.projectId, params.processId],
  ],

  description: "Trim process output",
});

/**
 * Kill all processes for a scope
 */
export const processesKillByScopeMutation = defineMutation<ProcessesKillByScopeParams, { killed: number }>({
  name: "processes.kill.byscope",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const killed = ProcessService.killByScope(db, params.scope, params.scopeId);
    return { killed };
  },

  invalidates: ["processes.list", "processes.listrunning", "processes.count"],

  description: "Kill all processes for a scope",
});
