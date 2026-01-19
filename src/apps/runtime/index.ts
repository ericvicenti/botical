/**
 * App Runtime
 *
 * Executes app code, manages state, and generates UI trees.
 * Handles hot reloading with state preservation.
 */

import type {
  ManagedApp,
  AppDefinition,
  AppContext,
  AppToolDefinition,
  UITree,
  StateHandle,
  IrisPlatformContext,
  SDRMessage,
  UISyncPayload,
  AppErrorPayload,
} from "../types.ts";
import { generateId } from "../../utils/id.ts";

type Listener = (message: SDRMessage) => void;

/**
 * App Runtime - manages a single app instance
 */
export class AppRuntime {
  private app: ManagedApp;
  private projectPath: string;
  private definition: AppDefinition | null = null;
  private state: Record<string, StateHandle<unknown>> = {};
  private tools: Map<string, AppToolDefinition> = new Map();
  private listeners: Set<Listener> = new Set();
  private stateUnsubscribers: Array<() => void> = [];

  constructor(app: ManagedApp, projectPath: string) {
    this.app = app;
    this.projectPath = projectPath;
  }

  /**
   * Initialize the runtime - load the app module
   */
  async initialize(): Promise<void> {
    const modulePath = `${this.app.path}/${this.app.manifest.server}`;
    await this.loadModule(modulePath);
  }

  /**
   * Activate the app - call onActivate hook
   */
  async activate(): Promise<void> {
    if (!this.definition) {
      throw new Error("App not initialized");
    }

    const ctx = this.createContext();

    if (this.definition.onActivate) {
      await this.definition.onActivate(ctx);
    }

    // Subscribe to state changes
    this.subscribeToState();

    // Send initial UI
    this.broadcastUI();
  }

  /**
   * Deactivate the app
   */
  async deactivate(): Promise<void> {
    // Unsubscribe from state
    this.stateUnsubscribers.forEach((unsub) => unsub());
    this.stateUnsubscribers = [];

    if (this.definition?.onDeactivate) {
      const ctx = this.createContext();
      await this.definition.onDeactivate(ctx);
    }
  }

  /**
   * Hot reload the app with state preservation
   */
  async reload(): Promise<void> {
    // 1. Snapshot current state
    const stateSnapshot = this.snapshotState();

    // 2. Unsubscribe from state changes
    this.stateUnsubscribers.forEach((unsub) => unsub());
    this.stateUnsubscribers = [];

    // 3. Clear module cache (Bun-specific)
    const modulePath = `${this.app.path}/${this.app.manifest.server}`;
    this.clearModuleCache(modulePath);

    // 4. Reload module
    await this.loadModule(modulePath);

    // 5. Restore state
    this.restoreState(stateSnapshot);

    // 6. Call onReload hook
    if (this.definition?.onReload) {
      const ctx = this.createContext();
      await this.definition.onReload(ctx, stateSnapshot);
    }

    // 7. Re-subscribe to state
    this.subscribeToState();

    // 8. Broadcast new UI
    this.broadcastUI();

    // 9. Notify clients of reload
    this.broadcast({
      id: generateId(),
      type: "app:reload",
      payload: {},
      timestamp: Date.now(),
    });
  }

  /**
   * Generate current UI tree
   */
  generateUI(): UITree {
    if (!this.definition) {
      return null;
    }

    try {
      const ctx = this.createContext();
      return this.definition.ui(ctx);
    } catch (error) {
      this.broadcastError("ui_generation", error);
      return null;
    }
  }

  /**
   * Execute an action (tool call from UI)
   */
  async executeAction(action: string, args?: unknown): Promise<unknown> {
    const tool = this.tools.get(action);

    if (!tool) {
      // Check if it's a state setter
      if (action.startsWith("state:")) {
        const stateName = action.slice(6);
        const stateHandle = this.state[stateName];
        if (stateHandle) {
          stateHandle.set(args);
          return;
        }
      }

      throw new Error(`Unknown action: ${action}`);
    }

    // Validate args if tool has parameters
    // TODO: Add Zod validation

    try {
      const ctx = this.createContext();
      return await tool.execute(args, ctx);
    } catch (error) {
      this.broadcastError("action", error);
      throw error;
    }
  }

  /**
   * Subscribe to runtime messages (for WebSocket bridge)
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get all tools for AI integration
   */
  getTools(): AppToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Dispose of the runtime
   */
  async dispose(): Promise<void> {
    await this.deactivate();
    this.listeners.clear();
    this.tools.clear();
    this.state = {};
    this.definition = null;
  }

  // ============================================================================
  // Private Implementation
  // ============================================================================

