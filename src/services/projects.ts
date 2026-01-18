/**
 * Project Service
 *
 * Manages projects in the root database with member management.
 * Projects link the root DB (metadata) with project DBs (content).
 * See: docs/knowledge-base/02-data-model.md#project
 * See: docs/knowledge-base/04-patterns.md#service-pattern
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ForbiddenError, ConflictError } from "@/utils/errors.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import type { Database } from "bun:sqlite";

/**
 * Convert a string to a URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars (except spaces and hyphens)
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generate a unique workspace path for a project
 * If the path already exists, append a number
 */
function generateUniqueWorkspacePath(name: string): string {
  const baseSlug = slugify(name) || "project";
  const workspacesDir = Config.getWorkspacesDir();

  // Ensure workspaces directory exists
  if (!fs.existsSync(workspacesDir)) {
    fs.mkdirSync(workspacesDir, { recursive: true });
  }

  let slug = baseSlug;
  let counter = 1;
  let workspacePath = Config.getDefaultWorkspacePath(slug);

  // Find a unique path
  while (fs.existsSync(workspacePath)) {
    slug = `${baseSlug}-${counter}`;
    workspacePath = Config.getDefaultWorkspacePath(slug);
    counter++;
  }

  return workspacePath;
}

/**
 * Initialize a workspace directory with git and a README
 */
function initializeWorkspace(workspacePath: string, projectName: string): void {
  // Create the directory
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  // Check if it's already a git repo
  const gitDir = path.join(workspacePath, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      // Initialize git repository
      execSync("git init", { cwd: workspacePath, stdio: "ignore" });

      // Create README.md
      const readmeContent = `# ${projectName}

A project managed by Iris.
`;
      const readmePath = path.join(workspacePath, "README.md");
      fs.writeFileSync(readmePath, readmeContent, "utf-8");

      // Add and commit the README
      execSync("git add README.md", { cwd: workspacePath, stdio: "ignore" });
      execSync('git commit -m "Initial commit"', { cwd: workspacePath, stdio: "ignore" });
    } catch (error) {
      // Git init failed, but we still have a valid directory
      // Log the error but don't fail project creation
      console.error("Failed to initialize git repository:", error);
    }
  }
}

/**
 * Project creation input schema
 */
export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerId: z.string().min(1),
  type: z.enum(["local", "remote"]).optional().default("local"),
  path: z.string().optional(),
  gitRemote: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type ProjectCreateInput = z.input<typeof ProjectCreateSchema>;

/**
 * Project update input schema
 */
export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  path: z.string().nullable().optional(),
  gitRemote: z.string().url().nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  settings: z.record(z.unknown()).optional(),
});

export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;

/**
 * Project member role
 */
export type ProjectRole = "owner" | "admin" | "member" | "viewer";

/**
 * Project entity
 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  type: "local" | "remote";
  path: string | null;
  gitRemote: string | null;
  iconUrl: string | null;
  color: string | null;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

/**
 * Project member entity
 */
export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  permissions: Record<string, boolean> | null;
  joinedAt: number;
  invitedBy: string | null;
}

/**
 * Database row types
 */
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  type: string;
  path: string | null;
  git_remote: string | null;
  icon_url: string | null;
  color: string | null;
  settings: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

interface ProjectMemberRow {
  project_id: string;
  user_id: string;
  role: string;
  permissions: string | null;
  joined_at: number;
  invited_by: string | null;
}

