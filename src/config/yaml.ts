/**
 * YAML Configuration Utilities
 *
 * Provides utilities for loading and saving YAML configuration files.
 * Used for workflows, services, agents, and project config stored in .botical/
 */

import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

/**
 * Options for loading YAML files
 */
export interface LoadYamlOptions {
  /** If true, returns null instead of throwing when file doesn't exist */
  optional?: boolean;
}

/**
 * Load and parse a YAML file
 *
 * @param filePath - Absolute path to the YAML file
 * @param options - Loading options
 * @returns Parsed YAML content
 * @throws Error if file doesn't exist (unless optional: true)
 */
export function loadYamlFile<T = unknown>(
  filePath: string,
  options: LoadYamlOptions = {}
): T | null {
  if (!fs.existsSync(filePath)) {
    if (options.optional) {
      return null;
    }
    throw new Error(`YAML file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return yaml.load(content) as T;
}

/**
 * Load and validate a YAML file against a Zod schema
 *
 * @param filePath - Absolute path to the YAML file
 * @param schema - Zod schema to validate against
 * @param options - Loading options
 * @returns Validated and typed content
 * @throws ZodError if validation fails
 */
export function loadYamlFileWithSchema<T>(
  filePath: string,
  schema: z.ZodType<T>,
  options: LoadYamlOptions = {}
): T | null {
  const content = loadYamlFile(filePath, options);
  if (content === null) {
    return null;
  }

  return schema.parse(content);
}

/**
 * Save content to a YAML file
 *
 * @param filePath - Absolute path to the YAML file
 * @param content - Content to save
 * @param options - YAML dump options
 */
export function saveYamlFile(
  filePath: string,
  content: unknown,
  options: yaml.DumpOptions = {}
): void {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const yamlContent = yaml.dump(content, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    ...options,
  });

  fs.writeFileSync(filePath, yamlContent, "utf-8");
}

/**
 * Load all YAML files from a directory
 *
 * @param dirPath - Absolute path to directory
 * @param schema - Optional Zod schema to validate each file
 * @returns Map of filename (without extension) to parsed content
 */
export function loadYamlDir<T = unknown>(
  dirPath: string,
  schema?: z.ZodType<T>
): Map<string, T> {
  const result = new Map<string, T>();

  if (!fs.existsSync(dirPath)) {
    return result;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) {
      continue;
    }

    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) {
      continue;
    }

    const name = file.replace(/\.(yaml|yml)$/, "");

    try {
      const content = schema
        ? loadYamlFileWithSchema(filePath, schema)
        : loadYamlFile<T>(filePath);

      if (content !== null) {
        result.set(name, content);
      }
    } catch (error) {
      console.error(`Failed to load YAML file ${filePath}:`, error);
    }
  }

  return result;
}

/**
 * Delete a YAML file
 *
 * @param filePath - Absolute path to the YAML file
 * @returns true if file was deleted, false if it didn't exist
 */
export function deleteYamlFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

/**
 * Check if a YAML file exists
 *
 * @param filePath - Absolute path to the YAML file
 * @returns true if file exists
 */
export function yamlFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Get the .botical directory path for a project
 *
 * @param projectPath - The project's root path
 * @returns Path to .botical directory
 */
export function getBoticalDir(projectPath: string): string {
  return path.join(projectPath, ".botical");
}

/**
 * Ensure the .botical directory structure exists
 *
 * @param projectPath - The project's root path
 */
export function ensureBoticalDir(projectPath: string): void {
  const boticalDir = getBoticalDir(projectPath);
  const dirs = [
    boticalDir,
    path.join(boticalDir, "workflows"),
    path.join(boticalDir, "services"),
    path.join(boticalDir, "agents"),
    path.join(boticalDir, "plans"),
    path.join(boticalDir, "skills"),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get path helpers for a project's .botical directory
 */
export function getBoticalPaths(projectPath: string) {
  const boticalDir = getBoticalDir(projectPath);

  return {
    root: boticalDir,
    config: path.join(boticalDir, "config.yaml"),
    workflows: path.join(boticalDir, "workflows"),
    services: path.join(boticalDir, "services"),
    agents: path.join(boticalDir, "agents"),
    plans: path.join(boticalDir, "plans"),
    skills: path.join(boticalDir, "skills"),

    workflow: (name: string) => path.join(boticalDir, "workflows", `${name}.yaml`),
    service: (name: string) => path.join(boticalDir, "services", `${name}.yaml`),
    agent: (name: string) => path.join(boticalDir, "agents", `${name}.yaml`),
    plan: (name: string) => path.join(boticalDir, "plans", `${name}.md`),
    skillRepo: (repo: string) => path.join(boticalDir, "skills", ...repo.split("/")),
  };
}
