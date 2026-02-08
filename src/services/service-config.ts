/**
 * Service Configuration Service
 *
 * Manages persistent service definitions that can auto-start when Botical starts.
 * Services are stored in the project database and can be configured to
 * automatically restart when the server starts.
 *
 * See: docs/implementation-plan/18-enhanced-service-management.md
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError, ConflictError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

/**
 * Service entity
 */
export interface Service {
  id: string;
  projectId: string;
  name: string;
  command: string;
  cwd: string | null;
  env: Record<string, string> | null;
  autoStart: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Database row type
 */
interface ServiceRow {
  id: string;
  project_id: string;
  name: string;
  command: string;
  cwd: string | null;
  env: string | null;
  auto_start: number;
  enabled: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

/**
 * Service creation input schema
 */
export const ServiceCreateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  command: z.string().min(1).max(10000),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  autoStart: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  createdBy: z.string().min(1),
});

export type ServiceCreateInput = z.infer<typeof ServiceCreateSchema>;

/**
 * Service update input schema
 */
export const ServiceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  command: z.string().min(1).max(10000).optional(),
  cwd: z.string().nullable().optional(),
  env: z.record(z.string()).nullable().optional(),
  autoStart: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export type ServiceUpdateInput = z.infer<typeof ServiceUpdateSchema>;

/**
 * Service filter options
 */
export interface ServiceFilters {
  autoStart?: boolean;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Convert database row to service entity
 */
function rowToService(row: ServiceRow): Service {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    cwd: row.cwd,
    env: row.env ? JSON.parse(row.env) : null,
    autoStart: row.auto_start === 1,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Service Configuration Service
 */
export class ServiceConfigService {
  /**
   * Create a new service configuration
   */
  static create(db: Database, input: ServiceCreateInput): Service {
    const data = ServiceCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.service);

    // Check for duplicate name in project
    const existing = db
      .prepare("SELECT id FROM services WHERE project_id = ? AND name = ?")
      .get(data.projectId, data.name) as { id: string } | undefined;

    if (existing) {
      throw new ConflictError(
        `Service with name "${data.name}" already exists in this project`,
        { name: data.name, projectId: data.projectId }
      );
    }

    db.prepare(
      `INSERT INTO services (
        id, project_id, name, command, cwd, env, auto_start, enabled,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.projectId,
      data.name,
      data.command,
      data.cwd || null,
      data.env ? JSON.stringify(data.env) : null,
      data.autoStart ? 1 : 0,
      data.enabled ? 1 : 0,
      data.createdBy,
      now,
      now
    );

    return this.getByIdOrThrow(db, id);
  }

  /**
   * Get a service by ID
   */
  static getById(db: Database, serviceId: string): Service | null {
    const row = db
      .prepare("SELECT * FROM services WHERE id = ?")
      .get(serviceId) as ServiceRow | undefined;

    return row ? rowToService(row) : null;
  }

  /**
   * Get a service by ID or throw
   */
  static getByIdOrThrow(db: Database, serviceId: string): Service {
    const service = this.getById(db, serviceId);
    if (!service) {
      throw new NotFoundError("Service", serviceId);
    }
    return service;
  }

  /**
   * Get a service by name within a project
   */
  static getByName(
    db: Database,
    projectId: string,
    name: string
  ): Service | null {
    const row = db
      .prepare("SELECT * FROM services WHERE project_id = ? AND name = ?")
      .get(projectId, name) as ServiceRow | undefined;

    return row ? rowToService(row) : null;
  }

  /**
   * List services for a project
   */
  static listByProject(
    db: Database,
    projectId: string,
    filters: ServiceFilters = {}
  ): Service[] {
    let query = "SELECT * FROM services WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (filters.autoStart !== undefined) {
      query += " AND auto_start = ?";
      params.push(filters.autoStart ? 1 : 0);
    }

    if (filters.enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(filters.enabled ? 1 : 0);
    }

    query += " ORDER BY name ASC";

    if (filters.limit) {
      query += " LIMIT ?";
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += " OFFSET ?";
      params.push(filters.offset);
    }

    const rows = db.prepare(query).all(...params) as ServiceRow[];
    return rows.map(rowToService);
  }

  /**
   * Get services that should auto-start
   */
  static getAutoStart(db: Database, projectId: string): Service[] {
    const rows = db
      .prepare(
        "SELECT * FROM services WHERE project_id = ? AND auto_start = 1 AND enabled = 1 ORDER BY name ASC"
      )
      .all(projectId) as ServiceRow[];

    return rows.map(rowToService);
  }

  /**
   * Update a service configuration
   */
  static update(
    db: Database,
    serviceId: string,
    input: ServiceUpdateInput
  ): Service {
    const service = this.getByIdOrThrow(db, serviceId);
    const data = ServiceUpdateSchema.parse(input);
    const now = Date.now();

    // Check for duplicate name if name is being updated
    if (data.name && data.name !== service.name) {
      const existing = db
        .prepare(
          "SELECT id FROM services WHERE project_id = ? AND name = ? AND id != ?"
        )
        .get(service.projectId, data.name, serviceId) as
        | { id: string }
        | undefined;

      if (existing) {
        throw new ConflictError(
          `Service with name "${data.name}" already exists in this project`,
          { name: data.name, projectId: service.projectId }
        );
      }
    }

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (data.name !== undefined) {
      updates.push("name = ?");
      params.push(data.name);
    }

    if (data.command !== undefined) {
      updates.push("command = ?");
      params.push(data.command);
    }

    if (data.cwd !== undefined) {
      updates.push("cwd = ?");
      params.push(data.cwd);
    }

    if (data.env !== undefined) {
      updates.push("env = ?");
      params.push(data.env ? JSON.stringify(data.env) : null);
    }

    if (data.autoStart !== undefined) {
      updates.push("auto_start = ?");
      params.push(data.autoStart ? 1 : 0);
    }

    if (data.enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(data.enabled ? 1 : 0);
    }

    params.push(serviceId);

    db.prepare(`UPDATE services SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params
    );

    return this.getByIdOrThrow(db, serviceId);
  }

  /**
   * Delete a service configuration
   */
  static delete(db: Database, serviceId: string): void {
    this.getByIdOrThrow(db, serviceId);
    db.prepare("DELETE FROM services WHERE id = ?").run(serviceId);
  }

  /**
   * Count services for a project
   */
  static count(
    db: Database,
    projectId: string,
    filters: Pick<ServiceFilters, "autoStart" | "enabled"> = {}
  ): number {
    let query = "SELECT COUNT(*) as count FROM services WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (filters.autoStart !== undefined) {
      query += " AND auto_start = ?";
      params.push(filters.autoStart ? 1 : 0);
    }

    if (filters.enabled !== undefined) {
      query += " AND enabled = ?";
      params.push(filters.enabled ? 1 : 0);
    }

    const row = db.prepare(query).get(...params) as { count: number };
    return row.count;
  }
}
