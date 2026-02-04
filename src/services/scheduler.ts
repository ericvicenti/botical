/**
 * Scheduler Service
 *
 * Background process that polls for due schedules and executes them.
 * Runs as a singleton started with the server.
 */

import { DatabaseManager } from "@/database/index.ts";
import { ScheduleService, type Schedule, type ScheduleRunStatus } from "./schedules.ts";
import { ActionRegistry } from "@/actions/registry.ts";
import { executeWorkflow } from "@/workflows/executor.ts";
import { UnifiedWorkflowService } from "./workflows-unified.ts";
import { ProjectService } from "./projects.ts";
import type { ActionContext } from "@/actions/types.ts";

const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds
const SYSTEM_USER_ID = "system:scheduler";

/**
 * Scheduler singleton class
 */
class SchedulerClass {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private runningExecutions: Map<string, { runId: string; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private isRunning = false;

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    this.isRunning = true;
    console.log("[Scheduler] Starting...");

    // Run immediately on start
    this.poll().catch((err) => {
      console.error("[Scheduler] Initial poll failed:", err);
    });

    // Then poll at regular intervals
    this.intervalId = setInterval(() => {
      this.poll().catch((err) => {
        console.error("[Scheduler] Poll failed:", err);
      });
    }, POLL_INTERVAL_MS);

    console.log(`[Scheduler] Started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear all running timeouts
    for (const [scheduleId, execution] of this.runningExecutions) {
      clearTimeout(execution.timeout);
      console.log(`[Scheduler] Cancelled pending execution for schedule ${scheduleId}`);
    }
    this.runningExecutions.clear();

    this.isRunning = false;
    console.log("[Scheduler] Stopped");
  }

  /**
   * Check if the scheduler is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Poll for due schedules and execute them
   */
  private async poll(): Promise<void> {
    // Get all project databases and check each for due schedules
    const rootDb = DatabaseManager.getRootDb();
    const projects = ProjectService.list(rootDb, { limit: 1000 });

    for (const project of projects) {
      try {
        const db = DatabaseManager.getProjectDb(project.id);
        const dueSchedules = ScheduleService.getDueSchedules(db);

        for (const schedule of dueSchedules) {
          // Skip if already running
          if (this.runningExecutions.has(schedule.id)) {
            continue;
          }

          // Execute the schedule
          this.executeSchedule(project.id, project.path || "", schedule).catch((err) => {
            console.error(`[Scheduler] Failed to execute schedule ${schedule.id}:`, err);
          });
        }
      } catch (err) {
        // Project database might not exist or be accessible
        console.debug(`[Scheduler] Skipping project ${project.id}: ${err}`);
      }
    }
  }

  /**
   * Execute a single schedule
   */
  private async executeSchedule(
    projectId: string,
    projectPath: string,
    schedule: Schedule
  ): Promise<void> {
    const db = DatabaseManager.getProjectDb(projectId);

    console.log(`[Scheduler] Executing schedule: ${schedule.name} (${schedule.id})`);

    // Create a run record
    const run = ScheduleService.createRun(
      db,
      schedule.id,
      projectId,
      schedule.nextRunAt || Date.now()
    );

    // Track the execution
    const timeout = setTimeout(() => {
      this.handleTimeout(projectId, schedule.id, run.id);
    }, schedule.maxRuntimeMs);

    this.runningExecutions.set(schedule.id, { runId: run.id, timeout });

    // Mark run as started
    ScheduleService.startRun(db, run.id);

    try {
      // Build action context for execution
      const actionContext: ActionContext = {
        projectId,
        projectPath,
        userId: SYSTEM_USER_ID,
        sessionId: undefined,
      };

      let output: string | undefined;
      let status: ScheduleRunStatus = "success";

      if (schedule.actionType === "action") {
        const config = schedule.actionConfig as { actionId: string; actionParams?: Record<string, unknown> };
        const result = await ActionRegistry.execute(
          config.actionId,
          config.actionParams || {},
          actionContext
        );

        if (result.type === "error") {
          throw new Error(result.message);
        }

        output = result.type === "success" ? result.output : `${result.type}: completed`;
      } else if (schedule.actionType === "workflow") {
        const config = schedule.actionConfig as { workflowId: string; workflowInput?: Record<string, unknown> };

        // Get the workflow
        const workflow = UnifiedWorkflowService.getByIdOrThrow(
          db,
          projectId,
          projectPath,
          config.workflowId
        );

        // Execute the workflow
        const { executionId } = await executeWorkflow(
          db,
          workflow,
          config.workflowInput || {},
          actionContext,
          { isAgentContext: true }
        );

        output = `Workflow execution started: ${executionId}`;
      }

      // Mark run as complete
      ScheduleService.completeRun(db, run.id, status, output);
      ScheduleService.updateAfterRun(db, schedule.id, status);

      console.log(`[Scheduler] Schedule ${schedule.name} completed successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      // Mark run as failed
      ScheduleService.completeRun(db, run.id, "failed", undefined, errorMessage);
      ScheduleService.updateAfterRun(db, schedule.id, "failed", errorMessage);

      console.error(`[Scheduler] Schedule ${schedule.name} failed:`, errorMessage);
    } finally {
      // Clean up tracking
      const execution = this.runningExecutions.get(schedule.id);
      if (execution) {
        clearTimeout(execution.timeout);
        this.runningExecutions.delete(schedule.id);
      }
    }
  }

  /**
   * Handle execution timeout
   */
  private handleTimeout(projectId: string, scheduleId: string, runId: string): void {
    console.warn(`[Scheduler] Schedule ${scheduleId} timed out`);

    try {
      const db = DatabaseManager.getProjectDb(projectId);
      ScheduleService.completeRun(db, runId, "timeout", undefined, "Execution timed out");
      ScheduleService.updateAfterRun(db, scheduleId, "timeout", "Execution timed out");
    } catch (err) {
      console.error(`[Scheduler] Failed to update timed out schedule:`, err);
    }

    this.runningExecutions.delete(scheduleId);
  }

  /**
   * Manually trigger a schedule to run now
   */
  async triggerNow(projectId: string, scheduleId: string): Promise<{ runId: string }> {
    const db = DatabaseManager.getProjectDb(projectId);
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getByIdOrThrow(rootDb, projectId);
    const schedule = ScheduleService.getByIdOrThrow(db, scheduleId);

    // Create a run record
    const run = ScheduleService.createRun(db, scheduleId, projectId, Date.now());

    // Execute asynchronously
    this.executeSchedule(projectId, project.path || "", schedule).catch((err) => {
      console.error(`[Scheduler] Manual trigger failed for ${scheduleId}:`, err);
    });

    return { runId: run.id };
  }
}

/**
 * Singleton instance of the Scheduler
 */
export const Scheduler = new SchedulerClass();
