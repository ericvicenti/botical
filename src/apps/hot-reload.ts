/**
 * Hot Reload Manager
 *
 * Manages file watching and hot reloading for Iris Apps.
 * Features:
 * - Debounced file watching (avoids multiple reloads on rapid saves)
 * - State preservation across reloads
 * - Graceful error handling
 */

import { watch, type FSWatcher } from "fs";
import type { AppManager } from "./manager/index.ts";

interface PendingReload {
  timeout: Timer;
  files: Set<string>;
}

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** File extensions to watch (default: .ts, .tsx, .json) */
  extensions?: string[];
  /** Ignore patterns */
  ignore?: RegExp[];
}

const DEFAULT_CONFIG: Required<HotReloadConfig> = {
  debounceMs: 100,
  extensions: [".ts", ".tsx", ".json"],
  ignore: [/node_modules/, /\.git/, /\.iris\/logs/],
};

/**
 * Hot Reload Manager
 */
export class HotReloadManager {
  private manager: AppManager;
  private config: Required<HotReloadConfig>;
  private watchers = new Map<string, FSWatcher>();
  private pending = new Map<string, PendingReload>();

  constructor(manager: AppManager, config: HotReloadConfig = {}) {
    this.manager = manager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching an app for changes
   */
  watch(appId: string, appPath: string): void {
    if (this.watchers.has(appId)) {
      return; // Already watching
    }

    console.log(`[HotReload] Watching ${appPath} for changes`);

    const watcher = watch(
      appPath,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;
        this.handleFileChange(appId, filename);
      }
    );

    this.watchers.set(appId, watcher);
  }

  /**
   * Stop watching an app
   */
  unwatch(appId: string): void {
    const watcher = this.watchers.get(appId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(appId);
    }

    // Cancel any pending reload
    const pending = this.pending.get(appId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(appId);
    }

    console.log(`[HotReload] Stopped watching app ${appId}`);
  }

  /**
   * Stop all watchers
   */
  dispose(): void {
    for (const appId of this.watchers.keys()) {
      this.unwatch(appId);
    }
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(appId: string, filename: string): void {
    // Check extension
    const hasValidExtension = this.config.extensions.some((ext) =>
      filename.endsWith(ext)
    );
    if (!hasValidExtension) {
      return;
    }

    // Check ignore patterns
    const isIgnored = this.config.ignore.some((pattern) =>
      pattern.test(filename)
    );
    if (isIgnored) {
      return;
    }

    console.log(`[HotReload] File changed: ${filename}`);

    // Debounce: accumulate changes and reload once
    let pending = this.pending.get(appId);
    if (pending) {
      // Add to existing pending reload
      pending.files.add(filename);
      clearTimeout(pending.timeout);
    } else {
      // Create new pending reload
      pending = {
        timeout: null as unknown as Timer,
        files: new Set([filename]),
      };
      this.pending.set(appId, pending);
    }

    // Schedule reload
    pending.timeout = setTimeout(() => {
      this.executeReload(appId);
    }, this.config.debounceMs);
  }

  /**
   * Execute the reload
   */
  private async executeReload(appId: string): Promise<void> {
    const pending = this.pending.get(appId);
    if (!pending) return;

    const files = Array.from(pending.files);
    this.pending.delete(appId);

    console.log(
      `[HotReload] Reloading ${appId} (${files.length} file(s) changed)`
    );

    try {
      await this.manager.hotReload(appId);
      console.log(`[HotReload] Successfully reloaded ${appId}`);
    } catch (error) {
      console.error(`[HotReload] Failed to reload ${appId}:`, error);
      // Error is already handled by the manager (sent to UI)
    }
  }
}

/**
 * Simple debounce utility
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: Timer | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, ms);
  };
}
