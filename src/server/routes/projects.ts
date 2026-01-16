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
  type ProjectRole,
} from "@/services/projects.ts";
import { ValidationError, ForbiddenError } from "@/utils/errors.ts";

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

  const projectList = ProjectService.list(rootDb, {
    ownerId,
    memberId,
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

  // Auto-generate ownerId for dev mode if not provided
  const ownerId = result.data.ownerId || `usr_dev_${Date.now().toString(36)}`;

  const rootDb = DatabaseManager.getRootDb();

  // Ensure user exists (create if needed for dev mode)
  if (!result.data.ownerId) {
    const existingUser = rootDb
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(ownerId);
    if (!existingUser) {
      rootDb
        .prepare(
          "INSERT INTO users (id, username, email, is_admin, can_execute_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(ownerId, "dev_user", `dev@iris.local`, 1, 1, Date.now(), Date.now());
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

  return c.json({
    data: project,
  });
});

/**
 * PUT /api/projects/:id
 * Update project
 */
projects.put("/:id", async (c) => {
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
 */
projects.delete("/:id", async (c) => {
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
 */
projects.post("/:id/members", async (c) => {
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
    role as ProjectRole,
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
 */
projects.put("/:id/members/:userId", async (c) => {
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
    result.data.role as ProjectRole
  );

  return c.json({
    data: member,
  });
});

/**
 * DELETE /api/projects/:id/members/:userId
 * Remove member from project
 */
projects.delete("/:id/members/:userId", async (c) => {
  const projectId = c.req.param("id");
  const userId = c.req.param("userId");

  const rootDb = DatabaseManager.getRootDb();
  ProjectService.removeMember(rootDb, projectId, userId);

  return c.json({
    data: { removed: true },
  });
});

export { projects };
