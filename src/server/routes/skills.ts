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
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SkillService } from "@/services/skills.ts";
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

export { skills };
