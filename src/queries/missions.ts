/**
 * Mission Query Definitions
 *
 * Queries and mutations for mission lifecycle management.
 * Missions follow a state machine pattern for plan-based execution.
 */

import { defineQuery, defineMutation } from "./define.ts";
import type { QueryContext, MutationContext } from "./types.ts";
import { DatabaseManager } from "../database/index.ts";
import {
  MissionService,
  type Mission,
  type MissionStatus,
} from "../services/missions.ts";

// ============================================
// Query Result Types
// ============================================

/**
 * Mission returned by queries
 */
export interface MissionQueryResult {
  id: string;
  projectId: string;
  sessionId: string | null;
  title: string;
  status: MissionStatus;
  planPath: string;
  planApprovedAt: number | null;
  planApprovedBy: string | null;
  createdAt: number;
  startedAt: number | null;
  pausedAt: number | null;
  completedAt: number | null;
  summary: string | null;
  completionCriteriaMet: boolean;
}

/**
 * Mission with plan content
 */
export interface MissionWithPlanResult extends MissionQueryResult {
  planContent: string;
}

// ============================================
// Query Parameters
// ============================================

export interface MissionsListParams {
  projectId: string;
  status?: MissionStatus;
  limit?: number;
  offset?: number;
}

export interface MissionsGetParams {
  projectId: string;
  missionId: string;
}

export interface MissionsCountParams {
  projectId: string;
  status?: MissionStatus;
}

export interface MissionsActiveParams {
  projectId: string;
}

// ============================================
// Mutation Parameters
// ============================================

export interface MissionsCreateParams {
  projectId: string;
  title: string;
  description?: string;
}

export interface MissionsApprovePlanParams {
  projectId: string;
  missionId: string;
  userId: string;
}

export interface MissionsStartParams {
  projectId: string;
  missionId: string;
  sessionId: string;
}

export interface MissionsPauseParams {
  projectId: string;
  missionId: string;
}

export interface MissionsResumeParams {
  projectId: string;
  missionId: string;
}

export interface MissionsCompleteParams {
  projectId: string;
  missionId: string;
  summary: string;
  criteriaMet: boolean;
}

export interface MissionsCancelParams {
  projectId: string;
  missionId: string;
}

export interface MissionsDeleteParams {
  projectId: string;
  missionId: string;
}

export interface MissionsUpdateTitleParams {
  projectId: string;
  missionId: string;
  title: string;
}

// ============================================
// Helper Functions
// ============================================

function toMissionQueryResult(mission: Mission): MissionQueryResult {
  return {
    id: mission.id,
    projectId: mission.projectId,
    sessionId: mission.sessionId,
    title: mission.title,
    status: mission.status,
    planPath: mission.planPath,
    planApprovedAt: mission.planApprovedAt,
    planApprovedBy: mission.planApprovedBy,
    createdAt: mission.createdAt,
    startedAt: mission.startedAt,
    pausedAt: mission.pausedAt,
    completedAt: mission.completedAt,
    summary: mission.summary,
    completionCriteriaMet: mission.completionCriteriaMet,
  };
}

// ============================================
// Query Definitions
// ============================================

/**
 * List missions for a project
 */
export const missionsListQuery = defineQuery<MissionQueryResult[], MissionsListParams>({
  name: "missions.list",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const missions = MissionService.list(db, params.projectId, {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    return missions.map(toMissionQueryResult);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["missions.list", params.projectId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },

  realtime: {
    events: [
      "mission.created",
      "mission.approved",
      "mission.started",
      "mission.paused",
      "mission.resumed",
      "mission.completed",
      "mission.cancelled",
      "mission.deleted",
    ],
  },

  description: "List missions for a project",
});

/**
 * Get a mission by ID
 */
export const missionsGetQuery = defineQuery<MissionQueryResult, MissionsGetParams>({
  name: "missions.get",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.getByIdOrThrow(db, params.missionId);
    return toMissionQueryResult(mission);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => ["missions.get", params.projectId, params.missionId],
  },

  realtime: {
    events: [
      "mission.approved",
      "mission.started",
      "mission.paused",
      "mission.resumed",
      "mission.completed",
      "mission.cancelled",
    ],
  },

  description: "Get a mission by ID",
});

/**
 * Count missions
 */
export const missionsCountQuery = defineQuery<number, MissionsCountParams>({
  name: "missions.count",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    return MissionService.count(db, params.projectId, params.status);
  },

  cache: {
    ttl: 10_000,
    scope: "project",
    key: (params) => {
      const keyParts = ["missions.count", params.projectId];
      if (params.status) keyParts.push(`status:${params.status}`);
      return keyParts;
    },
  },

  description: "Count missions",
});

