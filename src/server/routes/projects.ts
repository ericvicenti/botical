/**
 * Projects API Routes
 *
 * REST API endpoints for managing projects and project members.
 * Projects link root DB (metadata) with project DBs (content).
 *
 * Endpoints:
 * - GET /api/projects - List user's projects
 * - POST /api/projects - Create project
 * - GET /api/projects/:id - Get project details
 * - PUT /api/projects/:id - Update project
 * - DELETE /api/projects/:id - Archive project
 * - GET /api/projects/:id/members - List members
 * - POST /api/projects/:id/members - Add member
 * - DELETE /api/projects/:id/members/:userId - Remove member
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#project
 * See: docs/knowledge-base/03-api-reference.md#projects-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  ProjectService,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ROOT_PROJECT_ID,
  type ProjectRole,
} from "@/services/projects.ts";
import { requireProjectAccess } from "@/auth/middleware.ts";
import { ValidationError, ForbiddenError } from "@/utils/errors.ts";
import { ProjectConfigService } from "@/config/project.ts";
import {
  ExtensionRegistry,
  startExtensionServer,
  stopExtensionServer,
} from "@/extensions/index.ts";

const projects = new Hono();

/**
 * Query parameters for listing projects
 */
const ListQuerySchema = z.object({
  ownerId: z.string().optional(),
  memberId: z.string().optional(),
  type: z.enum(["local", "remote"]).optional(),
  includeArchived: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/projects
 * List user's projects with pagination and filters
 */
projects.get("/", async (c) => {
  const rawQuery = {
    ownerId: c.req.query("ownerId"),
    memberId: c.req.query("memberId"),
    type: c.req.query("type"),
    includeArchived: c.req.query("includeArchived"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { ownerId, memberId, type, includeArchived, limit, offset } =
    result.data;

  const rootDb = DatabaseManager.getRootDb();

  const auth = c.get("auth");
  const projectList = ProjectService.list(rootDb, {
    ownerId,
    memberId,
    requestingUserId: auth?.userId,
    type,
    includeArchived,
    limit,
    offset,
  });

  const total = ProjectService.count(rootDb, {
    ownerId,
    memberId,
    includeArchived,
  });

  return c.json({
    data: projectList,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + projectList.length < total,
    },
  });
});

/**
 * Schema for project creation from API (ownerId optional for dev mode)
 */
const ApiProjectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerId: z.string().min(1).optional(),
  type: z.enum(["local", "remote"]).optional().default("local"),
  path: z.string().optional(),
  gitRemote: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

/**
 * POST /api/projects
 * Create a new project
 */
projects.post("/", async (c) => {
  const body = await c.req.json();

  const result = ApiProjectCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const auth = c.get("auth");

  // Use authenticated user if available, then request body, then generate dev user
  let ownerId = auth?.userId || result.data.ownerId;

  // Auto-generate ownerId for dev mode if not provided
  if (!ownerId) {
    ownerId = `usr_dev_${Date.now().toString(36)}`;
    // Ensure dev user exists
    const existingUser = rootDb
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(ownerId);
    if (!existingUser) {
      rootDb
        .prepare(
          "INSERT INTO users (id, username, email, is_admin, can_execute_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(ownerId, "dev_user", `dev@botical.local`, 1, 1, Date.now(), Date.now());
    }
  }

  const project = ProjectService.create(rootDb, {
    ...result.data,
    ownerId,
  });

  return c.json(
    {
      data: project,
    },
    201
  );
});

/**
 * GET /api/projects/:id
 * Get project by ID
 */
projects.get("/:id", async (c) => {
  const projectId = c.req.param("id");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  const auth = c.get("auth");

  // Root project requires admin access in multi-user mode
  if (projectId === ROOT_PROJECT_ID) {
    if (!auth || !ProjectService.hasRootAccess(rootDb, auth.userId)) {
      throw new ForbiddenError("Admin access required for root project");
    }
  } else if (auth) {
    // Check user is owner or member
    const isMember = rootDb.prepare(
      "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?"
    ).get(projectId, auth.userId);
    const isOwner = project.ownerId === auth.userId;
    if (!isMember && !isOwner && !auth.isAdmin) {
      throw new ForbiddenError("You do not have access to this project");
    }
  }

  return c.json({
    data: project,
  });
});

/**
 * PUT /api/projects/:id
 * Update project
 * Requires admin role or higher
 */
projects.put("/:id", requireProjectAccess("admin"), async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const result = ProjectUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.update(rootDb, projectId, result.data);

  return c.json({
    data: project,
  });
});

/**
 * DELETE /api/projects/:id
 * Archive project (soft delete)
 * Requires owner role
 */
projects.delete("/:id", requireProjectAccess("owner"), async (c) => {
  const projectId = c.req.param("id");

  const rootDb = DatabaseManager.getRootDb();
  ProjectService.delete(rootDb, projectId);

  return c.json({
    data: { archived: true },
  });
});

// ============================================
// MEMBER MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/projects/:id/members
 * List project members
 */
projects.get("/:id/members", async (c) => {
  const projectId = c.req.param("id");

  const rootDb = DatabaseManager.getRootDb();
  const members = ProjectService.listMembers(rootDb, projectId);

  return c.json({
    data: members,
    meta: {
      total: members.length,
    },
  });
});

/**
 * Schema for adding a member
 */
const AddMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  invitedBy: z.string().optional(),
});

/**
 * POST /api/projects/:id/members
 * Add member to project
 * Requires admin role or higher
 */
projects.post("/:id/members", requireProjectAccess("admin"), async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const result = AddMemberSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const { userId, role, invitedBy } = result.data;

  const rootDb = DatabaseManager.getRootDb();
  const member = ProjectService.addMember(
    rootDb,
    projectId,
    userId,
    role, // Already validated by AddMemberSchema
    invitedBy
  );

  return c.json(
    {
      data: member,
    },
    201
  );
});

