/**
 * Services API Routes
 *
 * REST API endpoints for managing persistent service configurations.
 * Services can come from YAML files (.iris/services/) or SQLite database.
 *
 * Project-scoped endpoints:
 * - POST /api/projects/:projectId/services - Create service
 * - GET /api/projects/:projectId/services - List services
 *
 * Service endpoints:
 * - GET /api/services/:id - Get service details
 * - PUT /api/services/:id - Update service
 * - DELETE /api/services/:id - Delete service
 * - POST /api/services/:id/start - Start service
 * - POST /api/services/:id/stop - Stop service
 * - POST /api/services/:id/restart - Restart service
 *
 * See: docs/implementation-plan/18-enhanced-service-management.md
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  ServiceCreateSchema,
  ServiceUpdateSchema,
} from "@/services/service-config.ts";
import { UnifiedServiceConfigService } from "@/services/services-unified.ts";
import { ServiceRunner } from "@/services/service-runner.ts";
import { ProjectService } from "@/services/projects.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

const projectServices = new Hono();

/**
 * Query parameters for listing services
 */
const ListQuerySchema = z.object({
  autoStart: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  enabled: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Get project path from project ID
 */
function getProjectPath(projectId: string): string {
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }
  if (!project.path) {
    throw new ValidationError("Project has no path configured");
  }
  return project.path;
}

/**
 * POST /api/projects/:projectId/services
 * Create a new service configuration
 *
 * Set saveToYaml=true in body to save as YAML file (recommended)
 */
projectServices.post("/:projectId/services", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();

  const input = {
    ...body,
    projectId,
  };

  const result = ServiceCreateSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const projectPath = getProjectPath(projectId);
  const saveToYaml = body.saveToYaml === true;

  const service = UnifiedServiceConfigService.create(
    db,
    projectId,
    projectPath,
    result.data,
    saveToYaml
  );

  return c.json({ data: service }, 201);
});

/**
 * GET /api/projects/:projectId/services
 * List services for a project
 */
projectServices.get("/:projectId/services", async (c) => {
  const projectId = c.req.param("projectId");

  const rawQuery = {
    autoStart: c.req.query("autoStart"),
    enabled: c.req.query("enabled"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const queryResult = ListQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    throw new ValidationError(
      queryResult.error.errors[0]?.message || "Invalid query parameters",
      queryResult.error.errors
    );
  }

  const query = queryResult.data;
  const db = DatabaseManager.getProjectDb(projectId);
  const projectPath = getProjectPath(projectId);

  const services = UnifiedServiceConfigService.list(db, projectId, projectPath, {
    autoStart: query.autoStart,
    enabled: query.enabled,
    limit: query.limit,
    offset: query.offset,
  });

  // Add running status to each service
  const servicesWithStatus = services.map((service) => {
    const runningProcess = ServiceRunner.getRunningProcess(
      projectId,
      service.id
    );
    return {
      ...service,
      isRunning: !!runningProcess,
      runningProcessId: runningProcess?.id || null,
    };
  });

  const total = UnifiedServiceConfigService.count(db, projectId, projectPath, {
    autoStart: query.autoStart,
    enabled: query.enabled,
  });

  return c.json({
    data: servicesWithStatus,
    meta: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + services.length < total,
    },
  });
});

// ============================================
// SERVICE ROUTES
// ============================================

const services = new Hono();

/**
 * Schema for service ID validation
 */
const ServiceIdSchema = z.string().startsWith("svc_");

/**
 * Validate service ID parameter
 * Now accepts both svc_ (database) and svc_yaml_ (YAML) prefixes
 */
function validateServiceId(id: string): void {
  if (!id.startsWith("svc_")) {
    throw new ValidationError("Invalid service ID format");
  }
}

/**
 * Helper to get project DB, path, and service
 */
function getDbAndService(serviceId: string) {
  const projectDbs = DatabaseManager.getOpenProjectIds();
  for (const projectId of projectDbs) {
    const db = DatabaseManager.getProjectDb(projectId);
    try {
      const projectPath = getProjectPath(projectId);
      const service = UnifiedServiceConfigService.getById(
        db,
        projectId,
        projectPath,
        serviceId
      );
      if (service) {
        return { db, service, projectId, projectPath };
      }
    } catch {
      // Project may not have a path, skip
    }
  }
  throw new ValidationError("Service not found in any project");
}

/**
 * GET /api/services/:id
 * Get service details
 */
services.get("/:id", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const { service, projectId } = getDbAndService(serviceId);
  const runningProcess = ServiceRunner.getRunningProcess(projectId, service.id);

  return c.json({
    data: {
      ...service,
      isRunning: !!runningProcess,
      runningProcessId: runningProcess?.id || null,
    },
  });
});

/**
 * PUT /api/services/:id
 * Update service configuration
 */
services.put("/:id", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const body = await c.req.json();

  const result = ServiceUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const { db, projectId, projectPath } = getDbAndService(serviceId);
  const service = UnifiedServiceConfigService.update(
    db,
    projectId,
    projectPath,
    serviceId,
    result.data
  );
  const runningProcess = ServiceRunner.getRunningProcess(projectId, service.id);

  return c.json({
    data: {
      ...service,
      isRunning: !!runningProcess,
      runningProcessId: runningProcess?.id || null,
    },
  });
});

/**
 * DELETE /api/services/:id
 * Delete service configuration
 */
services.delete("/:id", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const { db, service, projectId, projectPath } = getDbAndService(serviceId);

  // Stop the service if running
  const runningProcess = ServiceRunner.getRunningProcess(projectId, service.id);
  if (runningProcess) {
    await ServiceRunner.stopService(projectId, serviceId);
  }

  UnifiedServiceConfigService.delete(db, projectId, projectPath, serviceId);

  return c.json({ success: true });
});

/**
 * POST /api/services/:id/start
 * Start a service
 */
services.post("/:id/start", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const { projectId } = getDbAndService(serviceId);
  const processId = await ServiceRunner.startService(projectId, serviceId);

  return c.json({
    data: {
      processId,
      status: "started",
    },
  });
});

/**
 * POST /api/services/:id/stop
 * Stop a service
 */
services.post("/:id/stop", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const { projectId } = getDbAndService(serviceId);
  await ServiceRunner.stopService(projectId, serviceId);

  return c.json({
    data: {
      status: "stopped",
    },
  });
});

/**
 * POST /api/services/:id/restart
 * Restart a service
 */
services.post("/:id/restart", async (c) => {
  const serviceId = c.req.param("id");
  validateServiceId(serviceId);

  const { projectId } = getDbAndService(serviceId);
  const processId = await ServiceRunner.restartService(projectId, serviceId);

  return c.json({
    data: {
      processId,
      status: "restarted",
    },
  });
});

export { projectServices, services };
