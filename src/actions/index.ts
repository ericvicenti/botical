/**
 * Botical Actions
 *
 * Central module for the action system. Actions are operations that can be
 * performed by AI agents (as tools) or users (via command palette).
 */

// Export types
export * from "./types.ts";

// Export registry
export { ActionRegistry } from "./registry.ts";
export type { RegisteredAction, ToToolsOptions } from "./registry.ts";

// Import actions
import { gitActions } from "./git.ts";
import { fileActions } from "./file.ts";
import { searchActions } from "./search.ts";
import { settingsActions } from "./settings.ts";
import { viewActions } from "./view.ts";
import { shellActions } from "./shell.ts";
import { agentActions } from "./agent.ts";
import { workflowActions } from "./workflow.ts";
import { projectActions } from "./project.ts";
import { utilityActions } from "./utility.ts";
import { webSearchActions } from "./websearch.ts";
import { heartbeatActions } from "./heartbeat.ts";
import { ActionRegistry } from "./registry.ts";

/**
 * Register all built-in actions
 */
export function registerAllActions(): void {
  // Git actions
  for (const action of gitActions) {
    ActionRegistry.register(action);
  }

  // File actions
  for (const action of fileActions) {
    ActionRegistry.register(action);
  }

  // Search actions
  for (const action of searchActions) {
    ActionRegistry.register(action);
  }

  // Settings/UI actions
  for (const action of settingsActions) {
    ActionRegistry.register(action);
  }

  // View/navigation actions
  for (const action of viewActions) {
    ActionRegistry.register(action);
  }

  // Shell actions
  for (const action of shellActions) {
    ActionRegistry.register(action);
  }

  // Agent actions
  for (const action of agentActions) {
    ActionRegistry.register(action);
  }

  // Workflow actions
  for (const action of workflowActions) {
    ActionRegistry.register(action);
  }

  // Project actions
  for (const action of projectActions) {
    ActionRegistry.register(action);
  }

  // Utility actions
  for (const action of utilityActions) {
    ActionRegistry.register(action);
  }

  // Web search actions
  for (const action of webSearchActions) {
    ActionRegistry.register(action);
  }

  // Heartbeat actions
  for (const action of heartbeatActions) {
    ActionRegistry.register(action);
  }
}

// Export individual actions for direct use
export {
  gitCommit,
  gitStatus,
  gitDiff,
  gitLog,
  gitActions,
} from "./git.ts";

export {
  fileRead,
  fileWrite,
  fileEdit,
  fileActions,
} from "./file.ts";

export {
  searchGlob,
  searchGrep,
  searchActions,
} from "./search.ts";

export {
  setTheme,
  toggleSidebar,
  setSidebarPanel,
  settingsActions,
} from "./settings.ts";

export {
  openFile,
  openProject,
  openTask,
  openSettings,
  closeTab,
  closeAllTabs,
  viewActions,
} from "./view.ts";

export {
  shellRun,
  shellSpawn,
  shellActions,
} from "./shell.ts";

export {
  agentTask,
  agentNewTask,
  agentActions,
} from "./agent.ts";

export {
  workflowNew,
  workflowOpen,
  workflowDelete,
  workflowActions,
} from "./workflow.ts";

export {
  projectDelete,
  projectOpen,
  projectActions,
} from "./project.ts";

export {
  utilityWait,
  utilityActions,
} from "./utility.ts";

export {
  webSearch,
  webSearchActions,
} from "./websearch.ts";

export {
  leopardHeartbeat,
  heartbeatActions,
} from "./heartbeat.ts";