/**
 * Convert database row to project entity
 */
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    type: row.type as "local" | "remote",
    path: row.path,
    gitRemote: row.git_remote,
    iconUrl: row.icon_url,
    color: row.color,
    settings: JSON.parse(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/**
 * Convert database row to project member entity
 */
function rowToProjectMember(row: ProjectMemberRow): ProjectMember {
  return {
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role as ProjectRole,
    permissions: row.permissions ? JSON.parse(row.permissions) : null,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
  };
}

/**
 * Project Service for managing projects and members
 */
export class ProjectService {
  /**
   * Create a new project
   */
  static create(rootDb: Database, input: ProjectCreateInput): Project {
    const validated = ProjectCreateSchema.parse(input);
    const now = Date.now();
    const id = generateId(IdPrefixes.project, { descending: true });

    // Generate default path if not provided (for local projects)
    let projectPath = validated.path ?? null;
    if (!projectPath && validated.type === "local") {
      projectPath = generateUniqueWorkspacePath(validated.name);
    }

    // Initialize workspace with git and README (for local projects with auto-generated path)
    if (projectPath && validated.type === "local" && !validated.path) {
      // Only initialize if we generated the path (not user-provided)
      initializeWorkspace(projectPath, validated.name);
    } else if (projectPath && !fs.existsSync(projectPath)) {
      // For user-provided paths, just create the directory
      fs.mkdirSync(projectPath, { recursive: true });
    }

    rootDb.prepare(
      `
      INSERT INTO projects (
        id, name, description, owner_id, type, path, git_remote,
        icon_url, color, settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      validated.name,
      validated.description ?? null,
      validated.ownerId,
      validated.type,
      projectPath,
      validated.gitRemote ?? null,
      validated.iconUrl ?? null,
      validated.color ?? null,
      JSON.stringify(validated.settings ?? {}),
      now,
      now
    );

    // Add owner as a member with owner role
    rootDb.prepare(
      `
      INSERT INTO project_members (project_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(id, validated.ownerId, "owner", now);

    // Initialize project database
    DatabaseManager.getProjectDb(id);

    return {
      id,
      name: validated.name,
      description: validated.description ?? null,
      ownerId: validated.ownerId,
      type: validated.type,
      path: projectPath,
      gitRemote: validated.gitRemote ?? null,
      iconUrl: validated.iconUrl ?? null,
      color: validated.color ?? null,
      settings: validated.settings ?? {},
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  }

  /**
   * Get a project by ID
   */
  static getById(rootDb: Database, projectId: string): Project | null {
    const row = rootDb
      .prepare("SELECT * FROM projects WHERE id = ? AND archived_at IS NULL")
      .get(projectId) as ProjectRow | undefined;

    if (!row) return null;
    return rowToProject(row);
  }

  /**
   * Get a project by ID or throw NotFoundError
   */
  static getByIdOrThrow(rootDb: Database, projectId: string): Project {
    const project = this.getById(rootDb, projectId);
    if (!project) {
      throw new NotFoundError("Project", projectId);
    }
    return project;
  }

  /**
   * List projects with optional filtering
   */
  static list(
    rootDb: Database,
    options: {
      ownerId?: string;
      memberId?: string;
      type?: "local" | "remote";
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Project[] {
    let query = "SELECT DISTINCT p.* FROM projects p";
    const params: (string | number | null)[] = [];
    const conditions: string[] = [];

    // Join with members if filtering by memberId
    if (options.memberId) {
      query += " LEFT JOIN project_members pm ON p.id = pm.project_id";
      conditions.push("(p.owner_id = ? OR pm.user_id = ?)");
      params.push(options.memberId, options.memberId);
    }

    if (options.ownerId) {
      conditions.push("p.owner_id = ?");
      params.push(options.ownerId);
    }

    if (options.type) {
      conditions.push("p.type = ?");
      params.push(options.type);
    }

    if (!options.includeArchived) {
      conditions.push("p.archived_at IS NULL");
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Order by ID ascending (newest first due to descending ID generation)
    query += " ORDER BY p.id ASC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = rootDb.prepare(query).all(...params) as ProjectRow[];
    return rows.map(rowToProject);
  }

  /**
   * Update a project
   */
  static update(
    rootDb: Database,
    projectId: string,
    input: ProjectUpdateInput
  ): Project {
    this.getByIdOrThrow(rootDb, projectId);
    const validated = ProjectUpdateSchema.parse(input);
    const now = Date.now();

    const updates: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [now];

    if (validated.name !== undefined) {
      updates.push("name = ?");
      params.push(validated.name);
    }

    if (validated.description !== undefined) {
      updates.push("description = ?");
      params.push(validated.description);
    }

    if (validated.path !== undefined) {
      updates.push("path = ?");
      params.push(validated.path);
    }

    if (validated.gitRemote !== undefined) {
      updates.push("git_remote = ?");
      params.push(validated.gitRemote);
    }

    if (validated.iconUrl !== undefined) {
      updates.push("icon_url = ?");
      params.push(validated.iconUrl);
    }

    if (validated.color !== undefined) {
      updates.push("color = ?");
      params.push(validated.color);
    }

    if (validated.settings !== undefined) {
      updates.push("settings = ?");
      params.push(JSON.stringify(validated.settings));
    }

    params.push(projectId);

    rootDb.prepare(
      `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    return this.getByIdOrThrow(rootDb, projectId);
  }

  /**
   * Archive a project (soft delete)
   */
  static delete(rootDb: Database, projectId: string): void {
    this.getByIdOrThrow(rootDb, projectId);
    const now = Date.now();

    rootDb.prepare(
      "UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, projectId);

    // Close project database connection
    DatabaseManager.closeProjectDb(projectId);
  }

  /**
   * Permanently delete a project and its data
   * Works on both active and archived projects
   */
  static permanentDelete(rootDb: Database, projectId: string): void {
    // Check project exists (including archived)
    const row = rootDb
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId) as { id: string } | undefined;

    if (!row) {
      throw new NotFoundError("Project", projectId);
    }

    // Delete project members first (foreign key)
    rootDb.prepare("DELETE FROM project_members WHERE project_id = ?").run(projectId);

    // Delete project record
    rootDb.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Delete project database
    DatabaseManager.deleteProjectDb(projectId);
  }

  /**
   * Count projects with optional filters
   */
  static count(
    rootDb: Database,
    options: {
      ownerId?: string;
      memberId?: string;
      includeArchived?: boolean;
    } = {}
  ): number {
    let query = "SELECT COUNT(DISTINCT p.id) as count FROM projects p";
    const params: string[] = [];
    const conditions: string[] = [];

    if (options.memberId) {
      query += " LEFT JOIN project_members pm ON p.id = pm.project_id";
      conditions.push("(p.owner_id = ? OR pm.user_id = ?)");
      params.push(options.memberId, options.memberId);
    }

    if (options.ownerId) {
      conditions.push("p.owner_id = ?");
      params.push(options.ownerId);
    }

    if (!options.includeArchived) {
      conditions.push("p.archived_at IS NULL");
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const result = rootDb.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  // ============================================
  // MEMBER MANAGEMENT
  // ============================================

  /**
   * Add a member to a project
   */
  static addMember(
    rootDb: Database,
    projectId: string,
    userId: string,
    role: ProjectRole,
    invitedBy?: string
  ): ProjectMember {
    this.getByIdOrThrow(rootDb, projectId);
    const now = Date.now();

    // Check if user is already a member
    const existing = rootDb
      .prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, userId) as ProjectMemberRow | undefined;

    if (existing) {
      throw new ConflictError("User is already a member of this project", {
        projectId,
        userId,
      });
    }

    rootDb.prepare(
      `
      INSERT INTO project_members (project_id, user_id, role, joined_at, invited_by)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(projectId, userId, role, now, invitedBy ?? null);

    return {
      projectId,
      userId,
      role,
      permissions: null,
      joinedAt: now,
      invitedBy: invitedBy ?? null,
    };
  }

  /**
   * Remove a member from a project
   */
  static removeMember(
    rootDb: Database,
    projectId: string,
    userId: string
  ): void {
    const project = this.getByIdOrThrow(rootDb, projectId);

    // Cannot remove the owner
    if (project.ownerId === userId) {
      throw new ForbiddenError("Cannot remove the project owner");
    }

    const member = rootDb
      .prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, userId) as ProjectMemberRow | undefined;

    if (!member) {
      throw new NotFoundError("ProjectMember", `${projectId}/${userId}`);
    }

    rootDb.prepare(
      "DELETE FROM project_members WHERE project_id = ? AND user_id = ?"
    ).run(projectId, userId);
  }

  /**
   * Update a member's role
   */
  static updateMemberRole(
    rootDb: Database,
    projectId: string,
    userId: string,
    role: ProjectRole
  ): ProjectMember {
    const project = this.getByIdOrThrow(rootDb, projectId);

    // Cannot change owner's role
    if (project.ownerId === userId && role !== "owner") {
      throw new ForbiddenError("Cannot change the project owner's role");
    }

    const member = rootDb
      .prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, userId) as ProjectMemberRow | undefined;

    if (!member) {
      throw new NotFoundError("ProjectMember", `${projectId}/${userId}`);
    }

    rootDb.prepare(
      "UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?"
    ).run(role, projectId, userId);

    return {
      ...rowToProjectMember(member),
      role,
    };
  }

  /**
   * List members of a project
   */
  static listMembers(
    rootDb: Database,
    projectId: string
  ): ProjectMember[] {
    this.getByIdOrThrow(rootDb, projectId);

    const rows = rootDb
      .prepare("SELECT * FROM project_members WHERE project_id = ? ORDER BY joined_at ASC")
      .all(projectId) as ProjectMemberRow[];

    return rows.map(rowToProjectMember);
  }

  /**
   * Get a specific member
   */
  static getMember(
    rootDb: Database,
    projectId: string,
    userId: string
  ): ProjectMember | null {
    const row = rootDb
      .prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, userId) as ProjectMemberRow | undefined;

    if (!row) return null;
    return rowToProjectMember(row);
  }

  /**
   * Check if a user has access to a project
   */
  static hasAccess(
    rootDb: Database,
    projectId: string,
    userId: string
  ): boolean {
    const project = this.getById(rootDb, projectId);
    if (!project) return false;
    if (project.ownerId === userId) return true;

    const member = this.getMember(rootDb, projectId, userId);
    return member !== null;
  }

  /**
   * Check if a user has a specific role or higher
   */
  static hasRole(
    rootDb: Database,
    projectId: string,
    userId: string,
    minRole: ProjectRole
  ): boolean {
    const roleHierarchy: Record<ProjectRole, number> = {
      viewer: 0,
      member: 1,
      admin: 2,
      owner: 3,
    };

    const project = this.getById(rootDb, projectId);
    if (!project) return false;

    // Owner always has highest role
    if (project.ownerId === userId) return true;

    const member = this.getMember(rootDb, projectId, userId);
    if (!member) return false;

    return roleHierarchy[member.role] >= roleHierarchy[minRole];
  }
}
