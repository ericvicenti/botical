/**
 * Project Configuration (YAML-based)
 *
 * Manages project-level configuration stored in .iris/config.yaml
 * This file contains project-wide settings that can be version-controlled.
 */

import { z } from "zod";
import {
  loadYamlFileWithSchema,
  saveYamlFile,
  yamlFileExists,
  getIrisPaths,
} from "./yaml.ts";

// ============================================================================
// YAML Schema
// ============================================================================

/**
 * Model configuration for agents
 */
const ModelConfigSchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxSteps: z.number().positive().optional(),
});

/**
 * Default agent configuration
 */
const DefaultAgentConfigSchema = z.object({
  name: z.string().optional(),
  model: ModelConfigSchema.optional(),
  tools: z.array(z.string()).optional(),
});

/**
 * Git configuration
 */
const GitConfigSchema = z.object({
  remote: z.string().optional(),
  branch: z.string().optional(),
  autoCommit: z.boolean().optional(),
  commitMessagePrefix: z.string().optional(),
});

/**
 * Installed skill from GitHub
 */
const InstalledSkillSchema = z.object({
  repo: z.string(), // "owner/repo" format
  ref: z.string().optional(), // branch, tag, or commit SHA
  installedAt: z.number(),
  enabled: z.boolean().default(true),
});

/**
 * Skills configuration
 */
const SkillsConfigSchema = z.object({
  installed: z.array(InstalledSkillSchema).optional(),
});

/**
 * Extensions configuration
 */
const ExtensionsConfigSchema = z.object({
  /** Enabled extension IDs */
  enabled: z.array(z.string()).optional(),
  /** Per-extension settings overrides */
  settings: z.record(z.string(), z.record(z.unknown())).optional(),
});

/**
 * Sidebar configuration
 */
const SidebarConfigSchema = z.object({
  /** Ordered list of page IDs to show in sidebar */
  panels: z.array(z.string()).optional(),
});

/**
 * Project YAML configuration schema
 */
export const ProjectConfigYamlSchema = z.object({
  // Project metadata
  name: z.string().optional(),
  description: z.string().optional(),

  // Default agent settings
  defaultAgent: DefaultAgentConfigSchema.optional(),

  // Model defaults
  model: ModelConfigSchema.optional(),

  // Enabled tools (whitelist or blacklist)
  tools: z.object({
    enabled: z.array(z.string()).optional(),
    disabled: z.array(z.string()).optional(),
  }).optional(),

  // Skills configuration (installed from GitHub)
  skills: SkillsConfigSchema.optional(),

  // Environment variables (non-sensitive)
  env: z.record(z.string()).optional(),

  // Git settings
  git: GitConfigSchema.optional(),

  // Extensions configuration
  extensions: ExtensionsConfigSchema.optional(),

  // Sidebar layout configuration
  sidebar: SidebarConfigSchema.optional(),

  // Custom settings (extensible)
  settings: z.record(z.unknown()).optional(),
});

export type ProjectConfigYaml = z.infer<typeof ProjectConfigYamlSchema>;
export type InstalledSkillConfig = z.infer<typeof InstalledSkillSchema>;

// ============================================================================
// Project Config Entity
// ============================================================================

/**
 * Full project configuration with all fields
 */
export interface ProjectConfig {
  name?: string;
  description?: string;
  defaultAgent?: {
    name?: string;
    model?: {
      providerId?: string;
      modelId?: string;
      temperature?: number;
      topP?: number;
      maxSteps?: number;
    };
    tools?: string[];
  };
  model?: {
    providerId?: string;
    modelId?: string;
    temperature?: number;
    topP?: number;
    maxSteps?: number;
  };
  tools?: {
    enabled?: string[];
    disabled?: string[];
  };
  skills?: {
    installed?: Array<{
      repo: string;
      ref?: string;
      installedAt: number;
      enabled: boolean;
    }>;
  };
  env?: Record<string, string>;
  git?: {
    remote?: string;
    branch?: string;
    autoCommit?: boolean;
    commitMessagePrefix?: string;
  };
  extensions?: {
    enabled?: string[];
    settings?: Record<string, Record<string, unknown>>;
  };
  sidebar?: {
    panels?: string[];
  };
  settings?: Record<string, unknown>;
}

// ============================================================================
// Project Config Service
// ============================================================================

/**
 * YAML-based Project Configuration Service
 *
 * Reads and writes project configuration from .iris/config.yaml
 */
