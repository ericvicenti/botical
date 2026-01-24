/**
 * Workflow Execution Service
 *
 * Manages workflow execution records in the database.
 */

import type { Database } from "bun:sqlite";
import { generateId } from "@/utils/id.ts";
import { NotFoundError } from "@/utils/errors.ts";
import type {
  WorkflowStatus,
  StepStatus,
  StepExecution,
} from "@/workflows/types.ts";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowExecutionRecord {
  id: string;
  workflow_id: string;
  project_id: string;
  status: WorkflowStatus;
  input: string; // JSON
  output: string | null; // JSON
  error: string | null;
  started_at: number;
  completed_at: number | null;
}

export interface StepExecutionRecord {
  id: string;
  execution_id: string;
  step_id: string;
  status: StepStatus;
  resolved_args: string | null; // JSON
  output: string | null; // JSON
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  projectId: string;
  status: WorkflowStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
  steps: Record<string, StepExecution>;
}

// ============================================================================
// Service
// ============================================================================

export const WorkflowExecutionService = {
  /**
   * Create a new workflow execution
   */
  create(
    db: Database,
    workflowId: string,
    projectId: string,
    input: Record<string, unknown>
  ): WorkflowExecution {
    const id = generateId("wfx");
    const now = Date.now();

    db.prepare(
      `INSERT INTO workflow_executions (id, workflow_id, project_id, status, input, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, workflowId, projectId, "pending", JSON.stringify(input), now);

    return {
      id,
      workflowId,
      projectId,
      status: "pending",
      input,
      startedAt: now,
      steps: {},
    };
  },

  /**
   * Get execution by ID
   */
  getById(db: Database, id: string): WorkflowExecution | null {
    const row = db
      .prepare("SELECT * FROM workflow_executions WHERE id = ?")
      .get(id) as WorkflowExecutionRecord | undefined;

    if (!row) return null;

    // Get step executions
    const stepRows = db
      .prepare("SELECT * FROM step_executions WHERE execution_id = ?")
      .all(id) as StepExecutionRecord[];

    const steps: Record<string, StepExecution> = {};
    for (const step of stepRows) {
      steps[step.step_id] = {
        stepId: step.step_id,
        status: step.status as StepStatus,
        resolvedArgs: step.resolved_args
          ? JSON.parse(step.resolved_args)
          : undefined,
        output: step.output ? JSON.parse(step.output) : undefined,
        error: step.error || undefined,
        startedAt: step.started_at || undefined,
        completedAt: step.completed_at || undefined,
      };
    }

    return {
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id,
      status: row.status,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      steps,
    };
  },

  /**
   * Get execution by ID or throw
   */
  getByIdOrThrow(db: Database, id: string): WorkflowExecution {
    const execution = this.getById(db, id);
    if (!execution) {
      throw new NotFoundError("Workflow execution", id);
    }
    return execution;
  },

  /**
   * List executions for a workflow
   */
  listByWorkflow(
    db: Database,
    workflowId: string,
    options: { limit?: number; offset?: number } = {}
  ): WorkflowExecution[] {
    const { limit = 50, offset = 0 } = options;

    const rows = db
      .prepare(
        `SELECT * FROM workflow_executions
         WHERE workflow_id = ?
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(workflowId, limit, offset) as WorkflowExecutionRecord[];

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id,
      status: row.status,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      steps: {}, // Don't load steps for list view
    }));
  },

  /**
   * Update execution status
   */
  updateStatus(db: Database, id: string, status: WorkflowStatus): void {
    const now = status === "completed" || status === "failed" ? Date.now() : null;
    db.prepare(
      `UPDATE workflow_executions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`
    ).run(status, now, id);
  },

  /**
   * Complete execution with output
   */
  complete(
    db: Database,
    id: string,
    output: Record<string, unknown>
  ): void {
    const now = Date.now();
    db.prepare(
      `UPDATE workflow_executions SET status = 'completed', output = ?, completed_at = ? WHERE id = ?`
    ).run(JSON.stringify(output), now, id);
  },

  /**
   * Fail execution with error
   */
  fail(db: Database, id: string, error: string): void {
    const now = Date.now();
    db.prepare(
      `UPDATE workflow_executions SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`
    ).run(error, now, id);
  },

  /**
   * Create step execution record
   */
  createStep(
    db: Database,
    executionId: string,
    stepId: string
  ): void {
    const id = generateId("stx");
    db.prepare(
      `INSERT INTO step_executions (id, execution_id, step_id, status)
       VALUES (?, ?, ?, ?)`
    ).run(id, executionId, stepId, "pending");
  },

  /**
   * Update step execution
   */
  updateStep(
    db: Database,
    executionId: string,
    stepId: string,
    updates: {
      status?: StepStatus;
      resolvedArgs?: Record<string, unknown>;
      output?: unknown;
      error?: string;
    }
  ): void {
    const now = Date.now();
    const row = db
      .prepare(
        "SELECT id FROM step_executions WHERE execution_id = ? AND step_id = ?"
      )
      .get(executionId, stepId) as { id: string } | undefined;

    if (!row) {
      // Create step if it doesn't exist
      this.createStep(db, executionId, stepId);
    }

    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status) {
      sets.push("status = ?");
      values.push(updates.status);
      if (updates.status === "running") {
        sets.push("started_at = ?");
        values.push(now);
      } else if (
        updates.status === "completed" ||
        updates.status === "failed" ||
        updates.status === "skipped"
      ) {
        sets.push("completed_at = ?");
        values.push(now);
      }
    }
    if (updates.resolvedArgs !== undefined) {
      sets.push("resolved_args = ?");
      values.push(JSON.stringify(updates.resolvedArgs));
    }
    if (updates.output !== undefined) {
      sets.push("output = ?");
      values.push(JSON.stringify(updates.output));
    }
    if (updates.error !== undefined) {
      sets.push("error = ?");
      values.push(updates.error);
    }

    if (sets.length > 0) {
      values.push(executionId, stepId);
      db.prepare(
        `UPDATE step_executions SET ${sets.join(", ")} WHERE execution_id = ? AND step_id = ?`
      ).run(...values);
    }
  },
};
