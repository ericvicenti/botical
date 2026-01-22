# Project Workspace Management

## Overview

Projects are the fundamental organizational unit in Iris. Each project:
- Has its own SQLite database
- Contains isolated sessions, agents, and files
- Can be shared with multiple users
- Supports different types (local filesystem, git repository, remote)

## Project Types

### Local Projects
- Tied to a filesystem directory
- File operations work directly on disk
- Best for development workflows

### Git Projects
- Associated with a git repository
- Tracks git state (branch, commits, diffs)
- Unique ID derived from root commit hash

### Remote Projects
- Files stored only in Iris database
- Not tied to local filesystem
- Good for cloud-only workflows

## Project Service

```typescript
// src/services/projects.ts
import { z } from 'zod';
import { DatabaseManager } from '../database';
import { EventBus } from '../bus';
import { generateId } from '../utils/id';

export const ProjectCreate = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(['local', 'git', 'remote']).default('local'),
  path: z.string().optional(),  // For local/git
  gitRemote: z.string().optional(),  // For git
  settings: z.record(z.unknown()).default({}),
});

export const ProjectUpdate = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  icon: z.object({
    url: z.string().optional(),
    color: z.string().optional(),
  }).optional(),
});

export class ProjectService {
  // Create a new project
  static async create(
    userId: string,
    input: z.infer<typeof ProjectCreate>
  ): Promise<Project> {
    const rootDb = DatabaseManager.getRootDb();
    const id = await this.generateProjectId(input);

    // Create project record in root DB
    const project = {
      id,
      name: input.name,
      description: input.description,
      type: input.type,
      path: input.path,
      gitRemote: input.gitRemote,
      ownerId: userId,
      settings: JSON.stringify(input.settings),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    rootDb.prepare(`
      INSERT INTO projects (id, name, description, type, path, git_remote, owner_id, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id,
      project.name,
      project.description,
      project.type,
      project.path,
      project.gitRemote,
      project.ownerId,
      project.settings,
      project.createdAt,
      project.updatedAt
    );

    // Add owner as member
    rootDb.prepare(`
      INSERT INTO project_members (project_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `).run(project.id, userId, Date.now());

    // Initialize project database
    await DatabaseManager.initializeProjectDb(id);

    // Emit event
    EventBus.publishGlobal({
      type: 'project.created',
      payload: { project },
    });

    return this.toProject(project);
  }

  // Generate project ID
  private static async generateProjectId(
    input: z.infer<typeof ProjectCreate>
  ): Promise<string> {
    // For git projects, use root commit hash
    if (input.type === 'git' && input.path) {
      const gitId = await this.getGitRootCommit(input.path);
      if (gitId) return gitId;
    }

    // For other projects, generate UUID
    return generateId('project');
  }

  // Get git root commit hash
  private static async getGitRootCommit(path: string): Promise<string | null> {
    try {
      const result = await $`git rev-list --max-parents=0 --all`
        .cwd(path)
        .quiet()
        .nothrow();

      if (result.exitCode !== 0) return null;

      const commits = result.stdout.toString()
        .split('\n')
        .filter(Boolean)
        .sort();

      return commits[0] || null;
    } catch {
      return null;
    }
  }

  // List projects for a user
  static async listForUser(userId: string): Promise<Project[]> {
    const rootDb = DatabaseManager.getRootDb();

    const rows = rootDb.prepare(`
      SELECT p.*, pm.role
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ? AND p.archived_at IS NULL
      ORDER BY p.updated_at DESC
    `).all(userId);

    return rows.map(row => this.toProject(row));
  }

  // Get project with access check
  static async getWithAccess(
    projectId: string,
    userId: string
  ): Promise<ProjectWithRole | null> {
    const rootDb = DatabaseManager.getRootDb();

    const row = rootDb.prepare(`
      SELECT p.*, pm.role
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = ? AND pm.user_id = ? AND p.archived_at IS NULL
    `).get(projectId, userId);

    if (!row) return null;

    return {
      ...this.toProject(row),
      role: row.role,
    };
  }

  // Update project
  static async update(
    projectId: string,
    input: z.infer<typeof ProjectUpdate>
  ): Promise<Project> {
    const rootDb = DatabaseManager.getRootDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description);
    }
    if (input.settings !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(input.settings));
    }
    if (input.icon !== undefined) {
      updates.push('icon_url = ?');
      values.push(input.icon.url);
      updates.push('color = ?');
      values.push(input.icon.color);
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(projectId);

    rootDb.prepare(`
      UPDATE projects SET ${updates.join(', ')} WHERE id = ?
    `).run(...values);

    const project = await this.get(projectId);

    EventBus.publishGlobal({
      type: 'project.updated',
      payload: { project },
    });

    return project!;
  }

  // Archive project (soft delete)
  static async archive(projectId: string): Promise<void> {
    const rootDb = DatabaseManager.getRootDb();

    rootDb.prepare(`
      UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?
    `).run(Date.now(), Date.now(), projectId);

    // Close database connection
    DatabaseManager.closeProject(projectId);

    EventBus.publishGlobal({
      type: 'project.archived',
      payload: { projectId },
    });
  }

  // Get filesystem path for project
  static async getPath(projectId: string): Promise<string> {
    const project = await this.get(projectId);
    if (!project) throw new Error('Project not found');

    if (project.type === 'remote') {
      // Return virtual filesystem path
      return DatabaseManager.getProjectFilesPath(projectId);
    }

    return project.path || '/';
  }
}
```

## Project Instance Pattern

Similar to OpenCode, we use an instance pattern to manage project context:

```typescript
// src/project/instance.ts
import { AsyncLocalStorage } from 'async_hooks';
import { DatabaseManager } from '../database';
import { ProjectService } from '../services/projects';

