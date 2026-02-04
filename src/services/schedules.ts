/**
 * Schedule Service
 *
 * Manages scheduled tasks within a project database.
 * Handles CRUD operations for schedules and schedule runs.
 * See: docs/knowledge-base/02-data-model.md
 */

import { z } from "zod";
import { Cron } from "croner";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Action types that a schedule can execute
 */
export type ScheduleActionType = "action" | "workflow";

/**
 * Action configuration for running an action
 */
export interface ActionConfig {
  actionId: string;
  actionParams?: Record<string, unknown>;
}

/**
 * Action configuration for running a workflow
 */
export interface WorkflowConfig {
  workflowId: string;
  workflowInput?: Record<string, unknown>;
}

/**
 * Run status for schedule executions
 */
export type ScheduleRunStatus = "pending" | "running" | "success" | "failed" | "timeout";

/**
 * Schedule record as stored in the database
 */
export interface ScheduleRecord {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  action_type: string;
  action_config: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_run_status: string | null;
  last_run_error: string | null;
  max_runtime_ms: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

/**
 * Schedule as returned from the service
 */
export interface Schedule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  actionType: ScheduleActionType;
  actionConfig: ActionConfig | WorkflowConfig;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: ScheduleRunStatus | null;
  lastRunError: string | null;
  maxRuntimeMs: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Schedule run record as stored in the database
 */
export interface ScheduleRunRecord {
  id: string;
  schedule_id: string;
  project_id: string;
  status: string;
  session_id: string | null;
  scheduled_for: number;
  started_at: number | null;
  completed_at: number | null;
  output: string | null;
  error: string | null;
}

/**
 * Schedule run as returned from the service
 */
export interface ScheduleRun {
  id: string;
  scheduleId: string;
  projectId: string;
  status: ScheduleRunStatus;
  sessionId: string | null;
  scheduledFor: number;
  startedAt: number | null;
  completedAt: number | null;
  output: string | null;
  error: string | null;
}

/**
 * Common cron presets that can be used instead of expressions
 */
const CRON_PRESETS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

/**
 * Expand cron preset to full expression
 */
function expandCronExpression(expr: string): string {
  const trimmed = expr.trim().toLowerCase();
  return CRON_PRESETS[trimmed] || expr;
}

/**
 * Validate a cron expression
 */
function validateCronExpression(expr: string): { valid: boolean; error?: string } {
  const expanded = expandCronExpression(expr);
  try {
    // Create a cron instance to validate the expression
    new Cron(expanded, { timezone: "UTC" });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid cron expression" };
  }
}

/**
 * Calculate the next run time for a cron expression
 */
function calculateNextRun(cronExpression: string, timezone: string, after?: Date): number | null {
  const expanded = expandCronExpression(cronExpression);
  try {
    const cron = new Cron(expanded, { timezone });
    const next = cron.nextRun(after);
    return next ? next.getTime() : null;
  } catch {
    return null;
  }
}

/**
 * Convert database record to Schedule
 */
function recordToSchedule(record: ScheduleRecord): Schedule {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name,
    description: record.description,
    actionType: record.action_type as ScheduleActionType,
    actionConfig: JSON.parse(record.action_config),
    cronExpression: record.cron_expression,
    timezone: record.timezone,
    enabled: record.enabled === 1,
    nextRunAt: record.next_run_at,
    lastRunAt: record.last_run_at,
    lastRunStatus: record.last_run_status as ScheduleRunStatus | null,
    lastRunError: record.last_run_error,
    maxRuntimeMs: record.max_runtime_ms,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Convert database record to ScheduleRun
 */
function recordToScheduleRun(record: ScheduleRunRecord): ScheduleRun {
  return {
    id: record.id,
    scheduleId: record.schedule_id,
    projectId: record.project_id,
    status: record.status as ScheduleRunStatus,
    sessionId: record.session_id,
    scheduledFor: record.scheduled_for,
    startedAt: record.started_at,
    completedAt: record.completed_at,
    output: record.output,
    error: record.error,
  };
}

/**
 * Schedule creation input schema
 */
export const ScheduleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  actionType: z.enum(["action", "workflow"]),
  actionConfig: z.union([
    z.object({
      actionId: z.string().min(1),
      actionParams: z.record(z.unknown()).optional(),
    }),
    z.object({
      workflowId: z.string().min(1),
      workflowInput: z.record(z.unknown()).optional(),
    }),
  ]),
  cronExpression: z.string().min(1).max(100),
  timezone: z.string().max(50).default("UTC"),
  enabled: z.boolean().default(true),
  maxRuntimeMs: z.number().int().min(1000).max(86400000).default(3600000),
});

