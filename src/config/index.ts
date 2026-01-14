import path from "path";
import os from "os";
import { z } from "zod";

/**
 * Configuration schema with defaults
 */
const ConfigSchema = z.object({
  dataDir: z.string(),
  port: z.number().default(4096),
  host: z.string().default("localhost"),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type ConfigOptions = z.infer<typeof ConfigSchema>;

/**
 * Get default data directory based on platform
 */
function getDefaultDataDir(): string {
  const home = os.homedir();
  return path.join(home, ".iris");
}

/**
 * Configuration singleton
 */
class ConfigManager {
  private static instance: ConfigManager;
  private config: ConfigOptions | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from environment and optional overrides
   */
  load(overrides: Partial<ConfigOptions> = {}): ConfigOptions {
    const envConfig = {
      dataDir: process.env.IRIS_DATA_DIR || getDefaultDataDir(),
      port: process.env.IRIS_PORT
        ? parseInt(process.env.IRIS_PORT, 10)
        : undefined,
      host: process.env.IRIS_HOST,
      logLevel: process.env.IRIS_LOG_LEVEL as ConfigOptions["logLevel"],
    };

    // Remove undefined values
    const cleanEnvConfig = Object.fromEntries(
      Object.entries(envConfig).filter(([, v]) => v !== undefined)
    );

    this.config = ConfigSchema.parse({
      ...cleanEnvConfig,
      ...overrides,
    });

    return this.config;
  }

  /**
   * Get current configuration (must call load() first)
   */
  get(): ConfigOptions {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Get the data directory
   */
  getDataDir(): string {
    return this.get().dataDir;
  }

  /**
   * Get the root database path
   */
  getRootDbPath(): string {
    return path.join(this.getDataDir(), "iris.db");
  }

  /**
   * Get the project database path
   */
  getProjectDbPath(projectId: string): string {
    return path.join(this.getDataDir(), "projects", projectId, "project.db");
  }

  /**
   * Get the project data directory
   */
  getProjectDir(projectId: string): string {
    return path.join(this.getDataDir(), "projects", projectId);
  }
}

export const Config = ConfigManager.getInstance();
