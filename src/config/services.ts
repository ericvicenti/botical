/**
 * Service Configuration (YAML-based)
 *
 * Manages services stored as YAML files in .botical/services/
 * Services define long-running processes that can be started/stopped.
 */

import { z } from "zod";
import {
  loadYamlFileWithSchema,
  loadYamlDir,
  saveYamlFile,
  deleteYamlFile,
  yamlFileExists,
  getBoticalPaths,
} from "./yaml.ts";
import type { Service } from "@/services/service-config.ts";

// ============================================================================
// YAML Schema
// ============================================================================

/**
 * Service YAML schema for validation
 */
export const ServiceYamlSchema = z.object({
  // name is inferred from filename
  command: z.string().min(1),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  autoStart: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type ServiceYaml = z.infer<typeof ServiceYamlSchema>;

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert YAML service to Service entity
 */
function yamlToService(
  name: string,
  projectId: string,
  yaml: z.input<typeof ServiceYamlSchema>
): Service {
  const now = Date.now();
  return {
    id: `svc_yaml_${name}`,
    projectId,
    name,
    command: yaml.command,
    cwd: yaml.cwd ?? null,
    env: yaml.env ?? null,
    autoStart: yaml.autoStart ?? false,
    enabled: yaml.enabled ?? true,
    createdBy: "yaml",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert Service entity to YAML format
 */
function serviceToYaml(service: Service): ServiceYaml {
  return {
    command: service.command,
    cwd: service.cwd ?? undefined,
    env: service.env ?? undefined,
    autoStart: service.autoStart,
    enabled: service.enabled,
  };
}

// ============================================================================
// Service YAML Service
// ============================================================================

/**
 * YAML-based Service Configuration Service
 *
 * Reads and writes service definitions from YAML files.
 * Services are stored in .botical/services/{name}.yaml
 */
export const ServiceYamlService = {
  /**
   * Get service file path
   */
  getPath(projectPath: string, name: string): string {
    return getBoticalPaths(projectPath).service(name);
  },

  /**
   * Check if a service exists
   */
  exists(projectPath: string, name: string): boolean {
    return yamlFileExists(this.getPath(projectPath, name));
  },

  /**
   * Get service by name
   */
  getByName(
    projectPath: string,
    projectId: string,
    name: string
  ): Service | null {
    const filePath = this.getPath(projectPath, name);
    const yaml = loadYamlFileWithSchema(filePath, ServiceYamlSchema, {
      optional: true,
    });
    if (!yaml) return null;
    return yamlToService(name, projectId, yaml);
  },

  /**
   * List all services in a project
   */
  list(projectPath: string, projectId: string): Service[] {
    const servicesDir = getBoticalPaths(projectPath).services;
    const yamlFiles = loadYamlDir<unknown>(servicesDir);

    const services: Service[] = [];
    for (const [name, rawYaml] of yamlFiles) {
      try {
        const yaml = ServiceYamlSchema.parse(rawYaml);
        services.push(yamlToService(name, projectId, yaml));
      } catch (error) {
        console.error(`Failed to parse service ${name}:`, error);
      }
    }

    return services.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Create or update a service
   */
  save(projectPath: string, service: Service): void {
    const filePath = this.getPath(projectPath, service.name);
    const yaml = serviceToYaml(service);
    saveYamlFile(filePath, yaml);
  },

  /**
   * Delete a service
   */
  delete(projectPath: string, name: string): boolean {
    const filePath = this.getPath(projectPath, name);
    return deleteYamlFile(filePath);
  },

  /**
   * Count services in a project
   */
  count(projectPath: string): number {
    return this.list(projectPath, "").length;
  },
};
