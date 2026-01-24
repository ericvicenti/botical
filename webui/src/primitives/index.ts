/**
 * Iris Primitives
 *
 * A unified interface for Pages (UI surfaces) and Actions (operations).
 * Pages and Actions can be used from GUI, Agents, and Tests.
 */

// Types
export type {
  ActionResult,
  ActionContext,
  ActionDefinition,
  PageDefinition,
  PageCategory,
} from "./types";

// Registry functions
export {
  defineAction,
  definePage,
  getAction,
  getPage,
  getAllActions,
  getAllPages,
  getPagesByCategory,
  executeAction,
  matchPageRoute,
  getPageUrl,
} from "./registry";

// React hooks
export { usePageOpener, useActionExecutor } from "./hooks";