  private async loadModule(modulePath: string): Promise<void> {
    try {
      // Dynamic import with cache busting for hot reload
      const moduleUrl = `file://${modulePath}?t=${Date.now()}`;
      const module = await import(moduleUrl);

      // Get the default export (app definition)
      this.definition = module.default as AppDefinition;

      // Initialize state
      this.initializeState();

      // Register tools
      this.registerTools();
    } catch (error) {
      throw new Error(`Failed to load app module: ${error}`);
    }
  }

  private clearModuleCache(modulePath: string): void {
    // Bun doesn't have require.cache like Node
    // The cache busting query string handles this
    // TODO: Investigate Bun.Transpiler for proper module invalidation
  }

  private initializeState(): void {
    if (!this.definition?.state) {
      this.state = {};
      return;
    }

    this.state = {};
    for (const [key, factory] of Object.entries(this.definition.state)) {
      this.state[key] = factory();
    }
  }

  private registerTools(): void {
    this.tools.clear();

    if (!this.definition?.tools) return;

    for (const tool of this.definition.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  private subscribeToState(): void {
    // Subscribe to all state changes to trigger UI updates
    for (const [key, handle] of Object.entries(this.state)) {
      const unsub = handle.subscribe(() => {
        this.broadcastUI();
      });
      this.stateUnsubscribers.push(unsub);
    }
  }

  private snapshotState(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const [key, handle] of Object.entries(this.state)) {
      snapshot[key] = handle.toJSON();
    }
    return snapshot;
  }

  private restoreState(snapshot: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(snapshot)) {
      const handle = this.state[key];
      if (handle) {
        handle.set(value);
      }
    }
  }

  private createContext(): AppContext {
    return {
      state: this.state,
      runTool: (name, args) => this.executeAction(name, args),
      iris: this.createIrisContext(),
    };
  }

  private createIrisContext(): IrisPlatformContext {
    // TODO: Implement actual platform integration
    // For now, return stubs that log and throw

    return {
      ai: {
        chat: async (messages, options) => {
          // TODO: Connect to Iris AI service
          console.log("[IrisApp] AI chat called:", { messages, options });
          throw new Error("AI not yet implemented");
        },
      },

      fs: {
        read: async (path) => {
          // TODO: Scoped file reading
          const fullPath = this.resolvePath(path);
          const file = Bun.file(fullPath);
          return file.text();
        },

        write: async (path, content) => {
          // TODO: Scoped file writing with permission check
          const fullPath = this.resolvePath(path);
          await Bun.write(fullPath, content);
        },

        list: async (path) => {
          // TODO: Scoped directory listing
          const fullPath = this.resolvePath(path);
          const glob = new Bun.Glob("*");
          const entries: Array<{ name: string; isDirectory: boolean }> = [];

          for await (const entry of glob.scan({ cwd: fullPath, onlyFiles: false })) {
            entries.push({
              name: entry,
              isDirectory: !entry.includes("."), // TODO: Proper detection
            });
          }

          return entries;
        },
      },

      navigate: (path) => {
        // TODO: Send navigation event to Iris
        console.log("[IrisApp] Navigate:", path);
      },

      notify: (message, options) => {
        // TODO: Send notification to Iris
        console.log("[IrisApp] Notify:", message, options);
      },

      project: {
        id: this.app.projectId,
        path: this.projectPath,
        name: this.projectPath.split("/").pop() || "unknown",
      },
    };
  }

  private resolvePath(path: string): string {
    // Handle special prefixes
    if (path.startsWith("$PROJECT/")) {
      return `${this.projectPath}/${path.slice(9)}`;
    }
    if (path.startsWith("$APP/")) {
      return `${this.app.path}/${path.slice(5)}`;
    }

    // Relative paths are relative to project
    if (!path.startsWith("/")) {
      return `${this.projectPath}/${path}`;
    }

    // TODO: Validate path doesn't escape sandbox
    return path;
  }

  private broadcast(message: SDRMessage): void {
    this.listeners.forEach((listener) => listener(message));
  }

  private broadcastUI(): void {
    const tree = this.generateUI();
    const state = this.snapshotState();

    const payload: UISyncPayload = { tree, state };

    this.broadcast({
      id: generateId(),
      type: "ui:sync",
      payload,
      timestamp: Date.now(),
    });
  }

  private broadcastError(category: AppErrorPayload["category"], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // TODO: Parse stack for file/line info

    const payload: AppErrorPayload = {
      category,
      message,
      stack,
      recoverable: true,
    };

    this.broadcast({
      id: generateId(),
      type: "app:error",
      payload,
      timestamp: Date.now(),
    });
  }
}
