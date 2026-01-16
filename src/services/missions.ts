/**
 * Mission Service
 *
 * Manages autonomous work units with planning documents and lifecycle transitions.
 * Missions are the core unit of autonomous work in Iris, featuring:
 * - A planning phase with markdown documents
 * - Completion criteria drafted by agent, approved by user
 * - Tasks as granular work units within the mission
 *
 * See: docs/implementation-plan/10-missions-and-tasks.md
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Mission status enumeration
 * Lifecycle: planning → pending → running → completed/cancelled
 */
export type MissionStatus =
  | "planning" // Initial state, plan being drafted
  | "pending" // Plan approved, ready to start
  | "running" // Actively executing
  | "paused" // Execution paused, can resume
  | "completed" // Successfully finished
  | "cancelled"; // User cancelled

/**
 * Mission entity
 */
export interface Mission {
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
 * Database row type
 */
interface MissionRow {
  id: string;
  project_id: string;
  session_id: string | null;
  title: string;
  status: string;
  plan_path: string;
  plan_approved_at: number | null;
  plan_approved_by: string | null;
  created_at: number;
  started_at: number | null;
  paused_at: number | null;
  completed_at: number | null;
  summary: string | null;
  completion_criteria_met: number;
}

/**
 * Mission creation input schema
 */
export const MissionCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
});

export type MissionCreateInput = z.input<typeof MissionCreateSchema>;

/**
 * Mission filter options
 */
export interface MissionFilters {
  status?: MissionStatus;
  limit?: number;
  offset?: number;
}

/**
 * Convert database row to mission entity
 */
function rowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    title: row.title,
    status: row.status as MissionStatus,
    planPath: row.plan_path,
    planApprovedAt: row.plan_approved_at,
    planApprovedBy: row.plan_approved_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    completedAt: row.completed_at,
    summary: row.summary,
    completionCriteriaMet: row.completion_criteria_met === 1,
  };
}

/**
 * Generate a URL-friendly slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Generate initial plan template
 */
function generatePlanTemplate(title: string, description?: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `# Mission: ${title}

## Goal
${description || "Describe the mission goal here..."}

## Completion Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Approach
1. Step 1
2. Step 2
3. Step 3

## Constraints
- Constraint 1
- Constraint 2

## Notes
Additional context...

---
*Plan drafted by Iris on ${date}*
`;
}

/**
 * Mission Service for managing autonomous work units
 */
export class MissionService {
  /**
   * Create a new mission in planning state
   */
  static create(
    db: Database,
    projectId: string,
    input: MissionCreateInput
  ): { mission: Mission; planContent: string } {
    const validated = MissionCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.mission, { descending: true });
    const slug = generateSlug(validated.title);
    const planPath = `.iris/missions/${slug}.md`;
    const planContent = generatePlanTemplate(validated.title, validated.description);

