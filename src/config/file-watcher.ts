/**
 * File Watcher for Configuration Hot-Reload
 *
 * Watches .botical/ directories for changes and emits events
 * when configuration files are added, modified, or deleted.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Types of file change events
 */
export type FileChangeType = "add" | "change" | "unlink";

/**
 * Configuration file types we watch
 */
export type ConfigFileType = "workflow" | "service" | "agent" | "config";

/**
 * File change event
 */
export interface FileChangeEvent {
  type: FileChangeType;
  fileType: ConfigFileType;
  name: string;
  filePath: string;
}

/**
 * File change handler
 */
export type FileChangeHandler = (event: FileChangeEvent) => void;

/**
 * Options for the config file watcher
 */
export interface ConfigWatcherOptions {
  /** Debounce delay in milliseconds (default: 100) */
  debounceMs?: number;
  /** Handler called when files change */
  onChange: FileChangeHandler;
}

/**
 * Config File Watcher
 *
 * Watches a project's .botical/ directory for configuration changes.
 */
export class ConfigFileWatcher {
  private watchers: fs.FSWatcher[] = [];
  private projectPath: string;
  private options: Required<ConfigWatcherOptions>;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(projectPath: string, options: ConfigWatcherOptions) {
    this.projectPath = projectPath;
    this.options = {
      debounceMs: options.debounceMs ?? 100,
      onChange: options.onChange,
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    const boticalDir = path.join(this.projectPath, ".botical");

    // Watch directories
    const watchDirs: Array<{ dir: string; fileType: ConfigFileType }> = [
      { dir: path.join(boticalDir, "workflows"), fileType: "workflow" },
      { dir: path.join(boticalDir, "services"), fileType: "service" },
      { dir: path.join(boticalDir, "agents"), fileType: "agent" },
    ];

    for (const { dir, fileType } of watchDirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }

      try {
        const watcher = fs.watch(dir, (eventType, filename) => {
          if (!filename || (!filename.endsWith(".yaml") && !filename.endsWith(".yml"))) {
            return;
          }

          const name = filename.replace(/\.(yaml|yml)$/, "");
          const filePath = path.join(dir, filename);

          this.emitDebounced(filePath, {
            type: this.getChangeType(eventType, filePath),
            fileType,
            name,
            filePath,
          });
        });

        this.watchers.push(watcher);
      } catch (error) {
        console.error(`Failed to watch directory ${dir}:`, error);
      }
    }

    // Watch config.yaml separately
    const configPath = path.join(boticalDir, "config.yaml");
    if (fs.existsSync(boticalDir)) {
      try {
        const watcher = fs.watch(boticalDir, (eventType, filename) => {
          if (filename !== "config.yaml") {
            return;
          }

          this.emitDebounced(configPath, {
            type: this.getChangeType(eventType, configPath),
            fileType: "config",
            name: "config",
            filePath: configPath,
          });
        });

        this.watchers.push(watcher);
      } catch (error) {
        console.error(`Failed to watch .botical directory:`, error);
      }
    }
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    this.debounceTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();
  }

  /**
   * Determine the change type based on event and file existence
   */
  private getChangeType(eventType: string, filePath: string): FileChangeType {
    if (eventType === "rename") {
      return fs.existsSync(filePath) ? "add" : "unlink";
    }
    return "change";
  }

  /**
   * Emit event with debouncing to avoid duplicate events
   */
  private emitDebounced(key: string, event: FileChangeEvent): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.options.onChange(event);
    }, this.options.debounceMs);

    this.debounceTimers.set(key, timer);
  }
}

/**
 * Create and start a config file watcher
 *
 * @param projectPath - The project's root path
 * @param onChange - Handler called when files change
 * @returns The watcher instance (call stop() when done)
 */
export function watchConfigFiles(
  projectPath: string,
  onChange: FileChangeHandler
): ConfigFileWatcher {
  const watcher = new ConfigFileWatcher(projectPath, { onChange });
  watcher.start();
  return watcher;
}
