/**
 * Skills API Routes
 *
 * REST API endpoints for discovering and reading skills from project workspaces.
 * Skills are stored in the `skills/` directory at the project root.
 *
 * Endpoints:
 * - GET /api/projects/:projectId/skills - List all skills (metadata only)
 * - GET /api/projects/:projectId/skills/:name - Get skill with instructions
 * - GET /api/projects/:projectId/skills/:name/resources/* - Get resource content
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: https://agentskills.io/specification
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SkillService } from "@/services/skills.ts";
import { GitHubSkillService } from "@/services/github-skills.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";

const skills = new Hono();

/**
 * GET /api/projects/:projectId/skills
 * List all skills for a project (metadata only)
 */
skills.get("/:projectId/skills", async (c) => {
  const projectId = c.req.param("projectId");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    return c.json({
      data: [],
      meta: { total: 0, hasSkillsDir: false },
    });
  }

  const skillsList = SkillService.list(project.path);
  const hasSkillsDir = SkillService.hasSkillsDir(project.path);

  return c.json({
    data: skillsList,
    meta: {
      total: skillsList.length,
      hasSkillsDir,
    },
  });
});

/**
 * GET /api/projects/:projectId/skills/:name
 * Get a skill with full instructions
 */
skills.get("/:projectId/skills/:name", async (c) => {
  const projectId = c.req.param("projectId");
  const skillName = c.req.param("name");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new NotFoundError("Skill", skillName);
  }

  const skill = SkillService.getByName(project.path, skillName);
  if (!skill) {
    throw new NotFoundError("Skill", skillName);
  }

  // Include resource list
  const resources = SkillService.listResources(project.path, skillName);

  return c.json({
    data: {
      ...skill,
      resources,
    },
  });
});

/**
 * GET /api/projects/:projectId/skills/:name/resources/*
 * Get a skill resource content
 */
skills.get("/:projectId/skills/:name/resources/*", async (c) => {
  const projectId = c.req.param("projectId");
  const skillName = c.req.param("name");

  // Extract the resource path from the URL after /resources/
  const fullPath = c.req.path;
  const resourcesMarker = `/skills/${skillName}/resources/`;
  const markerIndex = fullPath.indexOf(resourcesMarker);
  if (markerIndex === -1) {
    throw new ValidationError("Invalid resource path");
  }
  const resourcePath = fullPath.substring(markerIndex + resourcesMarker.length);

  if (!resourcePath) {
    throw new ValidationError("resource path is required");
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new NotFoundError("SkillResource", resourcePath);
  }

  const content = SkillService.getResource(project.path, skillName, resourcePath);
  if (content === null) {
    throw new NotFoundError("SkillResource", resourcePath);
  }

  return c.json({
    data: {
      path: resourcePath,
      content,
    },
  });
});

// ============================================================================
// GitHub Skills Installation Endpoints
// ============================================================================

const InstallSkillSchema = z.object({
  repo: z.string().min(1),
  ref: z.string().optional(),
});

const UpdateSkillSchema = z.object({
  ref: z.string().optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/projects/:projectId/skills/installed
 * List all installed GitHub skills
 */
skills.get("/:projectId/skills/installed", async (c) => {
  const projectId = c.req.param("projectId");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    return c.json({
      data: [],
      meta: { total: 0 },
    });
  }

  const installed = GitHubSkillService.listInstalled(project.path);

  return c.json({
    data: installed,
    meta: { total: installed.length },
  });
});

/**
 * POST /api/projects/:projectId/skills/install
 * Install skills from a GitHub repository
 */
skills.post("/:projectId/skills/install", async (c) => {
  const projectId = c.req.param("projectId");

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no local path");
  }

  const body = await c.req.json();
  const parsed = InstallSkillSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const { repo, ref } = parsed.data;

  if (!GitHubSkillService.isValidRepo(repo)) {
    throw new ValidationError(
      `Invalid repository format: ${repo}. Use owner/repo format.`
    );
  }

  const result = await GitHubSkillService.install(project.path, repo, ref);

  if (!result.success) {
    return c.json(
      {
        error: result.error,
        data: null,
      },
      400
    );
  }

  return c.json(
    {
      data: {
        repo,
        ref,
        skills: result.skills,
      },
    },
    201
  );
});

