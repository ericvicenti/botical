/**
 * Git API Routes
 *
 * REST API endpoints for git version control operations.
 *
 * Project-scoped endpoints:
 * - GET /api/projects/:projectId/git/status - Working tree status
 * - GET /api/projects/:projectId/git/branches - List branches
 * - POST /api/projects/:projectId/git/branches - Create branch
 * - POST /api/projects/:projectId/git/checkout - Switch branch
 * - DELETE /api/projects/:projectId/git/branches/:name - Delete branch
 * - GET /api/projects/:projectId/git/log - Recent commits
 * - POST /api/projects/:projectId/git/commit - Create commit
 * - GET /api/projects/:projectId/git/diff - Diff for working tree
 * - GET /api/projects/:projectId/git/commits/:hash - Single commit details
 * - GET /api/projects/:projectId/git/commits/:hash/diff - Commit diff
 * - POST /api/projects/:projectId/git/push - Push to remote
 * - POST /api/projects/:projectId/git/pull - Pull from remote
 * - POST /api/projects/:projectId/git/fetch - Fetch from remote
 * - GET /api/projects/:projectId/git/remotes - List remotes
 * - POST /api/projects/:projectId/git/discard - Discard changes
 *
 * Clone endpoint:
 * - POST /api/projects/clone - Clone from URL and create project
 *
 * See: docs/implementation-plan/12-git-integration.md
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { GitService } from "@/services/git.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import { Config } from "@/config/index.ts";

// ============================================
// PROJECT-SCOPED GIT ROUTES
// ============================================

export const projectGit = new Hono();

/**
 * Helper to get project path
 */
async function getProjectPath(projectId: string): Promise<string> {
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);

  if (!project.path) {
    throw new ValidationError("Project does not have a workspace path");
  }

  return project.path;
}

/**
 * GET /api/projects/:projectId/git/status
 * Get working tree status
 */
projectGit.get("/:projectId/git/status", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);

  const status = await GitService.status(projectPath);
  return c.json({ data: status });
});

/**
 * GET /api/projects/:projectId/git/branches
 * List all branches
 */
projectGit.get("/:projectId/git/branches", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);

  const branches = await GitService.branches(projectPath);
  return c.json({ data: branches });
});

/**
 * POST /api/projects/:projectId/git/branches
 * Create a new branch
 */
const CreateBranchSchema = z.object({
  name: z.string().min(1),
  from: z.string().optional(),
});

projectGit.post("/:projectId/git/branches", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json();

  const result = CreateBranchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  const branch = await GitService.createBranch(
    projectPath,
    result.data.name,
    result.data.from
  );
  return c.json({ data: branch }, 201);
});

/**
 * POST /api/projects/:projectId/git/checkout
 * Switch to a branch
 */
const CheckoutSchema = z.object({
  branch: z.string().min(1),
});

projectGit.post("/:projectId/git/checkout", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json();

  const result = CheckoutSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  await GitService.checkout(projectPath, result.data.branch);
  const status = await GitService.status(projectPath);
  return c.json({ data: { branch: result.data.branch, status } });
});

/**
 * DELETE /api/projects/:projectId/git/branches/:name
 * Delete a branch
 */
projectGit.delete("/:projectId/git/branches/:name", async (c) => {
  const projectId = c.req.param("projectId");
  const branchName = c.req.param("name");
  const projectPath = await getProjectPath(projectId);
  const force = c.req.query("force") === "true";

  await GitService.deleteBranch(projectPath, branchName, force);
  return c.json({ data: { deleted: branchName } });
});

/**
 * GET /api/projects/:projectId/git/log
 * Get recent commits
 */
const LogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  file: z.string().optional(),
});

projectGit.get("/:projectId/git/log", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);

  const query = LogQuerySchema.parse({
    limit: c.req.query("limit"),
    file: c.req.query("file"),
  });

  const commits = await GitService.log(projectPath, {
    limit: query.limit,
    file: query.file,
  });
  return c.json({ data: commits });
});

/**
 * POST /api/projects/:projectId/git/commit
 * Create a commit (auto-stages all changes)
 */
const CommitSchema = z.object({
  message: z.string().min(1),
});

projectGit.post("/:projectId/git/commit", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json();

  const result = CommitSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  const commitResult = await GitService.commit(projectPath, result.data.message);
  return c.json({ data: commitResult }, 201);
});

/**
 * GET /api/projects/:projectId/git/diff
 * Get diff for working tree
 */
