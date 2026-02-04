/**
 * Tool System
 *
 * Provides tools for AI agents to interact with the filesystem,
 * execute commands, and perform other operations.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

export * from "./types.ts";
export * from "./registry.ts";

// Import core tools
import { readTool } from "./read.ts";
import { writeTool } from "./write.ts";
import { editTool } from "./edit.ts";
import { bashTool } from "./bash.ts";
import { serviceTool } from "./service.ts";
import { globTool } from "./glob.ts";
import { grepTool } from "./grep.ts";
import { taskTool } from "./task.ts";
import { readSkillTool } from "./read-skill.ts";
import { scheduleTool } from "./schedule.ts";
import { ToolRegistry } from "./registry.ts";

/**
 * Register all core tools
 */
export function registerCoreTools(): void {
  // Filesystem tools (safe - no code execution)
  ToolRegistry.register(readTool, {
    category: "filesystem",
    requiresCodeExecution: false,
  });

  ToolRegistry.register(writeTool, {
    category: "filesystem",
    requiresCodeExecution: false,
  });

  ToolRegistry.register(editTool, {
    category: "filesystem",
    requiresCodeExecution: false,
  });

  // Search tools (safe - no code execution)
  ToolRegistry.register(globTool, {
    category: "search",
    requiresCodeExecution: false,
  });

  ToolRegistry.register(grepTool, {
    category: "search",
    requiresCodeExecution: false,
  });

  // Execution tools (requires permission)
  ToolRegistry.register(bashTool, {
    category: "execution",
    requiresCodeExecution: true,
  });

  ToolRegistry.register(serviceTool, {
    category: "execution",
    requiresCodeExecution: true,
  });

  // Agent tools (spawning sub-agents)
  ToolRegistry.register(taskTool, {
    category: "agent",
    requiresCodeExecution: false, // Task tool itself doesn't execute code
  });

  ToolRegistry.register(readSkillTool, {
    category: "agent",
    requiresCodeExecution: false, // Just reads skill files
  });

  // Schedule tool (project automation)
  ToolRegistry.register(scheduleTool, {
    category: "other",
    requiresCodeExecution: false, // Manages schedules, doesn't execute code directly
  });

  // Note: Git operations are now handled via ActionRegistry
  // See src/actions/git.ts for git actions
}

// Export individual tools for direct use
export { readTool } from "./read.ts";
export { writeTool } from "./write.ts";
export { editTool } from "./edit.ts";
export { bashTool } from "./bash.ts";
export { serviceTool } from "./service.ts";
export { globTool } from "./glob.ts";
export { grepTool } from "./grep.ts";
export { taskTool } from "./task.ts";
export { readSkillTool } from "./read-skill.ts";
export { scheduleTool } from "./schedule.ts";
// Git actions moved to src/actions/git.ts
