/**
 * Configuration Module
 *
 * Manages application configuration using a singleton pattern.
 * See: docs/knowledge-base/01-architecture.md#technology-choices
 *
 * Configuration is loaded from environment variables with sensible defaults.
 * The data directory structure supports the multi-database architecture:
 * - Root DB at: {dataDir}/iris.db
 * - Project DBs at: {dataDir}/projects/{projectId}/project.db
 *
 * See: docs/knowledge-base/01-architecture.md#database-architecture
 */

import path from "path";
import os from "os";
import { z } from "zod";

/**
 * Configuration schema validated with Zod for type safety.
 * See: docs/knowledge-base/01-architecture.md#zod
 */
const ConfigSchema = z.object({
  // Server settings
  dataDir: z.string(),
  port: z.number().default(4096),
  host: z.string().default("localhost"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Environment
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Auth & Email settings
  appUrl: z.string().url().default("http://localhost:4096"),
  resendApiKey: z.string().optional(),
  emailFrom: z.string().email().optional(),

  // Security
  encryptionKey: z.string().optional(),
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
 * Configuration singleton providing centralized configuration management.
 * Uses singleton pattern to ensure consistent configuration across the application.
 * See: docs/knowledge-base/04-patterns.md#singleton-pattern
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
      // Server settings
      dataDir: process.env.IRIS_DATA_DIR || getDefaultDataDir(),
      port: process.env.IRIS_PORT
        ? parseInt(process.env.IRIS_PORT, 10)
        : undefined,
      host: process.env.IRIS_HOST,
      logLevel: process.env.IRIS_LOG_LEVEL as ConfigOptions["logLevel"],

      // Environment
      nodeEnv: process.env.NODE_ENV as ConfigOptions["nodeEnv"],

      // Auth & Email
      appUrl: process.env.APP_URL,
      resendApiKey: process.env.RESEND_API_KEY,
      emailFrom: process.env.EMAIL_FROM,

      // Security
      encryptionKey: process.env.IRIS_ENCRYPTION_KEY,
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
