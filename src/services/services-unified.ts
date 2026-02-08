/**
 * Unified Service Configuration Service
 *
 * Combines services from multiple sources:
 * 1. YAML files in .botical/services/ (primary, file-based)
 * 2. SQLite database (legacy, for backward compatibility)
 *
 * YAML services take precedence if there's a name conflict.
 */

import type { Database } from "bun:sqlite";
import {
  ServiceConfigService,
  type Service,
  type ServiceCreateInput,
  type ServiceUpdateInput,
  type ServiceFilters,
} from "./service-config.ts";
import { ServiceYamlService } from "@/config/services.ts";
import { ProjectService } from "./projects.ts";
import { DatabaseManager } from "@/database/index.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";

/**
 * Source indicator for services
 */
export type ServiceSource = "yaml" | "database";

/**
 * Extended service with source info
 */
export interface ServiceWithSource extends Service {
  source: ServiceSource;
}

/**
 * Unified Service Configuration Service
 */
export const UnifiedServiceConfigService = {
  /**
   * Get project path from project ID
   */
  getProjectPath(projectId: string): string {
    const rootDb = DatabaseManager.getRootDb();
    const project = ProjectService.getById(rootDb, projectId);
    if (!project) {
      throw new NotFoundError("Project", projectId);
    }
    if (!project.path) {
      throw new ValidationError("Project has no path configured");
    }
    return project.path;
  },

  /**
   * List all services from all sources
   */
  list(
    db: Database,
    projectId: string,
    projectPath: string,
    filters: ServiceFilters = {}
  ): ServiceWithSource[] {
    const { autoStart, enabled, limit = 50, offset = 0 } = filters;

    // Get YAML services
    const yamlServices = ServiceYamlService.list(projectPath, projectId).map(
      (s) => ({ ...s, source: "yaml" as ServiceSource })
    );

    // Get database services
    const dbServices = ServiceConfigService.listByProject(db, projectId, {
      autoStart,
      enabled,
    }).map((s) => ({ ...s, source: "database" as ServiceSource }));

    // Merge: YAML takes precedence over database for same name
    const yamlNames = new Set(yamlServices.map((s) => s.name));
    const combined = [
      ...yamlServices,
      ...dbServices.filter((s) => !yamlNames.has(s.name)),
    ];

    // Apply filters to YAML services (DB already filtered)
    let filtered = combined;
    if (autoStart !== undefined) {
      filtered = filtered.filter((s) => s.autoStart === autoStart);
    }
    if (enabled !== undefined) {
      filtered = filtered.filter((s) => s.enabled === enabled);
    }

    // Sort and paginate
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered.slice(offset, offset + limit);
  },

  /**
   * Count all services from all sources
   */
  count(
    db: Database,
    projectId: string,
    projectPath: string,
    filters: Pick<ServiceFilters, "autoStart" | "enabled"> = {}
  ): number {
    const all = this.list(db, projectId, projectPath, {
      ...filters,
      limit: 10000,
      offset: 0,
    });
    return all.length;
  },

  /**
   * Get service by ID
   */
  getById(
    db: Database,
    projectId: string,
    projectPath: string,
    serviceId: string
  ): ServiceWithSource | null {
    // Check if it's a YAML service ID
    if (serviceId.startsWith("svc_yaml_")) {
      const name = serviceId.replace("svc_yaml_", "");
      const service = ServiceYamlService.getByName(projectPath, projectId, name);
      if (service) {
        return { ...service, source: "yaml" };
      }
    }

    // Check database
    const service = ServiceConfigService.getById(db, serviceId);
    if (service) {
      return { ...service, source: "database" };
    }

    return null;
  },

  /**
   * Get service by ID or throw
   */
  getByIdOrThrow(
    db: Database,
    projectId: string,
    projectPath: string,
    serviceId: string
  ): ServiceWithSource {
    const service = this.getById(db, projectId, projectPath, serviceId);
    if (!service) {
      throw new NotFoundError("Service", serviceId);
    }
    return service;
  },

  /**
   * Get service by name
   */
  getByName(
    db: Database,
    projectId: string,
    projectPath: string,
    name: string
  ): ServiceWithSource | null {
    // YAML takes precedence
    const yamlService = ServiceYamlService.getByName(
      projectPath,
      projectId,
      name
    );
    if (yamlService) {
      return { ...yamlService, source: "yaml" };
    }

    // Check database
    const dbService = ServiceConfigService.getByName(db, projectId, name);
    if (dbService) {
      return { ...dbService, source: "database" };
    }

    return null;
  },

  /**
   * Get services that should auto-start
   */
  getAutoStart(
    db: Database,
    projectId: string,
    projectPath: string
  ): ServiceWithSource[] {
    return this.list(db, projectId, projectPath, {
      autoStart: true,
      enabled: true,
      limit: 10000,
    });
  },

  /**
   * Create a service
   * - If saveToYaml is true, saves to YAML file
   * - Otherwise saves to database (legacy behavior)
   */
  create(
    db: Database,
    projectId: string,
    projectPath: string,
    input: ServiceCreateInput,
    saveToYaml: boolean = false
  ): ServiceWithSource {
    // Check for existing service with same name
    const existing = this.getByName(db, projectId, projectPath, input.name);
    if (existing) {
      throw new ConflictError(
        `Service with name "${input.name}" already exists`,
        { serviceName: input.name }
      );
    }

    if (saveToYaml) {
      // Create YAML service
      const now = Date.now();
      const service: Service = {
        id: `svc_yaml_${input.name}`,
        projectId,
        name: input.name,
        command: input.command,
        cwd: input.cwd ?? null,
        env: input.env ?? null,
        autoStart: input.autoStart ?? false,
        enabled: input.enabled ?? true,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      ServiceYamlService.save(projectPath, service);
      return { ...service, source: "yaml" };
    } else {
      // Create database service
      const service = ServiceConfigService.create(db, input);
      return { ...service, source: "database" };
    }
  },

  /**
   * Update a service
   * - YAML services are updated by saving the file
   * - Database services use the standard service
   */
  update(
    db: Database,
    projectId: string,
    projectPath: string,
    serviceId: string,
    input: ServiceUpdateInput
  ): ServiceWithSource {
    const existing = this.getByIdOrThrow(db, projectId, projectPath, serviceId);

    // Check for duplicate name if name is being updated
    if (input.name && input.name !== existing.name) {
      const nameExists = this.getByName(db, projectId, projectPath, input.name);
      if (nameExists) {
        throw new ConflictError(
          `Service with name "${input.name}" already exists`,
          { serviceName: input.name }
        );
      }
    }

    if (existing.source === "yaml") {
      // Update YAML service
      const now = Date.now();
      const updated: Service = {
        ...existing,
        name: input.name ?? existing.name,
        command: input.command ?? existing.command,
        cwd: input.cwd !== undefined ? input.cwd : existing.cwd,
        env: input.env !== undefined ? input.env : existing.env,
        autoStart: input.autoStart ?? existing.autoStart,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: now,
      };

      // If name changed, delete old file and create new
      if (input.name && input.name !== existing.name) {
        ServiceYamlService.delete(projectPath, existing.name);
        updated.id = `svc_yaml_${input.name}`;
      }

      ServiceYamlService.save(projectPath, updated);
      return { ...updated, source: "yaml" };
    } else {
      // Update database service
      const service = ServiceConfigService.update(db, serviceId, input);
      return { ...service, source: "database" };
    }
  },

  /**
   * Delete a service
   */
  delete(
    db: Database,
    projectId: string,
    projectPath: string,
    serviceId: string
  ): void {
    const existing = this.getByIdOrThrow(db, projectId, projectPath, serviceId);

    if (existing.source === "yaml") {
      ServiceYamlService.delete(projectPath, existing.name);
    } else {
      ServiceConfigService.delete(db, serviceId);
    }
  },
};