/**
 * PUT /api/projects/:projectId/skills/installed/*
 * Update an installed skill (toggle enabled or update ref)
 *
 * The repo is in the URL path as owner/repo
 */
skills.put("/:projectId/skills/installed/*", async (c) => {
  const projectId = c.req.param("projectId");

  // Extract repo from wildcard path
  const fullPath = c.req.path;
  const marker = `/skills/installed/`;
  const markerIndex = fullPath.indexOf(marker);
  if (markerIndex === -1) {
    throw new ValidationError("Invalid path");
  }
  const repo = decodeURIComponent(
    fullPath.substring(markerIndex + marker.length)
  );

  if (!repo || !GitHubSkillService.isValidRepo(repo)) {
    throw new ValidationError(
      `Invalid repository format: ${repo}. Use owner/repo format.`
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no local path");
  }

  const body = await c.req.json();
  const parsed = UpdateSkillSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const { ref, enabled } = parsed.data;

  // If ref provided, update to new ref (re-download)
  if (ref !== undefined) {
    const result = await GitHubSkillService.update(project.path, repo, ref);
    if (!result.success) {
      return c.json(
        {
          error: result.error,
          data: null,
        },
        400
      );
    }

    return c.json({
      data: {
        repo,
        ref,
        skills: result.skills,
      },
    });
  }

  // If enabled provided, toggle enabled state
  if (enabled !== undefined) {
    const success = GitHubSkillService.setEnabled(project.path, repo, enabled);
    if (!success) {
      throw new NotFoundError("InstalledSkill", repo);
    }

    return c.json({
      data: {
        repo,
        enabled,
      },
    });
  }

  throw new ValidationError("Either ref or enabled must be provided");
});

/**
 * DELETE /api/projects/:projectId/skills/installed/*
 * Uninstall a skill repository
 *
 * The repo is in the URL path as owner/repo
 */
skills.delete("/:projectId/skills/installed/*", async (c) => {
  const projectId = c.req.param("projectId");

  // Extract repo from wildcard path
  const fullPath = c.req.path;
  const marker = `/skills/installed/`;
  const markerIndex = fullPath.indexOf(marker);
  if (markerIndex === -1) {
    throw new ValidationError("Invalid path");
  }
  const repo = decodeURIComponent(
    fullPath.substring(markerIndex + marker.length)
  );

  if (!repo || !GitHubSkillService.isValidRepo(repo)) {
    throw new ValidationError(
      `Invalid repository format: ${repo}. Use owner/repo format.`
    );
  }

  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getById(rootDb, projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }

  if (!project.path) {
    throw new ValidationError("Project has no local path");
  }

  const success = GitHubSkillService.uninstall(project.path, repo);
  if (!success) {
    throw new NotFoundError("InstalledSkill", repo);
  }

  return c.json({
    data: { repo, uninstalled: true },
  });
});

// ============================================================================
// Skills Directory Search (skills.sh proxy)
// ============================================================================

interface SkillsShSearchResult {
  id: string;
  name: string;
  installs: number;
  topSource: string;
}

interface SkillsShSearchResponse {
  query: string;
  searchType: string;
  skills: SkillsShSearchResult[];
  count: number;
}

/**
 * GET /api/skills/search
 * Search the skills.sh directory for available skills
 *
 * This proxies requests to https://skills.sh/api/search to avoid CORS issues.
 */
skills.get("/search", async (c) => {
  const query = c.req.query("q");

  if (!query || !query.trim()) {
    throw new ValidationError("Search query is required");
  }

  try {
    const response = await fetch(
      `https://skills.sh/api/search?q=${encodeURIComponent(query.trim())}`
    );

    if (!response.ok) {
      throw new Error(`skills.sh API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as SkillsShSearchResponse;

    return c.json({
      data: data.skills || [],
      meta: {
        query: data.query,
        count: data.count,
        searchType: data.searchType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json(
      {
        error: `Failed to search skills: ${message}`,
        data: [],
      },
      500
    );
  }
});

export { skills };
