/**
 * Built-in Agents Index
 *
 * Exports all built-in agent configurations.
 * These agents are always available and cannot be modified or deleted.
 */

import type { AgentConfig } from "../types.ts";
import { defaultAgent } from "./default.ts";
import { exploreAgent } from "./explore.ts";
import { planAgent } from "./plan.ts";

/**
 * All built-in agents mapped by name
 */
export const BUILTIN_AGENTS: ReadonlyMap<string, AgentConfig> = new Map([
  [defaultAgent.name, defaultAgent],
  [exploreAgent.name, exploreAgent],
  [planAgent.name, planAgent],
]);

/**
 * Get a built-in agent by name
 */
export function getBuiltinAgent(name: string): AgentConfig | undefined {
  return BUILTIN_AGENTS.get(name);
}

/**
 * Check if a name is a built-in agent
 */
export function isBuiltinAgent(name: string): boolean {
  return BUILTIN_AGENTS.has(name);
}

/**
 * Get all built-in agents as an array
 */
export function getAllBuiltinAgents(): AgentConfig[] {
  return Array.from(BUILTIN_AGENTS.values());
}

/**
 * Get built-in agents filtered by mode
 */
export function getBuiltinAgentsByMode(
  mode: "primary" | "subagent"
): AgentConfig[] {
  return getAllBuiltinAgents().filter(
    (agent) => agent.mode === mode || agent.mode === "all"
  );
}

// Re-export individual agents for direct access
export { defaultAgent } from "./default.ts";
export { exploreAgent } from "./explore.ts";
export { planAgent } from "./plan.ts";
