/**
 * App Manager
 *
 * Discovers, loads, and manages Iris Apps within a project.
 * Handles app lifecycle: discover → load → activate → deactivate → unload
 */

import type {
  AppManifest,
  ManagedApp,
  DiscoveredApp,
  AppStatus,
  TrustLevel,
  AppError,
} from "../types.ts";
import { AppManifestSchema } from "../types.ts";
import { AppRuntime } from "../runtime/index.ts";
import { HotReloadManager } from "../hot-reload.ts";

/**
 * App Manager - singleton per project
 */
export class AppManager {
  private apps = new Map<string, ManagedApp>();
  private runtimes = new Map<string, AppRuntime>();
  private hotReload: HotReloadManager;
  private projectId: string;
  private projectPath: string;

  constructor(projectId: string, projectPath: string) {
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.hotReload = new HotReloadManager(this, {
      debounceMs: 150, // Wait 150ms after last change
    });
  }

  /**
   * Discover all apps in the project
   * Looks for app.json files in standard locations
   */
  async discover(): Promise<DiscoveredApp[]> {
    const discovered: DiscoveredApp[] = [];
    const searchPaths = [
      `${this.projectPath}/apps`,
      `${this.projectPath}/.iris/apps`,
    ];

    for (const searchPath of searchPaths) {
      try {
        const entries = await this.listDirectory(searchPath);
        for (const entry of entries) {
          if (!entry.isDirectory) continue;

          const appPath = `${searchPath}/${entry.name}`;
          const manifestPath = `${appPath}/app.json`;

          try {
            const manifest = await this.loadManifest(manifestPath);
            discovered.push({
              path: appPath,
              manifest,
              trustLevel: this.determineTrustLevel(appPath),
            });
          } catch {
            // Not a valid app, skip
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return discovered;
  }

  /**
   * Load an app by path
   */
  async load(appPath: string): Promise<ManagedApp> {
    const id = this.generateAppId(appPath);

    // Check if already loaded
    if (this.apps.has(id)) {
      return this.apps.get(id)!;
    }

    // Load manifest
    const manifestPath = `${appPath}/app.json`;
    const manifest = await this.loadManifest(manifestPath);

    // Create managed app
    const app: ManagedApp = {
      id,
      path: appPath,
      manifest,
      status: "loading",
      trustLevel: this.determineTrustLevel(appPath),
      projectId: this.projectId,
    };

    this.apps.set(id, app);

    // Create runtime
    try {
      const runtime = new AppRuntime(app, this.projectPath);
      await runtime.initialize();
      this.runtimes.set(id, runtime);
      app.status = "ready";
    } catch (error) {
      app.status = "error";
      app.error = this.createError("server_load", error);
    }

    return app;
  }

  /**
   * Activate an app (start running it)
   */
  async activate(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) {
      throw new Error(`App not found: ${appId}`);
    }

    if (app.status !== "ready") {
      throw new Error(`App not ready: ${appId} (status: ${app.status})`);
    }

    const runtime = this.runtimes.get(appId);
    if (!runtime) {
      throw new Error(`Runtime not found: ${appId}`);
    }

    try {
      await runtime.activate();
      app.status = "active";

      // Start file watching for hot reload
      this.startWatching(app);
    } catch (error) {
      app.status = "error";
      app.error = this.createError("server_load", error);
      throw error;
    }
  }

  /**
   * Deactivate an app
   */
  async deactivate(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    if (!app) return;

    const runtime = this.runtimes.get(appId);
    if (runtime) {
      await runtime.deactivate();
    }

    this.stopWatching(appId);
    app.status = "ready";
  }

  /**
   * Unload an app completely
   */
  async unload(appId: string): Promise<void> {
    await this.deactivate(appId);

    const runtime = this.runtimes.get(appId);
    if (runtime) {
      await runtime.dispose();
      this.runtimes.delete(appId);
    }

    this.apps.delete(appId);
  }

  /**
   * Get a managed app by ID
   */
  get(appId: string): ManagedApp | undefined {
    return this.apps.get(appId);
  }

  /**
   * Get runtime for an app
   */
  getRuntime(appId: string): AppRuntime | undefined {
    return this.runtimes.get(appId);
  }

  /**
   * Get all managed apps
   */
  getAll(): ManagedApp[] {
    return Array.from(this.apps.values());
  }

  /**
   * Get active apps
   */
  getActive(): ManagedApp[] {
    return this.getAll().filter((app) => app.status === "active");
  }

  /**
   * Hot reload an app
   */
  async hotReload(appId: string): Promise<void> {
    const app = this.apps.get(appId);
    const runtime = this.runtimes.get(appId);

    if (!app || !runtime) {
      throw new Error(`App not found: ${appId}`);
    }

    try {
      await runtime.reload();
      app.error = undefined;
    } catch (error) {
      app.error = this.createError("server_load", error);
      // Don't change status - keep showing last valid UI with error overlay
    }
  }

  /**
   * Cleanup all apps
   */
  async dispose(): Promise<void> {
    for (const appId of this.apps.keys()) {
      await this.unload(appId);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateAppId(appPath: string): string {
    // Use relative path from project as ID
    const relativePath = appPath.replace(this.projectPath, "").replace(/^\//, "");
    return `app:${relativePath.replace(/\//g, ":")}`;
  }

  private async loadManifest(path: string): Promise<AppManifest> {
    const file = Bun.file(path);
    const content = await file.text();
    const json = JSON.parse(content);
    return AppManifestSchema.parse(json);
  }

  private async listDirectory(
    path: string
  ): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const glob = new Bun.Glob("*");
    const entries: Array<{ name: string; isDirectory: boolean }> = [];

    for await (const entry of glob.scan({ cwd: path, onlyFiles: false })) {
      const stat = await Bun.file(`${path}/${entry}`).exists();
      // TODO: Proper directory detection
      entries.push({
        name: entry,
        isDirectory: !entry.includes("."),
      });
    }

    return entries;
  }

  private determineTrustLevel(appPath: string): TrustLevel {
    // Apps in the current project are development apps
    if (appPath.startsWith(this.projectPath)) {
      return "development";
    }

    // TODO: Check for installed apps from registry
    // TODO: Check for signature verification

    return "untrusted";
  }

  private createError(category: AppError["category"], error: unknown): AppError {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // TODO: Parse stack trace for file/line info

    return {
      category,
      message,
      stack,
      recoverable: true,
    };
  }

  private startWatching(app: ManagedApp): void {
    this.hotReload.watch(app.id, app.path);
  }

  private stopWatching(appId: string): void {
    this.hotReload.unwatch(appId);
  }
}

// ============================================================================
// Manager Registry (per project)
// ============================================================================

const managers = new Map<string, AppManager>();

/**
 * Get or create an AppManager for a project
 */
export function getAppManager(projectId: string, projectPath: string): AppManager {
  let manager = managers.get(projectId);
  if (!manager) {
    manager = new AppManager(projectId, projectPath);
    managers.set(projectId, manager);
  }
  return manager;
}

/**
 * Dispose manager for a project
 */
export async function disposeAppManager(projectId: string): Promise<void> {
  const manager = managers.get(projectId);
  if (manager) {
    await manager.dispose();
    managers.delete(projectId);
  }
}
