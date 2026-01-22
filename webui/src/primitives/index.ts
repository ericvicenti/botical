// Iris Primitives
// A unified interface for GUI, Agent, and Testing

// Types
export type {
  ActionResult,
  ActionContext,
  ActionDefinition,
  PageDefinition,
  ActionRegistry,
  PageRegistry,
} from "./types";

// Registry functions
export {
  defineAction,
  definePage,
  getAction,
  getPage,
  getAllActions,
  getAllPages,
  executeAction,
  getPageByRoute,
  getPageUrl,
} from "./registry";

// React hooks
export { usePageOpener, useActionExecutor } from "./hooks";
