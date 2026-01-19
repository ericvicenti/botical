/**
 * Services API Routes
 *
 * REST API endpoints for managing persistent service configurations.
 * Services can be configured to auto-start when Iris starts.
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
  ServiceConfigService,
  ServiceCreateSchema,
  ServiceUpdateSchema,
} from "@/services/service-config.ts";
import { ServiceRunner } from "@/services/service-runner.ts";
import { ValidationError } from "@/utils/errors.ts";

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
 * POST /api/projects/:projectId/services
 * Create a new service configuration
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
  const service = ServiceConfigService.create(db, result.data);

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
  const services = ServiceConfigService.listByProject(db, projectId, {
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

  const total = ServiceConfigService.count(db, projectId, {
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
 */
function validateServiceId(id: string): void {
  if (!ServiceIdSchema.safeParse(id).success) {
    throw new ValidationError("Invalid service ID format");
  }
}

/**
 * Helper to get project DB and service
 */
function getDbAndService(serviceId: string) {
  const projectDbs = DatabaseManager.getOpenProjectIds();
  for (const projectId of projectDbs) {
    const db = DatabaseManager.getProjectDb(projectId);
    const service = ServiceConfigService.getById(db, serviceId);
    if (service) {
      return { db, service, projectId };
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

  const { db, projectId } = getDbAndService(serviceId);
  const service = ServiceConfigService.update(db, serviceId, result.data);
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

  const { db, service, projectId } = getDbAndService(serviceId);

  // Stop the service if running
  const runningProcess = ServiceRunner.getRunningProcess(projectId, service.id);
  if (runningProcess) {
    await ServiceRunner.stopService(projectId, serviceId);
  }

  ServiceConfigService.delete(db, serviceId);

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
