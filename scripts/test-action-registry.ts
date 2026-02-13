#!/usr/bin/env bun

/**
 * Test Action Registry
 *
 * Tests if the heartbeat.leopard action is properly registered.
 */

import { ActionRegistry, registerAllActions } from "../src/actions/index.ts";

function main() {
  console.log("Testing action registry...");

  // Register all actions
  registerAllActions();

  console.log("🔍 Checking registered actions...");
  const allActions = ActionRegistry.getAll();
  console.log(`📊 Total registered actions: ${allActions.length}`);

  // Look for heartbeat actions
  const heartbeatActions = allActions.filter(a => a.definition.id.startsWith("heartbeat"));
  console.log(`💓 Heartbeat actions found: ${heartbeatActions.length}`);
  
  for (const action of heartbeatActions) {
    console.log(`  - ${action.definition.id}: ${action.definition.label}`);
  }

  // Check specifically for heartbeat.leopard
  const leopardHeartbeat = ActionRegistry.get("heartbeat.leopard");
  if (leopardHeartbeat) {
    console.log("✅ heartbeat.leopard action is registered!");
  } else {
    console.log("❌ heartbeat.leopard action is NOT registered!");
  }
}

main();