/**
 * Missions API Routes
 *
 * REST API endpoints for managing autonomous work missions.
 * Missions are the core unit of autonomous work with planning phases,
 * approval workflows, and execution lifecycle management.
 *
 * Project-scoped endpoints:
 * - POST /api/projects/:projectId/missions - Create mission
 * - GET /api/projects/:projectId/missions - List missions
 *
 * Mission endpoints:
 * - GET /api/missions/:id - Get mission details
 * - GET /api/missions/:id/plan - Get plan content
 * - PUT /api/missions/:id/plan - Update plan content
 * - POST /api/missions/:id/approve - Approve plan
 * - POST /api/missions/:id/start - Start execution
 * - POST /api/missions/:id/pause - Pause execution
 * - POST /api/missions/:id/resume - Resume execution
 * - POST /api/missions/:id/complete - Mark complete
 * - POST /api/missions/:id/cancel - Cancel mission
 * - DELETE /api/missions/:id - Delete mission
 * - GET /api/missions/:id/tasks - List mission tasks
 * - POST /api/missions/:id/tasks - Create task in mission
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/implementation-plan/10-missions-and-tasks.md
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  MissionService,
  MissionCreateSchema,
  type MissionStatus,
} from "@/services/missions.ts";
import { TaskService, TaskCreateSchema } from "@/services/tasks.ts";
import { SessionService } from "@/services/sessions.ts";
import { ValidationError } from "@/utils/errors.ts";

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

const projectMissions = new Hono();

/**
 * Query parameters for listing missions
 */
const ListQuerySchema = z.object({
  status: z
    .enum(["planning", "pending", "running", "paused", "completed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * POST /api/projects/:projectId/missions
 * Create a new mission
 */
projectMissions.post("/:projectId/missions", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();

  const result = MissionCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const { mission, planContent } = MissionService.create(db, projectId, result.data);

  return c.json(
    {
      data: {
        ...mission,
        planContent,
      },
    },
    201
  );
});

/**
 * GET /api/projects/:projectId/missions
 * List missions for a project
 */
projectMissions.get("/:projectId/missions", async (c) => {
  const projectId = c.req.param("projectId");

  const rawQuery = {
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { status, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const missions = MissionService.list(db, projectId, {
    status, // Already validated by ListQuerySchema
    limit,
    offset,
  });

  const total = MissionService.count(db, projectId, status); // Already validated by ListQuerySchema

  return c.json({
    data: missions,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + missions.length < total,
    },
  });
});

// ============================================
// INDIVIDUAL MISSION ROUTES
// ============================================

const missions = new Hono();

/**
 * GET /api/missions/:id
 * Get mission details
 */
missions.get("/:id", async (c) => {
  const missionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.getByIdOrThrow(db, missionId);

  return c.json({
    data: mission,
  });
});

/**
 * GET /api/missions/:id/plan
 * Get mission plan content
 * Note: Plan content is stored in filesystem, this returns the path
 * Client should fetch the actual content via file API or this endpoint
 */
missions.get("/:id/plan", async (c) => {
  const missionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.getByIdOrThrow(db, missionId);

  // Return plan metadata - actual content fetched separately
  return c.json({
    data: {
      missionId: mission.id,
      planPath: mission.planPath,
      approved: mission.planApprovedAt !== null,
      approvedAt: mission.planApprovedAt,
      approvedBy: mission.planApprovedBy,
    },
  });
});

/**
 * PUT /api/missions/:id/plan
 * Update mission plan path (for title changes that affect slug)
 */
missions.put("/:id/plan", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.getByIdOrThrow(db, missionId);

  if (mission.status !== "planning") {
    throw new ValidationError(
      "Cannot update plan: mission is no longer in planning state"
    );
  }

  // Plan content is managed externally (filesystem)
  // This endpoint just confirms the update was received
  return c.json({
    data: {
      missionId: mission.id,
      planPath: mission.planPath,
      updated: true,
    },
  });
});

/**
 * POST /api/missions/:id/approve
 * Approve mission plan
 */
missions.post("/:id/approve", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const userId = body.userId;
  if (!userId) {
    throw new ValidationError("userId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.approvePlan(db, missionId, userId);

  return c.json({
    data: mission,
  });
});

/**
 * POST /api/missions/:id/start
 * Start mission execution
 */
missions.post("/:id/start", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get mission to check its state
  const existingMission = MissionService.getByIdOrThrow(db, missionId);

  let sessionId = existingMission.sessionId;

  // If no session exists, create one
  if (!sessionId) {
    const session = SessionService.create(db, {
      title: `Mission: ${existingMission.title}`,
      agent: "default",
    });
    sessionId = session.id;
  }

  const mission = MissionService.start(db, missionId, sessionId);

  return c.json({
    data: mission,
  });
});

/**
 * POST /api/missions/:id/pause
 * Pause mission execution
 */
missions.post("/:id/pause", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.pause(db, missionId);

  return c.json({
    data: mission,
  });
});

/**
 * POST /api/missions/:id/resume
 * Resume mission execution
 */
missions.post("/:id/resume", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.resume(db, missionId);

  return c.json({
    data: mission,
  });
});

/**
 * POST /api/missions/:id/complete
 * Mark mission as complete
 */
missions.post("/:id/complete", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const CompleteSchema = z.object({
    summary: z.string().min(1).max(5000),
    criteriaMet: z.boolean().default(false),
  });

  const result = CompleteSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.complete(
    db,
    missionId,
    result.data.summary,
    result.data.criteriaMet
  );

  return c.json({
    data: mission,
  });
});