export type ScheduleCreate = z.input<typeof ScheduleCreateSchema>;

/**
 * Schedule update input schema
 */
export const ScheduleUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  actionConfig: z.union([
    z.object({
      actionId: z.string().min(1),
      actionParams: z.record(z.unknown()).optional(),
    }),
    z.object({
      workflowId: z.string().min(1),
      workflowInput: z.record(z.unknown()).optional(),
    }),
  ]).optional(),
  cronExpression: z.string().min(1).max(100).optional(),
  timezone: z.string().max(50).optional(),
  enabled: z.boolean().optional(),
  maxRuntimeMs: z.number().int().min(1000).max(86400000).optional(),
});

export type ScheduleUpdate = z.infer<typeof ScheduleUpdateSchema>;

/**
 * Schedule Service
 */
export const ScheduleService = {
  /**
   * Create a new schedule
   */
  create(
    db: Database,
    projectId: string,
    createdBy: string,
    input: ScheduleCreate
  ): Schedule {
    // Validate cron expression
    const cronValidation = validateCronExpression(input.cronExpression);
    if (!cronValidation.valid) {
      throw new ValidationError(`Invalid cron expression: ${cronValidation.error}`);
    }

    const now = Date.now();
    const id = generateId(IdPrefixes.schedule);
    const timezone = input.timezone ?? "UTC";
    const enabled = input.enabled ?? true;

    // Calculate next run time
    const nextRunAt = enabled ? calculateNextRun(input.cronExpression, timezone) : null;

    db.query(`
      INSERT INTO schedules (
        id, project_id, name, description, action_type, action_config,
        cron_expression, timezone, enabled, next_run_at, max_runtime_ms,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.name,
      input.description || null,
      input.actionType,
      JSON.stringify(input.actionConfig),
      input.cronExpression,
      timezone,
      enabled ? 1 : 0,
      nextRunAt,
      input.maxRuntimeMs ?? 3600000,
      createdBy,
      now,
      now
    );

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Get schedule by ID
   */
  getById(db: Database, id: string): Schedule | null {
    const row = db.query<ScheduleRecord, [string]>(
      "SELECT * FROM schedules WHERE id = ?"
    ).get(id);

    return row ? recordToSchedule(row) : null;
  },

  /**
   * Get schedule by ID or throw
   */
  getByIdOrThrow(db: Database, id: string): Schedule {
    const schedule = this.getById(db, id);
    if (!schedule) {
      throw new NotFoundError("Schedule", id);
    }
    return schedule;
  },

  /**
   * List schedules for a project
   */
  list(
    db: Database,
    projectId: string,
    options: {
      enabled?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Schedule[] {
    const { enabled, limit = 50, offset = 0 } = options;

    let query = "SELECT * FROM schedules WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(enabled ? 1 : 0);
    }

    query += " ORDER BY name ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.query<ScheduleRecord, (string | number)[]>(query).all(...params);
    return rows.map(recordToSchedule);
  },

  /**
   * Count schedules for a project
   */
  count(
    db: Database,
    projectId: string,
    options: { enabled?: boolean } = {}
  ): number {
    const { enabled } = options;

    let query = "SELECT COUNT(*) as count FROM schedules WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(enabled ? 1 : 0);
    }

    const result = db.query<{ count: number }, (string | number)[]>(query).get(...params);
    return result?.count ?? 0;
  },

  /**
   * Update a schedule
   */
  update(db: Database, id: string, input: ScheduleUpdate): Schedule {
    const existing = this.getByIdOrThrow(db, id);
    const now = Date.now();

    // Validate cron expression if being updated
    if (input.cronExpression) {
      const cronValidation = validateCronExpression(input.cronExpression);
      if (!cronValidation.valid) {
        throw new ValidationError(`Invalid cron expression: ${cronValidation.error}`);
      }
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }
    if (input.actionConfig !== undefined) {
      updates.push("action_config = ?");
      params.push(JSON.stringify(input.actionConfig));
    }
    if (input.cronExpression !== undefined) {
      updates.push("cron_expression = ?");
      params.push(input.cronExpression);
    }
    if (input.timezone !== undefined) {
      updates.push("timezone = ?");
      params.push(input.timezone);
    }
    if (input.enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(input.enabled ? 1 : 0);
    }
    if (input.maxRuntimeMs !== undefined) {
      updates.push("max_runtime_ms = ?");
      params.push(input.maxRuntimeMs);
    }

    // Recalculate next run if cron, timezone, or enabled changed
    const cronExpression = input.cronExpression ?? existing.cronExpression;
    const timezone = input.timezone ?? existing.timezone;
    const enabled = input.enabled ?? existing.enabled;

    if (input.cronExpression !== undefined || input.timezone !== undefined || input.enabled !== undefined) {
      const nextRunAt = enabled ? calculateNextRun(cronExpression, timezone) : null;
      updates.push("next_run_at = ?");
      params.push(nextRunAt);
    }

    params.push(id);

    db.query(`UPDATE schedules SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Enable a schedule
   */
  enable(db: Database, id: string): Schedule {
    return this.update(db, id, { enabled: true });
  },

  /**
   * Disable a schedule
   */
  disable(db: Database, id: string): Schedule {
    return this.update(db, id, { enabled: false });
  },

  /**
   * Delete a schedule
   */
  delete(db: Database, id: string): void {
    const result = db.query("DELETE FROM schedules WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Schedule", id);
    }
  },

  /**
   * Get schedules that are due to run
   */
  getDueSchedules(db: Database, beforeTime: number = Date.now()): Schedule[] {
    const rows = db.query<ScheduleRecord, [number]>(`
      SELECT * FROM schedules
      WHERE enabled = 1
        AND next_run_at IS NOT NULL
        AND next_run_at <= ?
      ORDER BY next_run_at ASC
    `).all(beforeTime);

    return rows.map(recordToSchedule);
  },

  /**
   * Update last run info and calculate next run time
   */
  updateAfterRun(
    db: Database,
    id: string,
    status: ScheduleRunStatus,
    error?: string
  ): void {
    const schedule = this.getByIdOrThrow(db, id);
    const now = Date.now();
    const nextRunAt = schedule.enabled
      ? calculateNextRun(schedule.cronExpression, schedule.timezone, new Date(now))
      : null;

    db.query(`
      UPDATE schedules
      SET last_run_at = ?,
          last_run_status = ?,
          last_run_error = ?,
          next_run_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, status, error || null, nextRunAt, now, id);
  },

  // ============================================
  // SCHEDULE RUNS
  // ============================================

  /**
   * Create a schedule run
   */
  createRun(
    db: Database,
    scheduleId: string,
    projectId: string,
    scheduledFor: number
  ): ScheduleRun {
    const id = generateId(IdPrefixes.scheduleRun);

    db.query(`
      INSERT INTO schedule_runs (id, schedule_id, project_id, status, scheduled_for)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, scheduleId, projectId, scheduledFor);

    return this.getRunByIdOrThrow(db, id);
  },

  /**
   * Get schedule run by ID
   */
  getRunById(db: Database, id: string): ScheduleRun | null {
    const row = db.query<ScheduleRunRecord, [string]>(
      "SELECT * FROM schedule_runs WHERE id = ?"
    ).get(id);

    return row ? recordToScheduleRun(row) : null;
  },

  /**
   * Get schedule run by ID or throw
   */
  getRunByIdOrThrow(db: Database, id: string): ScheduleRun {
    const run = this.getRunById(db, id);
    if (!run) {
      throw new NotFoundError("ScheduleRun", id);
    }
    return run;
  },

  /**
   * List runs for a schedule
   */
  listRuns(
    db: Database,
    scheduleId: string,
    options: {
      status?: ScheduleRunStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): ScheduleRun[] {
    const { status, limit = 50, offset = 0 } = options;

    let query = "SELECT * FROM schedule_runs WHERE schedule_id = ?";
    const params: (string | number)[] = [scheduleId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY scheduled_for DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.query<ScheduleRunRecord, (string | number)[]>(query).all(...params);
    return rows.map(recordToScheduleRun);
  },

  /**
   * Start a schedule run
   */
  startRun(db: Database, runId: string, sessionId?: string): void {
    const now = Date.now();
    db.query(`
      UPDATE schedule_runs
      SET status = 'running', started_at = ?, session_id = ?
      WHERE id = ?
    `).run(now, sessionId || null, runId);
  },

  /**
   * Complete a schedule run
   */
  completeRun(
    db: Database,
    runId: string,
    status: "success" | "failed" | "timeout",
    output?: string,
    error?: string
  ): void {
    const now = Date.now();
    db.query(`
      UPDATE schedule_runs
      SET status = ?, completed_at = ?, output = ?, error = ?
      WHERE id = ?
    `).run(status, now, output || null, error || null, runId);
  },

  /**
   * Validate a cron expression (exposed for API validation)
   */
  validateCronExpression,

  /**
   * Calculate next run time (exposed for testing)
   */
  calculateNextRun,
};