projectGit.get("/:projectId/git/diff", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const file = c.req.query("file");

  const diff = await GitService.diff(projectPath, { file });
  return c.json({ data: { diff } });
});

/**
 * GET /api/projects/:projectId/git/commits/:hash
 * Get single commit details
 */
projectGit.get("/:projectId/git/commits/:hash", async (c) => {
  const projectId = c.req.param("projectId");
  const hash = c.req.param("hash");
  const projectPath = await getProjectPath(projectId);

  const commit = await GitService.getCommit(projectPath, hash);
  if (!commit) {
    throw new NotFoundError("Commit", hash);
  }
  return c.json({ data: commit });
});

/**
 * GET /api/projects/:projectId/git/commits/:hash/diff
 * Get diff for a commit
 */
projectGit.get("/:projectId/git/commits/:hash/diff", async (c) => {
  const projectId = c.req.param("projectId");
  const hash = c.req.param("hash");
  const projectPath = await getProjectPath(projectId);
  const file = c.req.query("file");

  let diff: string;
  if (file) {
    diff = await GitService.commitFileDiff(projectPath, hash, file);
  } else {
    diff = await GitService.commitDiff(projectPath, hash);
  }
  return c.json({ data: { diff } });
});

/**
 * POST /api/projects/:projectId/git/push
 * Push to remote
 */
const PushSchema = z.object({
  remote: z.string().default("origin"),
  branch: z.string().optional(),
  setUpstream: z.boolean().default(false),
});

projectGit.post("/:projectId/git/push", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json().catch(() => ({}));

  const result = PushSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  await GitService.push(
    projectPath,
    result.data.remote,
    result.data.branch,
    result.data.setUpstream
  );
  return c.json({ data: { pushed: true } });
});

/**
 * POST /api/projects/:projectId/git/pull
 * Pull from remote
 */
const PullSchema = z.object({
  remote: z.string().default("origin"),
  branch: z.string().optional(),
});

projectGit.post("/:projectId/git/pull", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json().catch(() => ({}));

  const result = PullSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  const pullResult = await GitService.pull(
    projectPath,
    result.data.remote,
    result.data.branch
  );
  return c.json({ data: pullResult });
});

/**
 * POST /api/projects/:projectId/git/fetch
 * Fetch from remote
 */
const FetchSchema = z.object({
  remote: z.string().default("origin"),
});

projectGit.post("/:projectId/git/fetch", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json().catch(() => ({}));

  const result = FetchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  await GitService.fetch(projectPath, result.data.remote);
  return c.json({ data: { fetched: true } });
});

/**
 * GET /api/projects/:projectId/git/remotes
 * List remotes
 */
projectGit.get("/:projectId/git/remotes", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);

  const remotes = await GitService.remotes(projectPath);
  return c.json({ data: remotes });
});

/**
 * POST /api/projects/:projectId/git/discard
 * Discard changes
 */
const DiscardSchema = z.object({
  file: z.string().optional(),
  all: z.boolean().default(false),
});

projectGit.post("/:projectId/git/discard", async (c) => {
  const projectId = c.req.param("projectId");
  const projectPath = await getProjectPath(projectId);
  const body = await c.req.json();

  const result = DiscardSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  if (result.data.all) {
    await GitService.discardAllChanges(projectPath);
  } else if (result.data.file) {
    await GitService.discardChanges(projectPath, result.data.file);
  } else {
    throw new ValidationError("Must specify file or all");
  }

  return c.json({ data: { discarded: true } });
});

// ============================================
// CLONE ROUTE
// ============================================

export const gitClone = new Hono();

/**
 * POST /api/projects/clone
 * Clone a repository and create a project
 */
const CloneSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  path: z.string().optional(),
  branch: z.string().optional(),
  ownerId: z.string().min(1),
});

gitClone.post("/clone", async (c) => {
  const body = await c.req.json();

  const result = CloneSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input"
    );
  }

  // Clone the repository
  const cloneResult = await GitService.clone({
    url: result.data.url,
    path: result.data.path,
    branch: result.data.branch,
  });

  // Create a project pointing to the cloned repo
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.create(rootDb, {
    name: result.data.name || cloneResult.name,
    ownerId: result.data.ownerId,
    type: "local",
    path: cloneResult.path,
    gitRemote: result.data.url,
  });

  return c.json({
    data: {
      project,
      clone: cloneResult,
    },
  }, 201);
});