    db.prepare(
      `
      INSERT INTO missions (
        id, project_id, title, status, plan_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(id, projectId, validated.title, "planning", planPath, now);

    const mission: Mission = {
      id,
      projectId,
      sessionId: null,
      title: validated.title,
      status: "planning",
      planPath,
      planApprovedAt: null,
      planApprovedBy: null,
      createdAt: now,
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      summary: null,
      completionCriteriaMet: false,
    };

    return { mission, planContent };
  }

  /**
   * Get a mission by ID
   */
  static getById(db: Database, missionId: string): Mission | null {
    const row = db
      .prepare("SELECT * FROM missions WHERE id = ?")
      .get(missionId) as MissionRow | undefined;

    if (!row) return null;
    return rowToMission(row);
  }

  /**
   * Get a mission by ID or throw NotFoundError
   */
  static getByIdOrThrow(db: Database, missionId: string): Mission {
    const mission = this.getById(db, missionId);
    if (!mission) {
      throw new NotFoundError("Mission", missionId);
    }
    return mission;
  }

  /**
   * List missions for a project with optional filtering
   */
  static list(
    db: Database,
    projectId: string,
    options: MissionFilters = {}
  ): Mission[] {
    let query = "SELECT * FROM missions WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (options.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    // Order by ID ascending - IDs use descending mode so newest is first alphabetically
    query += " ORDER BY id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as MissionRow[];
    return rows.map(rowToMission);
  }

  /**
   * Get active missions (running or paused)
   */
  static getActiveMissions(db: Database, projectId: string): Mission[] {
    const rows = db
      .prepare(
        "SELECT * FROM missions WHERE project_id = ? AND status IN ('running', 'paused') ORDER BY id ASC"
      )
      .all(projectId) as MissionRow[];

    return rows.map(rowToMission);
  }

  /**
   * Count missions for a project
   */
  static count(db: Database, projectId: string, status?: MissionStatus): number {
    let query = "SELECT COUNT(*) as count FROM missions WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    const result = db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  /**
   * Approve the mission plan
   * Transitions: planning → pending
   */
  static approvePlan(db: Database, missionId: string, userId: string): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "planning") {
      throw new ValidationError(
        `Cannot approve plan: mission is in '${mission.status}' state, expected 'planning'`
      );
    }

    const now = Date.now();

    db.prepare(
      `
      UPDATE missions
      SET status = 'pending', plan_approved_at = ?, plan_approved_by = ?
      WHERE id = ?
    `
    ).run(now, userId, missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Start mission execution
   * Transitions: pending → running
   * Creates a session for the mission
   */
  static start(db: Database, missionId: string, sessionId: string): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "pending" && mission.status !== "paused") {
      throw new ValidationError(
        `Cannot start mission: mission is in '${mission.status}' state, expected 'pending' or 'paused'`
      );
    }

    const now = Date.now();

    db.prepare(
      `
      UPDATE missions
      SET status = 'running', session_id = ?, started_at = COALESCE(started_at, ?), paused_at = NULL
      WHERE id = ?
    `
    ).run(sessionId, now, missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Pause mission execution
   * Transitions: running → paused
   */
  static pause(db: Database, missionId: string): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "running") {
      throw new ValidationError(
        `Cannot pause mission: mission is in '${mission.status}' state, expected 'running'`
      );
    }

    const now = Date.now();

    db.prepare(
      `
      UPDATE missions
      SET status = 'paused', paused_at = ?
      WHERE id = ?
    `
    ).run(now, missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Resume mission execution
   * Transitions: paused → running
   */
  static resume(db: Database, missionId: string): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "paused") {
      throw new ValidationError(
        `Cannot resume mission: mission is in '${mission.status}' state, expected 'paused'`
      );
    }

    db.prepare(
      `
      UPDATE missions
      SET status = 'running', paused_at = NULL
      WHERE id = ?
    `
    ).run(missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Complete mission execution
   * Transitions: running → completed
   */
  static complete(
    db: Database,
    missionId: string,
    summary: string,
    criteriaMet: boolean
  ): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "running") {
      throw new ValidationError(
        `Cannot complete mission: mission is in '${mission.status}' state, expected 'running'`
      );
    }

    const now = Date.now();

    db.prepare(
      `
      UPDATE missions
      SET status = 'completed', completed_at = ?, summary = ?, completion_criteria_met = ?
      WHERE id = ?
    `
    ).run(now, summary, criteriaMet ? 1 : 0, missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Cancel mission
   * Transitions: any (except completed) → cancelled
   */
  static cancel(db: Database, missionId: string): Mission {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status === "completed" || mission.status === "cancelled") {
      throw new ValidationError(
        `Cannot cancel mission: mission is already in '${mission.status}' state`
      );
    }

    const now = Date.now();

    db.prepare(
      `
      UPDATE missions
      SET status = 'cancelled', completed_at = ?
      WHERE id = ?
    `
    ).run(now, missionId);

    return this.getByIdOrThrow(db, missionId);
  }

  /**
   * Delete a mission (hard delete)
   * Only allowed for planning or cancelled missions
   */
  static delete(db: Database, missionId: string): void {
    const mission = this.getByIdOrThrow(db, missionId);

    if (mission.status !== "planning" && mission.status !== "cancelled") {
      throw new ValidationError(
        `Cannot delete mission: mission is in '${mission.status}' state, only 'planning' or 'cancelled' missions can be deleted`
      );
    }

    // Delete associated tasks first
    db.prepare("DELETE FROM tasks WHERE mission_id = ?").run(missionId);

    // Delete the mission
    db.prepare("DELETE FROM missions WHERE id = ?").run(missionId);
  }

  /**
   * Update mission title
   */
  static updateTitle(db: Database, missionId: string, title: string): Mission {
    this.getByIdOrThrow(db, missionId);

    if (!title || title.length === 0) {
      throw new ValidationError("Title cannot be empty");
    }

    if (title.length > 500) {
      throw new ValidationError("Title cannot exceed 500 characters");
    }

    db.prepare("UPDATE missions SET title = ? WHERE id = ?").run(title, missionId);

    return this.getByIdOrThrow(db, missionId);
  }
}