/**
 * POST /api/missions/:id/cancel
 * Cancel mission
 */
missions.post("/:id/cancel", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.cancel(db, missionId);

  return c.json({
    data: mission,
  });
});

/**
 * DELETE /api/missions/:id
 * Delete mission (only planning or cancelled missions)
 */
missions.delete("/:id", async (c) => {
  const missionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  MissionService.delete(db, missionId);

  return c.json({
    data: { deleted: true },
  });
});

/**
 * GET /api/missions/:id/tasks
 * List tasks for a mission
 */
missions.get("/:id/tasks", async (c) => {
  const missionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const rawQuery = {
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const TaskListQuerySchema = z.object({
    status: z
      .enum(["pending", "in_progress", "completed", "blocked", "cancelled"])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  const result = TaskListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { status, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure mission exists
  MissionService.getByIdOrThrow(db, missionId);

  const tasks = TaskService.listByMission(db, missionId, {
    status: status as
      | "pending"
      | "in_progress"
      | "completed"
      | "blocked"
      | "cancelled"
      | undefined,
    limit,
    offset,
  });

  const total = TaskService.countByMission(db, missionId, status); // Already validated by TaskListQuerySchema

  return c.json({
    data: tasks,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + tasks.length < total,
    },
  });
});

/**
 * POST /api/missions/:id/tasks
 * Create a task within a mission
 */
missions.post("/:id/tasks", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure mission exists and get its session
  const mission = MissionService.getByIdOrThrow(db, missionId);

  if (!mission.sessionId) {
    throw new ValidationError(
      "Mission does not have an active session. Start the mission first."
    );
  }

  // Add missionId to the input
  const taskInput = {
    ...body,
    missionId,
  };

  const result = TaskCreateSchema.safeParse(taskInput);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const task = TaskService.create(db, mission.sessionId, result.data);

  return c.json(
    {
      data: task,
    },
    201
  );
});

/**
 * PUT /api/missions/:id/title
 * Update mission title
 */
missions.put("/:id/title", async (c) => {
  const missionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId) {
    throw new ValidationError("projectId is required");
  }

  const title = body.title;
  if (!title || typeof title !== "string") {
    throw new ValidationError("title is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const mission = MissionService.updateTitle(db, missionId, title);

  return c.json({
    data: mission,
  });
});

export { projectMissions, missions };