interface ProjectContext {
  projectId: string;
  project: Project;
  db: Database;
}

const storage = new AsyncLocalStorage<ProjectContext>();
const instances = new Map<string, Promise<ProjectContext>>();

export const ProjectInstance = {
  // Run code within a project context
  async run<T>(projectId: string, fn: () => T | Promise<T>): Promise<T> {
    let contextPromise = instances.get(projectId);

    if (!contextPromise) {
      contextPromise = this.createContext(projectId);
      instances.set(projectId, contextPromise);
    }

    const context = await contextPromise;
    return storage.run(context, fn);
  },

  // Create project context
  private async createContext(projectId: string): Promise<ProjectContext> {
    const project = await ProjectService.get(projectId);
    if (!project) throw new Error('Project not found');

    const db = DatabaseManager.getProjectDb(projectId);

    return { projectId, project, db };
  },

  // Get current project ID
  get projectId(): string {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('Not in project context');
    return ctx.projectId;
  },

  // Get current project
  get project(): Project {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('Not in project context');
    return ctx.project;
  },

  // Get current project database
  get db(): Database {
    const ctx = storage.getStore();
    if (!ctx) throw new Error('Not in project context');
    return ctx.db;
  },

  // Dispose project instance
  async dispose(projectId: string): Promise<void> {
    instances.delete(projectId);
    DatabaseManager.closeProject(projectId);
  },

  // Dispose all instances
  async disposeAll(): Promise<void> {
    for (const projectId of instances.keys()) {
      await this.dispose(projectId);
    }
  },
};
```

## Project State Management

```typescript
// src/project/state.ts
type StateFactory<T> = () => T | Promise<T>;
type StateDisposer<T> = (state: T) => void | Promise<void>;

const stateStore = new Map<string, Map<StateFactory<any>, any>>();

export function createProjectState<T>(
  factory: StateFactory<T>,
  dispose?: StateDisposer<T>
): () => T {
  return () => {
    const projectId = ProjectInstance.projectId;
    let projectStates = stateStore.get(projectId);

    if (!projectStates) {
      projectStates = new Map();
      stateStore.set(projectId, projectStates);
    }

    if (!projectStates.has(factory)) {
      const state = factory();
      projectStates.set(factory, state);

      // Register disposer if provided
      if (dispose) {
        registerDisposer(projectId, async () => {
          const s = await state;
          await dispose(s);
        });
      }
    }

    return projectStates.get(factory);
  };
}

// Example usage
const useToolRegistry = createProjectState(
  () => new ToolRegistry(),
  (registry) => registry.dispose()
);

const useAgentRegistry = createProjectState(
  () => new AgentRegistry()
);
```

## Project Members & Permissions

```typescript
// src/services/project-members.ts
import { z } from 'zod';

export const ProjectRole = z.enum(['owner', 'admin', 'member', 'viewer']);
export type ProjectRole = z.infer<typeof ProjectRole>;

export const RolePermissions: Record<ProjectRole, string[]> = {
  owner: ['*'],  // Everything
  admin: [
    'session.create', 'session.delete',
    'agent.create', 'agent.update', 'agent.delete',
    'tool.create', 'tool.update', 'tool.delete',
    'file.write', 'file.delete',
    'member.invite', 'member.remove',
  ],
  member: [
    'session.create',
    'file.write',
    'agent.use', 'tool.use',
  ],
  viewer: [
    'session.read',
    'file.read',
  ],
};