/**
 * Get active missions (running or paused)
 */
export const missionsActiveQuery = defineQuery<MissionQueryResult[], MissionsActiveParams>({
  name: "missions.active",

  fetch: async (params, _context: QueryContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const missions = MissionService.getActiveMissions(db, params.projectId);
    return missions.map(toMissionQueryResult);
  },

  cache: {
    ttl: 5_000,
    scope: "project",
    key: (params) => ["missions.active", params.projectId],
  },

  realtime: {
    events: [
      "mission.started",
      "mission.paused",
      "mission.resumed",
      "mission.completed",
      "mission.cancelled",
    ],
  },

  description: "Get active missions",
});

// ============================================
// Mutation Definitions
// ============================================

/**
 * Create a new mission in planning state
 */
export const missionsCreateMutation = defineMutation<MissionsCreateParams, MissionWithPlanResult>({
  name: "missions.create",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const result = MissionService.create(db, params.projectId, {
      title: params.title,
      description: params.description,
    });
    return {
      ...toMissionQueryResult(result.mission),
      planContent: result.planContent,
    };
  },

  invalidates: ["missions.list", "missions.count"],

  description: "Create a new mission",
});

/**
 * Approve mission plan (planning → pending)
 */
export const missionsApprovePlanMutation = defineMutation<MissionsApprovePlanParams, MissionQueryResult>({
  name: "missions.approve",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.approvePlan(db, params.missionId, params.userId);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Approve mission plan",
});

/**
 * Start mission execution (pending/paused → running)
 */
export const missionsStartMutation = defineMutation<MissionsStartParams, MissionQueryResult>({
  name: "missions.start",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.start(db, params.missionId, params.sessionId);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list", "missions.active"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Start mission execution",
});

/**
 * Pause mission execution (running → paused)
 */
export const missionsPauseMutation = defineMutation<MissionsPauseParams, MissionQueryResult>({
  name: "missions.pause",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.pause(db, params.missionId);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list", "missions.active"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Pause mission execution",
});

/**
 * Resume mission execution (paused → running)
 */
export const missionsResumeMutation = defineMutation<MissionsResumeParams, MissionQueryResult>({
  name: "missions.resume",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.resume(db, params.missionId);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list", "missions.active"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Resume mission execution",
});

/**
 * Complete mission (running → completed)
 */
export const missionsCompleteMutation = defineMutation<MissionsCompleteParams, MissionQueryResult>({
  name: "missions.complete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.complete(
      db,
      params.missionId,
      params.summary,
      params.criteriaMet
    );
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list", "missions.active", "missions.count"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Complete mission",
});

/**
 * Cancel mission (any except completed → cancelled)
 */
export const missionsCancelMutation = defineMutation<MissionsCancelParams, MissionQueryResult>({
  name: "missions.cancel",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.cancel(db, params.missionId);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list", "missions.active", "missions.count"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Cancel mission",
});

/**
 * Delete mission (only planning or cancelled)
 */
export const missionsDeleteMutation = defineMutation<MissionsDeleteParams, { deleted: boolean }>({
  name: "missions.delete",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    MissionService.delete(db, params.missionId);
    return { deleted: true };
  },

  invalidates: ["missions.list", "missions.count"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Delete mission",
});

/**
 * Update mission title
 */
export const missionsUpdateTitleMutation = defineMutation<MissionsUpdateTitleParams, MissionQueryResult>({
  name: "missions.update.title",

  execute: async (params, _context: MutationContext) => {
    const db = DatabaseManager.getProjectDb(params.projectId);
    const mission = MissionService.updateTitle(db, params.missionId, params.title);
    return toMissionQueryResult(mission);
  },

  invalidates: ["missions.list"],
  invalidateKeys: (params) => [
    ["missions.get", params.projectId, params.missionId],
  ],

  description: "Update mission title",
});
