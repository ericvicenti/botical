#!/usr/bin/env bun

/**
 * Setup Leopard Heartbeat Schedule
 *
 * Creates a cron schedule that triggers the leopard heartbeat every 2 hours
 * from 8am to 11pm PST (Pacific Standard Time).
 *
 * This schedule will trigger the heartbeat.leopard action which creates
 * a new session and sends the improvement prompt to the leopard agent.
 */

import { DatabaseManager } from "../src/database/index.ts";
import { ScheduleService } from "../src/services/schedules.ts";

async function main() {
  console.log("Setting up Leopard heartbeat schedule...");

  try {
    await DatabaseManager.initialize();
    const projectId = "prj_2go5oq0sa9o-51985ca1"; // Botical Tiger
    const db = DatabaseManager.getProjectDb(projectId);

    // Check if heartbeat schedule already exists
    const schedules = ScheduleService.list(db, projectId, { limit: 100 });
    const existingHeartbeat = schedules.find(s => s.name === "Leopard Heartbeat");

    if (existingHeartbeat) {
      console.log("Leopard heartbeat schedule already exists:", existingHeartbeat.id);
      console.log("Status:", existingHeartbeat.enabled ? "Enabled" : "Disabled");
      console.log("Next run:", existingHeartbeat.nextRunAt ? new Date(existingHeartbeat.nextRunAt).toLocaleString() : "Not scheduled");
      return;
    }

    // Create the schedule
    // Cron expression: "0 8,10,12,14,16,18,20,22 * * *" 
    // This runs at 8am, 10am, 12pm, 2pm, 4pm, 6pm, 8pm, and 10pm every day
    // We'll use timezone "America/Los_Angeles" for PST
    const schedule = ScheduleService.create(
      db,
      projectId,
      "system:setup",
      {
        name: "Leopard Heartbeat",
        description: "Automatic self-improvement cycles for the Leopard agent. Runs every 2 hours from 8am-10pm PST.",
        actionType: "action",
        actionConfig: {
          actionId: "heartbeat.leopard",
          actionParams: {
            projectId: "prj_2go5oq0sa9o-51985ca1",
            message: "Read PRIORITIES.md. Check CHANGELOG-AUTO.md for recent work. Run tests (bun test). Pick the highest priority item and make one small improvement. Commit and deploy if tests pass."
          }
        },
        cronExpression: "0 8,10,12,14,16,18,20,22 * * *",
        timezone: "America/Los_Angeles",
        enabled: true,
        maxRuntimeMs: 30 * 60 * 1000, // 30 minutes max runtime
      }
    );

    console.log("✅ Created Leopard heartbeat schedule:", schedule.id);
    console.log("📅 Schedule:", schedule.cronExpression, "(" + schedule.timezone + ")");
    console.log("⏰ Next run:", schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "Not scheduled");
    console.log("📝 Description:", schedule.description);

  } catch (error) {
    console.error("❌ Failed to set up Leopard heartbeat schedule:", error);
    process.exit(1);
  }
}

main();