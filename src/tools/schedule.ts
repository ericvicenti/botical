/**
 * Schedule Tool
 *
 * Allows AI agents to manage scheduled tasks.
 * Supports creating, updating, deleting, enabling/disabling schedules,
 * and viewing schedule history.
 */

import { z } from "zod";
import { defineTool } from "./types.ts";
import { DatabaseManager } from "@/database/index.ts";
import {
  ScheduleService,
  type Schedule,
  type ScheduleRun,
} from "@/services/schedules.ts";
import { Scheduler } from "@/services/scheduler.ts";

const OperationSchema = z.enum([
  "create",
  "update",
  "delete",
  "enable",
  "disable",
  "list",
  "get",
  "history",
  "trigger",
]);

const ActionConfigSchema = z.union([
  z.object({
    actionId: z.string().describe("The action ID to execute (e.g., 'git.commit', 'shell.run')"),
    actionParams: z.record(z.unknown()).optional().describe("Parameters to pass to the action"),
  }),
  z.object({
    workflowId: z.string().describe("The workflow ID to execute"),
    workflowInput: z.record(z.unknown()).optional().describe("Input to pass to the workflow"),
  }),
]);

export const scheduleTool = defineTool("schedule", {
  description: `Manage scheduled tasks that run automatically at specified times.

Operations:
- create: Create a new schedule with a cron expression
- update: Modify an existing schedule
- delete: Remove a schedule
- enable: Enable a disabled schedule
- disable: Disable a schedule without deleting it
- list: List all schedules for the project
- get: Get details of a specific schedule
- history: View run history for a schedule
- trigger: Manually run a schedule immediately

Cron Expressions:
- Use standard cron format: minute hour day month weekday
- Examples:
  - "0 9 * * 1-5" = 9 AM on weekdays
  - "*/15 * * * *" = every 15 minutes
  - "0 0 1 * *" = first day of each month at midnight
- Or use presets: @hourly, @daily, @weekly, @monthly, @yearly

Action Types:
- "action": Run a registered action (e.g., git.commit, shell.run)
- "workflow": Execute a workflow by ID`,

  parameters: z.object({
    operation: OperationSchema.describe("The operation to perform"),
    scheduleId: z.string().optional().describe("Schedule ID (required for update, delete, enable, disable, get, history, trigger)"),
    name: z.string().max(200).optional().describe("Schedule name (required for create)"),
    description: z.string().max(2000).optional().describe("Schedule description"),
    actionType: z.enum(["action", "workflow"]).optional().describe("Type of action to execute (required for create)"),
    actionConfig: ActionConfigSchema.optional().describe("Action configuration (required for create)"),
    cronExpression: z.string().optional().describe("Cron expression for timing (required for create)"),
    timezone: z.string().optional().describe("Timezone for the schedule (default: UTC)"),
    enabled: z.boolean().optional().describe("Whether the schedule is enabled"),
    maxRuntimeMs: z.number().int().min(1000).max(86400000).optional().describe("Maximum execution time in milliseconds"),
  }),

  async execute(args, context) {
    const db = DatabaseManager.getProjectDb(context.projectId);

    switch (args.operation) {
      case "create": {
        if (!args.name || !args.actionType || !args.actionConfig || !args.cronExpression) {
          return {
            title: "Create Schedule - Error",
            output: "Missing required parameters: name, actionType, actionConfig, and cronExpression are required",
            success: false,
          };
        }

        const schedule = ScheduleService.create(db, context.projectId, context.userId, {
          name: args.name,
          description: args.description,
          actionType: args.actionType,
          actionConfig: args.actionConfig,
          cronExpression: args.cronExpression,
          timezone: args.timezone ?? "UTC",
          enabled: args.enabled ?? true,
          maxRuntimeMs: args.maxRuntimeMs,
        });

        return {
          title: `Schedule Created: ${schedule.name}`,
          output: formatSchedule(schedule),
          metadata: { scheduleId: schedule.id },
          success: true,
        };
      }

      case "update": {
        if (!args.scheduleId) {
          return {
            title: "Update Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.actionConfig !== undefined) updates.actionConfig = args.actionConfig;
        if (args.cronExpression !== undefined) updates.cronExpression = args.cronExpression;
        if (args.timezone !== undefined) updates.timezone = args.timezone;
        if (args.enabled !== undefined) updates.enabled = args.enabled;
        if (args.maxRuntimeMs !== undefined) updates.maxRuntimeMs = args.maxRuntimeMs;

        const schedule = ScheduleService.update(db, args.scheduleId, updates);

        return {
          title: `Schedule Updated: ${schedule.name}`,
          output: formatSchedule(schedule),
          metadata: { scheduleId: schedule.id },
          success: true,
        };
      }

      case "delete": {
        if (!args.scheduleId) {
          return {
            title: "Delete Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.getByIdOrThrow(db, args.scheduleId);
        ScheduleService.delete(db, args.scheduleId);

        return {
          title: `Schedule Deleted: ${schedule.name}`,
          output: `Deleted schedule: ${schedule.name} (${args.scheduleId})`,
          success: true,
        };
      }

      case "enable": {
        if (!args.scheduleId) {
          return {
            title: "Enable Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.enable(db, args.scheduleId);

        return {
          title: `Schedule Enabled: ${schedule.name}`,
          output: formatSchedule(schedule),
          success: true,
        };
      }

      case "disable": {
        if (!args.scheduleId) {
          return {
            title: "Disable Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.disable(db, args.scheduleId);

        return {
          title: `Schedule Disabled: ${schedule.name}`,
          output: formatSchedule(schedule),
          success: true,
        };
      }

      case "list": {
        const schedules = ScheduleService.list(db, context.projectId, {
          enabled: args.enabled,
          limit: 50,
        });

        if (schedules.length === 0) {
          return {
            title: "Schedules",
            output: "No schedules found",
            success: true,
          };
        }

        const output = schedules.map(formatScheduleSummary).join("\n\n");

        return {
          title: `Schedules (${schedules.length})`,
          output,
          metadata: { count: schedules.length },
          success: true,
        };
      }

      case "get": {
        if (!args.scheduleId) {
          return {
            title: "Get Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.getByIdOrThrow(db, args.scheduleId);

        return {
          title: `Schedule: ${schedule.name}`,
          output: formatSchedule(schedule),
          metadata: { scheduleId: schedule.id },
          success: true,
        };
      }

      case "history": {
        if (!args.scheduleId) {
          return {
            title: "Schedule History - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.getByIdOrThrow(db, args.scheduleId);
        const runs = ScheduleService.listRuns(db, args.scheduleId, { limit: 20 });

        if (runs.length === 0) {
          return {
            title: `Schedule History: ${schedule.name}`,
            output: "No run history available",
            success: true,
          };
        }

        const output = runs.map(formatRun).join("\n\n");

        return {
          title: `Schedule History: ${schedule.name}`,
          output,
          metadata: { scheduleId: args.scheduleId, runCount: runs.length },
          success: true,
        };
      }

      case "trigger": {
        if (!args.scheduleId) {
          return {
            title: "Trigger Schedule - Error",
            output: "scheduleId is required",
            success: false,
          };
        }

        const schedule = ScheduleService.getByIdOrThrow(db, args.scheduleId);
        const { runId } = await Scheduler.triggerNow(context.projectId, args.scheduleId);

        return {
          title: `Schedule Triggered: ${schedule.name}`,
          output: `Manually triggered schedule. Run ID: ${runId}`,
          metadata: { scheduleId: args.scheduleId, runId },
          success: true,
        };
      }

      default:
        return {
          title: "Schedule - Error",
          output: `Unknown operation: ${args.operation}`,
          success: false,
        };
    }
  },
});

/**
 * Format a schedule for display
 */
function formatSchedule(schedule: Schedule): string {
  const lines = [
    `ID: ${schedule.id}`,
    `Name: ${schedule.name}`,
    schedule.description ? `Description: ${schedule.description}` : null,
    `Status: ${schedule.enabled ? "Enabled" : "Disabled"}`,
    `Cron: ${schedule.cronExpression}`,
    `Timezone: ${schedule.timezone}`,
    `Action Type: ${schedule.actionType}`,
    `Action Config: ${JSON.stringify(schedule.actionConfig, null, 2)}`,
    schedule.nextRunAt ? `Next Run: ${new Date(schedule.nextRunAt).toISOString()}` : "Next Run: Not scheduled",
    schedule.lastRunAt ? `Last Run: ${new Date(schedule.lastRunAt).toISOString()}` : "Last Run: Never",
    schedule.lastRunStatus ? `Last Status: ${schedule.lastRunStatus}` : null,
    schedule.lastRunError ? `Last Error: ${schedule.lastRunError}` : null,
    `Max Runtime: ${schedule.maxRuntimeMs / 1000}s`,
    `Created: ${new Date(schedule.createdAt).toISOString()}`,
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Format a schedule summary for list view
 */
function formatScheduleSummary(schedule: Schedule): string {
  const status = schedule.enabled ? "enabled" : "disabled";
  const nextRun = schedule.nextRunAt
    ? new Date(schedule.nextRunAt).toISOString()
    : "not scheduled";

  return `[${schedule.id}] ${schedule.name}
  Status: ${status} | Cron: ${schedule.cronExpression} | Next: ${nextRun}`;
}

/**
 * Format a schedule run for display
 */
function formatRun(run: ScheduleRun): string {
  const lines = [
    `Run ID: ${run.id}`,
    `Status: ${run.status}`,
    `Scheduled For: ${new Date(run.scheduledFor).toISOString()}`,
    run.startedAt ? `Started: ${new Date(run.startedAt).toISOString()}` : null,
    run.completedAt ? `Completed: ${new Date(run.completedAt).toISOString()}` : null,
    run.sessionId ? `Session: ${run.sessionId}` : null,
    run.output ? `Output: ${run.output.slice(0, 200)}${run.output.length > 200 ? "..." : ""}` : null,
    run.error ? `Error: ${run.error}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}
