#!/usr/bin/env bun

/**
 * Test Leopard Heartbeat
 *
 * Manually triggers the leopard heartbeat schedule to verify it works.
 */

import { DatabaseManager } from "../src/database/index.ts";
import { ScheduleService } from "../src/services/schedules.ts";
import { Scheduler } from "../src/services/scheduler.ts";

async function main() {
  console.log("Testing Leopard heartbeat...");

  try {
    await DatabaseManager.initialize();
    const db = DatabaseManager.getProjectDb("prj_root");

    // Find the heartbeat schedule
    const schedules = ScheduleService.list(db, "prj_root", { limit: 100 });
    const leopardHeartbeat = schedules.find(s => s.name === "Leopard Heartbeat");

    if (!leopardHeartbeat) {
      console.error("❌ Leopard heartbeat schedule not found. Run setup-leopard-heartbeat.ts first.");
      process.exit(1);
    }

    console.log("📅 Found Leopard heartbeat schedule:", leopardHeartbeat.id);
    console.log("⚙️ Action:", leopardHeartbeat.actionType, "->", (leopardHeartbeat.actionConfig as any).actionId);

    // Manually trigger it
    console.log("🚀 Triggering heartbeat manually...");
    const result = await Scheduler.triggerNow("prj_root", leopardHeartbeat.id);
    console.log("✅ Heartbeat triggered! Run ID:", result.runId);

    // Wait a moment for execution to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check the run status
    const runs = ScheduleService.listRuns(db, leopardHeartbeat.id, { limit: 5 });
    const latestRun = runs[0];
    
    if (latestRun) {
      console.log("📊 Latest run:", {
        id: latestRun.id,
        status: latestRun.status,
        scheduledFor: new Date(latestRun.scheduledFor).toISOString(),
        startedAt: latestRun.startedAt ? new Date(latestRun.startedAt).toISOString() : null,
        completedAt: latestRun.completedAt ? new Date(latestRun.completedAt).toISOString() : null,
        error: latestRun.error,
      });
    }

  } catch (error) {
    console.error("❌ Failed to test Leopard heartbeat:", error);
    process.exit(1);
  }
}

main();