export const ProjectConfigService = {
  /**
   * Get config file path for a project
   */
  getPath(projectPath: string): string {
    return getIrisPaths(projectPath).config;
  },

  /**
   * Check if config exists
   */
  exists(projectPath: string): boolean {
    return yamlFileExists(this.getPath(projectPath));
  },

  /**
   * Load project configuration
   * Returns empty config if file doesn't exist
   */
  load(projectPath: string): ProjectConfig {
    const filePath = this.getPath(projectPath);
    const yaml = loadYamlFileWithSchema(filePath, ProjectConfigYamlSchema, {
      optional: true,
    });

    if (!yaml) {
      return {};
    }

    return yaml as ProjectConfig;
  },

  /**
   * Save project configuration
   */
  save(projectPath: string, config: ProjectConfig): void {
    const filePath = this.getPath(projectPath);

    // Validate before saving
    const validated = ProjectConfigYamlSchema.parse(config);

    // Remove undefined/empty values for cleaner YAML
    const cleaned = this.cleanConfig(validated);

    saveYamlFile(filePath, cleaned);
  },

  /**
   * Update specific fields in project configuration
   */
  update(projectPath: string, updates: Partial<ProjectConfig>): ProjectConfig {
    const current = this.load(projectPath);
    const merged = this.mergeConfig(current, updates);
    this.save(projectPath, merged);
    return merged;
  },

  /**
   * Get a specific setting value
   */
  getSetting<T = unknown>(projectPath: string, key: string): T | undefined {
    const config = this.load(projectPath);
    return config.settings?.[key] as T | undefined;
  },

  /**
   * Set a specific setting value
   */
  setSetting(projectPath: string, key: string, value: unknown): void {
    const config = this.load(projectPath);
    config.settings = config.settings || {};
    config.settings[key] = value;
    this.save(projectPath, config);
  },

  /**
   * Delete a specific setting
   */
  deleteSetting(projectPath: string, key: string): void {
    const config = this.load(projectPath);
    if (config.settings) {
      delete config.settings[key];
      this.save(projectPath, config);
    }
  },

  /**
   * Get environment variables from config
   */
  getEnv(projectPath: string): Record<string, string> {
    const config = this.load(projectPath);
    return config.env || {};
  },

  /**
   * Set environment variables in config
   */
  setEnv(projectPath: string, env: Record<string, string>): void {
    const config = this.load(projectPath);
    config.env = { ...config.env, ...env };
    this.save(projectPath, config);
  },

  /**
   * Get model configuration
   */
  getModelConfig(projectPath: string): ProjectConfig["model"] | undefined {
    const config = this.load(projectPath);
    return config.model;
  },

  /**
   * Get default agent configuration
   */
  getDefaultAgentConfig(projectPath: string): ProjectConfig["defaultAgent"] | undefined {
    const config = this.load(projectPath);
    return config.defaultAgent;
  },

  /**
   * Get git configuration
   */
  getGitConfig(projectPath: string): ProjectConfig["git"] | undefined {
    const config = this.load(projectPath);
    return config.git;
  },

  /**
   * Get tool configuration
   */
  getToolsConfig(projectPath: string): ProjectConfig["tools"] | undefined {
    const config = this.load(projectPath);
    return config.tools;
  },

  /**
   * Get skills configuration
   */
  getSkillsConfig(projectPath: string): ProjectConfig["skills"] | undefined {
    const config = this.load(projectPath);
    return config.skills;
  },

  /**
   * Get extensions configuration
   */
  getExtensionsConfig(projectPath: string): ProjectConfig["extensions"] | undefined {
    const config = this.load(projectPath);
    return config.extensions;
  },

  /**
   * Get enabled extension IDs
   */
  getEnabledExtensions(projectPath: string): string[] {
    const config = this.load(projectPath);
    return config.extensions?.enabled || [];
  },

  /**
   * Enable an extension
   */
  enableExtension(projectPath: string, extensionId: string): void {
    const config = this.load(projectPath);
    config.extensions = config.extensions || {};
    config.extensions.enabled = config.extensions.enabled || [];
    if (!config.extensions.enabled.includes(extensionId)) {
      config.extensions.enabled.push(extensionId);
      this.save(projectPath, config);
    }
  },

  /**
   * Disable an extension
   */
  disableExtension(projectPath: string, extensionId: string): void {
    const config = this.load(projectPath);
    if (config.extensions?.enabled) {
      config.extensions.enabled = config.extensions.enabled.filter((id) => id !== extensionId);
      this.save(projectPath, config);
    }
  },

  /**
   * Get extension settings
   */
  getExtensionSettings(projectPath: string, extensionId: string): Record<string, unknown> | undefined {
    const config = this.load(projectPath);
    return config.extensions?.settings?.[extensionId];
  },

  /**
   * Set extension settings
   */
  setExtensionSettings(projectPath: string, extensionId: string, settings: Record<string, unknown>): void {
    const config = this.load(projectPath);
    config.extensions = config.extensions || {};
    config.extensions.settings = config.extensions.settings || {};
    config.extensions.settings[extensionId] = settings;
    this.save(projectPath, config);
  },

  /**
   * Get sidebar configuration
   */
  getSidebarConfig(projectPath: string): ProjectConfig["sidebar"] | undefined {
    const config = this.load(projectPath);
    return config.sidebar;
  },

  /**
   * Get sidebar panels
   */
  getSidebarPanels(projectPath: string): string[] {
    const config = this.load(projectPath);
    return config.sidebar?.panels || ["files", "tasks", "git", "run"];
  },

  /**
   * Set sidebar panels
   */
  setSidebarPanels(projectPath: string, panels: string[]): void {
    const config = this.load(projectPath);
    config.sidebar = config.sidebar || {};
    config.sidebar.panels = panels;
    this.save(projectPath, config);
  },

  /**
   * Merge two configurations
   */
  mergeConfig(base: ProjectConfig, updates: Partial<ProjectConfig>): ProjectConfig {
    return {
      ...base,
      ...updates,
      defaultAgent: updates.defaultAgent
        ? { ...base.defaultAgent, ...updates.defaultAgent }
        : base.defaultAgent,
      model: updates.model
        ? { ...base.model, ...updates.model }
        : base.model,
      tools: updates.tools
        ? { ...base.tools, ...updates.tools }
        : base.tools,
      skills: updates.skills
        ? { ...base.skills, ...updates.skills }
        : base.skills,
      env: updates.env
        ? { ...base.env, ...updates.env }
        : base.env,
      git: updates.git
        ? { ...base.git, ...updates.git }
        : base.git,
      extensions: updates.extensions
        ? { ...base.extensions, ...updates.extensions }
        : base.extensions,
      sidebar: updates.sidebar
        ? { ...base.sidebar, ...updates.sidebar }
        : base.sidebar,
      settings: updates.settings
        ? { ...base.settings, ...updates.settings }
        : base.settings,
    };
  },

  /**
   * Clean config by removing undefined/empty values
   */
  cleanConfig(config: ProjectConfig): ProjectConfig {
    const cleaned: ProjectConfig = {};

    if (config.name) cleaned.name = config.name;
    if (config.description) cleaned.description = config.description;

    if (config.defaultAgent && Object.keys(config.defaultAgent).length > 0) {
      cleaned.defaultAgent = this.cleanObject(config.defaultAgent);
    }

    if (config.model && Object.keys(config.model).length > 0) {
      cleaned.model = this.cleanObject(config.model);
    }

    if (config.tools && (config.tools.enabled?.length || config.tools.disabled?.length)) {
      cleaned.tools = {};
      if (config.tools.enabled?.length) cleaned.tools.enabled = config.tools.enabled;
      if (config.tools.disabled?.length) cleaned.tools.disabled = config.tools.disabled;
    }

    if (config.skills?.installed?.length) {
      cleaned.skills = { installed: config.skills.installed };
    }

    if (config.env && Object.keys(config.env).length > 0) {
      cleaned.env = config.env;
    }

    if (config.git && Object.keys(config.git).length > 0) {
      cleaned.git = this.cleanObject(config.git);
    }

    if (config.extensions && (config.extensions.enabled?.length || config.extensions.settings)) {
      cleaned.extensions = {};
      if (config.extensions.enabled?.length) cleaned.extensions.enabled = config.extensions.enabled;
      if (config.extensions.settings && Object.keys(config.extensions.settings).length > 0) {
        cleaned.extensions.settings = config.extensions.settings;
      }
    }

    if (config.sidebar?.panels?.length) {
      cleaned.sidebar = { panels: config.sidebar.panels };
    }

    if (config.settings && Object.keys(config.settings).length > 0) {
      cleaned.settings = config.settings;
    }

    return cleaned;
  },

  /**
   * Remove undefined values from an object
   */
  cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const cleaned: Partial<T> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        cleaned[key as keyof T] = value as T[keyof T];
      }
    }
    return cleaned;
  },
};