export class ProjectMemberService {
  // Invite user to project
  static async invite(
    projectId: string,
    inviterId: string,
    email: string,
    role: ProjectRole
  ): Promise<ProjectInvite> {
    // Check inviter has permission
    const inviterRole = await this.getRole(projectId, inviterId);
    if (!this.canInvite(inviterRole, role)) {
      throw new ForbiddenError('Cannot invite user with this role');
    }

    // Find or create pending invite
    const rootDb = DatabaseManager.getRootDb();

    // Check if user exists
    const user = rootDb.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(email);

    if (user) {
      // Direct add
      rootDb.prepare(`
        INSERT INTO project_members (project_id, user_id, role, joined_at, invited_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(projectId, user.id, role, Date.now(), inviterId);

      return { type: 'added', userId: user.id };
    }

    // Create invite
    const invite = {
      id: generateId('invite'),
      projectId,
      email,
      role,
      invitedBy: inviterId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    rootDb.prepare(`
      INSERT INTO project_invites (id, project_id, email, role, invited_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invite.id, invite.projectId, invite.email, invite.role, invite.invitedBy, invite.createdAt, invite.expiresAt);

    return { type: 'invited', inviteId: invite.id };
  }

  // Check if user has permission
  static async hasPermission(
    projectId: string,
    userId: string,
    permission: string
  ): Promise<boolean> {
    const role = await this.getRole(projectId, userId);
    if (!role) return false;

    const permissions = RolePermissions[role];
    return permissions.includes('*') || permissions.includes(permission);
  }

  // Get user's role in project
  static async getRole(
    projectId: string,
    userId: string
  ): Promise<ProjectRole | null> {
    const rootDb = DatabaseManager.getRootDb();

    const row = rootDb.prepare(`
      SELECT role FROM project_members
      WHERE project_id = ? AND user_id = ?
    `).get(projectId, userId);

    return row?.role || null;
  }

  // Check if role can invite another role
  private static canInvite(inviterRole: ProjectRole | null, targetRole: ProjectRole): boolean {
    if (!inviterRole) return false;

    const hierarchy: ProjectRole[] = ['viewer', 'member', 'admin', 'owner'];
    const inviterIndex = hierarchy.indexOf(inviterRole);
    const targetIndex = hierarchy.indexOf(targetRole);

    // Can only invite roles lower than yours
    return inviterIndex > targetIndex;
  }
}
```

## Project Discovery

```typescript
// src/services/project-discovery.ts
import path from 'path';
import fs from 'fs/promises';

export class ProjectDiscovery {
  // Discover project from a directory path
  static async fromDirectory(directory: string): Promise<ProjectInfo | null> {
    // Check for .git directory
    const gitDir = await this.findGitRoot(directory);

    if (gitDir) {
      return {
        type: 'git',
        path: gitDir,
        name: path.basename(gitDir),
        id: await this.getGitRootCommit(gitDir),
      };
    }

    // Check for existing Iris project marker
    const irisMarker = path.join(directory, '.iris', 'project.json');
    if (await this.exists(irisMarker)) {
      const config = JSON.parse(await fs.readFile(irisMarker, 'utf-8'));
      return {
        type: 'local',
        path: directory,
        name: config.name || path.basename(directory),
        id: config.id,
      };
    }

    // Plain directory
    return {
      type: 'local',
      path: directory,
      name: path.basename(directory),
      id: null, // Will be generated
    };
  }

  // Find git root by walking up
  private static async findGitRoot(start: string): Promise<string | null> {
    let current = path.resolve(start);

    while (current !== '/') {
      const gitPath = path.join(current, '.git');
      if (await this.exists(gitPath)) {
        return current;
      }
      current = path.dirname(current);
    }

    return null;
  }

  // Get git root commit
  private static async getGitRootCommit(path: string): Promise<string | null> {
    try {
      const result = await $`git rev-list --max-parents=0 --all`
        .cwd(path)
        .quiet()
        .nothrow();

      const commits = result.stdout.toString()
        .split('\n')
        .filter(Boolean)
        .sort();

      return commits[0] || null;
    } catch {
      return null;
    }
  }

  private static async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
```

## Project Settings

```typescript
// src/schemas/project-settings.ts
import { z } from 'zod';

export const ProjectSettings = z.object({
  // Default model for new sessions
  defaultModel: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }).optional(),

  // Default agent
  defaultAgent: z.string().optional(),

  // File patterns to ignore
  ignorePatterns: z.array(z.string()).default([
    'node_modules/**',
    '.git/**',
    '*.lock',
    'dist/**',
    'build/**',
  ]),

  // Auto-formatting settings
  formatting: z.object({
    enabled: z.boolean().default(true),
    onSave: z.boolean().default(true),
  }).default({}),

  // Collaboration settings
  collaboration: z.object({
    allowAnonymousView: z.boolean().default(false),
    requireApprovalForWrites: z.boolean().default(false),
  }).default({}),

  // Feature flags
  features: z.object({
    subagents: z.boolean().default(true),
    customTools: z.boolean().default(true),
    fileVersioning: z.boolean().default(true),
  }).default({}),
});

export type ProjectSettings = z.infer<typeof ProjectSettings>;
```