/**
 * Schema for updating a member's role
 */
const UpdateMemberSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});

/**
 * PUT /api/projects/:id/members/:userId
 * Update member's role
 * Requires admin role or higher
 */
projects.put("/:id/members/:userId", requireProjectAccess("admin"), async (c) => {
  const projectId = c.req.param("id");
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const result = UpdateMemberSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const member = ProjectService.updateMemberRole(
    rootDb,
    projectId,
    userId,
    result.data.role // Already validated by UpdateMemberSchema
  );

  return c.json({
    data: member,
  });
});

/**
 * DELETE /api/projects/:id/members/:userId
 * Remove member from project
 * Requires admin role or higher
 */
projects.delete("/:id/members/:userId", requireProjectAccess("admin"), async (c) => {
  const projectId = c.req.param("id");
  const userId = c.req.param("userId");

  const rootDb = DatabaseManager.getRootDb();
  ProjectService.removeMember(rootDb, projectId, userId);

  return c.json({
    data: { removed: true },
  });
});

// ============================================
// EXTENSIONS CONFIGURATION ROUTES
// ============================================

/**
 * GET /api/projects/:id/extensions
 * Get enabled extensions for a project
 */
projects.get("/:id/extensions", async (c) => {
  const projectId = c.req.param("id");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    return c.json({
      data: {
        enabled: [],
      },
    });
  }

  const enabledExtensions = ProjectConfigService.getEnabledExtensions(project.path);

  return c.json({
    data: {
      enabled: enabledExtensions,
    },
  });
});

/**
 * Schema for updating project extensions
 */
const UpdateExtensionsSchema = z.object({
  enabled: z.array(z.string()),
});

/**
 * PUT /api/projects/:id/extensions
 * Update enabled extensions for a project
 */
projects.put("/:id/extensions", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const result = UpdateExtensionsSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    throw new ValidationError("Project does not have a local path");
  }

  // Update the project config with new enabled extensions
  ProjectConfigService.update(project.path, {
    extensions: {
      enabled: result.data.enabled,
    },
  });

  return c.json({
    data: {
      enabled: result.data.enabled,
    },
  });
});

/**
 * POST /api/projects/:id/extensions/:extensionId/enable
 * Enable a single extension for a project
 */
projects.post("/:id/extensions/:extensionId/enable", async (c) => {
  const projectId = c.req.param("id");
  const extensionId = c.req.param("extensionId");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    throw new ValidationError("Project does not have a local path");
  }

  ProjectConfigService.enableExtension(project.path, extensionId);

  // Start the extension server if not already running
  const extension = ExtensionRegistry.get(extensionId);
  if (extension) {
    await startExtensionServer(extension);
  }

  return c.json({
    data: {
      enabled: true,
      extensionId,
    },
  });
});

/**
 * POST /api/projects/:id/extensions/:extensionId/disable
 * Disable a single extension for a project
 */
projects.post("/:id/extensions/:extensionId/disable", async (c) => {
  const projectId = c.req.param("id");
  const extensionId = c.req.param("extensionId");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    throw new ValidationError("Project does not have a local path");
  }

  ProjectConfigService.disableExtension(project.path, extensionId);

  // Stop the extension server
  await stopExtensionServer(extensionId);

  return c.json({
    data: {
      enabled: false,
      extensionId,
    },
  });
});

export { projects };
