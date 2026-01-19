/**
 * Iris Apps System
 *
 * Modular app system with Server-Defined Rendering (SDR).
 * Apps are single-file TypeScript modules that run in Iris and expose
 * tools to AI agents.
 */

// Types
export * from "./types.ts";

// Manager
export { AppManager, getAppManager, disposeAppManager } from "./manager/index.ts";

// Runtime
export { AppRuntime } from "./runtime/index.ts";
