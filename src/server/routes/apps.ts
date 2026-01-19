/**
 * Apps API Routes
 *
 * REST API endpoints for managing Iris Apps within projects.
 * Apps are discovered, loaded, and managed per-project.
 *
 * Project-scoped endpoints:
 * - GET /api/projects/:projectId/apps - List apps in project
 * - GET /api/projects/:projectId/apps/:appId - Get app details
 * - POST /api/projects/:projectId/apps/:appId/activate - Activate app
 * - POST /api/projects/:projectId/apps/:appId/deactivate - Deactivate app
 * - POST /api/projects/:projectId/apps/:appId/reload - Hot reload app
 *
 * See: docs/apps-architecture/07-implementation-roadmap.md
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { ValidationError } from "@/utils/errors.ts";
import { getAppManager, type ManagedApp } from "@/apps/index.ts";

// ============================================
// PROJECT-SCOPED ROUTES
// ============================================

const projectApps = new Hono();

/**
 * Helper to get project path from database
 */
function getProjectPath(projectId: string): string {
  const db = DatabaseManager.getRootDb();
  const project = db
    .prepare("SELECT path FROM projects WHERE id = ?")
    .get(projectId) as { path: string } | undefined;

  if (!project) {
    throw new ValidationError("Project not found");
  }

  return project.path;
}

/**
 * Format app for API response
 */
function formatApp(app: ManagedApp) {
  return {
    id: app.id,
    name: app.manifest.name,
    displayName: app.manifest.displayName,
    description: app.manifest.description,
    icon: app.manifest.icon,
    version: app.manifest.version,
    status: app.status,
    trustLevel: app.trustLevel,
    path: app.path,
    tools: app.manifest.tools,
    error: app.error,
  };
}

/**
 * GET /api/projects/:projectId/apps
 * List all apps in a project (discovers and returns)
 */
projectApps.get("/:projectId/apps", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);

  // Discover apps in project
  const discovered = await manager.discover();

  // Load any newly discovered apps
  for (const app of discovered) {
    try {
      await manager.load(app.path);
    } catch (error) {
      console.error(`[Apps] Failed to load app at ${app.path}:`, error);
    }
  }

  // Return all managed apps
  const apps = manager.getAll().map(formatApp);

  return c.json({
    data: apps,
    meta: {
      total: apps.length,
    },
  });
});

/**
 * GET /api/projects/:projectId/apps/:appId
 * Get details of a specific app
 */
projectApps.get("/:projectId/apps/:appId", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);
  const app = manager.get(appId);

  if (!app) {
    throw new ValidationError("App not found");
  }

  // Get runtime info if available
  const runtime = manager.getRuntime(appId);
  const tools = runtime?.getTools() ?? [];

  return c.json({
    data: {
      ...formatApp(app),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    },
  });
});

/**
 * POST /api/projects/:projectId/apps/:appId/activate
 * Activate an app (start running it)
 */
projectApps.post("/:projectId/apps/:appId/activate", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);
  const app = manager.get(appId);

  if (!app) {
    throw new ValidationError("App not found");
  }

  await manager.activate(appId);

  return c.json({
    data: formatApp(manager.get(appId)!),
  });
});

/**
 * POST /api/projects/:projectId/apps/:appId/deactivate
 * Deactivate an app
 */
projectApps.post("/:projectId/apps/:appId/deactivate", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);
  const app = manager.get(appId);

  if (!app) {
    throw new ValidationError("App not found");
  }

  await manager.deactivate(appId);

  return c.json({
    data: formatApp(manager.get(appId)!),
  });
});

/**
 * POST /api/projects/:projectId/apps/:appId/reload
 * Hot reload an app
 */
projectApps.post("/:projectId/apps/:appId/reload", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);
  const app = manager.get(appId);

  if (!app) {
    throw new ValidationError("App not found");
  }

  await manager.hotReload(appId);

  return c.json({
    data: formatApp(manager.get(appId)!),
  });
});

/**
 * POST /api/projects/:projectId/apps/:appId/action
 * Execute an action on an app (tool call)
 */
const ActionSchema = z.object({
  action: z.string(),
  args: z.unknown().optional(),
});

projectApps.post("/:projectId/apps/:appId/action", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);
  const body = await c.req.json();

  const result = ActionSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid action request");
  }

  const manager = getAppManager(projectId, projectPath);
  const runtime = manager.getRuntime(appId);

  if (!runtime) {
    throw new ValidationError("App not active");
  }

  const actionResult = await runtime.executeAction(
    result.data.action,
    result.data.args
  );

  return c.json({
    data: actionResult,
  });
});

/**
 * GET /api/projects/:projectId/apps/:appId/ui
 * Get current UI tree for an app
 */
projectApps.get("/:projectId/apps/:appId/ui", async (c) => {
  const projectId = c.req.param("projectId");
  const appId = c.req.param("appId");
  const projectPath = getProjectPath(projectId);

  const manager = getAppManager(projectId, projectPath);
  const runtime = manager.getRuntime(appId);

  if (!runtime) {
    throw new ValidationError("App not active");
  }

  const tree = runtime.generateUI();

  return c.json({
    data: {
      tree,
    },
  });
});

// ============================================
// INDIVIDUAL APP ROUTES (future use)
// ============================================

const apps = new Hono();

// Placeholder for future global app operations
apps.get("/", async (c) => {
  return c.json({
    message: "Use project-scoped routes: /api/projects/:projectId/apps",
  });
});

export { projectApps, apps };
