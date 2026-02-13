#!/usr/bin/env bun

/**
 * Test Direct Action Execution
 *
 * Tests calling ActionRegistry.execute() directly to isolate the issue.
 */

import { ActionRegistry, registerAllActions } from "../src/actions/index.ts";

async function main() {
  console.log("Testing direct action execution...");

  // Register all actions (like the server does)
  registerAllActions();

  console.log("🔍 Verifying heartbeat.leopard action exists...");
  const action = ActionRegistry.get("heartbeat.leopard");
  if (!action) {
    console.log("❌ heartbeat.leopard action is NOT found!");
    return;
  }
  console.log("✅ heartbeat.leopard action found!");

  console.log("🚀 Executing heartbeat.leopard action directly...");
  
  // Mock action context (similar to what the scheduler would provide)
  const actionContext = {
    projectId: "prj_root",
    projectPath: "/opt/ion-lynx/botical",
    userId: "system:test",
    sessionId: undefined,
  };

  // Execute the action with parameters
  const result = await ActionRegistry.execute(
    "heartbeat.leopard",
    {
      projectId: "prj_root",
      message: "Test heartbeat message - reading PRIORITIES.md and checking for improvements."
    },
    actionContext
  );

  console.log("📊 Action result:", {
    type: result.type,
    title: result.type === "success" ? result.title : undefined,
    output: result.type === "success" ? result.output : undefined,
    message: result.type === "error" ? result.message : undefined,
  });

  if (result.type === "success") {
    console.log("✅ Heartbeat action executed successfully!");
  } else {
    console.log("❌ Heartbeat action execution failed!");
  }
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});